"""In-memory Ma Sói room server. Run with python -m codebase.server."""

import argparse
import asyncio
from contextlib import suppress
import json
import logging
from math import isfinite
from pathlib import Path
from random import Random
import sys
import time
from urllib.parse import urlsplit

from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed

from .game_engine import FIXED_NIGHT_SLOTS
from .rooms import RoomError, Rooms


# The existing terminal app and evaluator load agent.py as a top-level module.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent import answer


LOGGER = logging.getLogger(__name__)
MAX_CHAT_LENGTH = 200
BOT_TIMEOUT = 5


async def send(connection, message):
    try:
        await connection.send(json.dumps(message, ensure_ascii=False))
    except ConnectionClosed:
        pass


def bot_action(view):
    response = json.loads(answer(json.dumps(view, ensure_ascii=False))["output"])
    return response["action"]


def fallback(options):
    for option in options:
        kind = option["type"]
        targets = option.get("target_ids", [])
        if kind == "pair" and len(targets) >= 2:
            return {"type": kind, "target_ids": targets[:2]}
        if kind == "vote" and targets:
            return {"type": kind, "target_id": targets[0]}
    return None


class GameServer:
    def __init__(self, *, rng=None, discussion_seconds=90, vote_seconds=30,
                 night_seconds=20, choose_bot=bot_action):
        self.rooms = Rooms(rng if rng is not None else Random(), {
            "discussion_seconds": discussion_seconds,
            "vote_seconds": vote_seconds,
            "night_seconds": night_seconds,
        })
        self.choose_bot = choose_bot
        self._games = set()
        self._bot_workers = set()

    async def close(self):
        games = tuple(self._games)
        for task in games:
            task.cancel()
        await asyncio.gather(*games, return_exceptions=True)

    async def handle(self, connection):
        if urlsplit(connection.request.path).path != "/ws":
            await connection.close(code=1008, reason="Use /ws")
            return
        room = member = None
        try:
            async for raw in connection:
                try:
                    if not isinstance(raw, str):
                        raise RoomError("bad_message", "Chỉ nhận JSON dạng văn bản.")
                    message = json.loads(raw)
                    if not isinstance(message, dict) or not isinstance(message.get("type"), str):
                        raise RoomError("bad_message", "Tin nhắn phải có trường type.")
                    if room is None:
                        room, member = await self._enter(connection, message)
                    else:
                        async with room.lock:
                            if member.connection is not connection:
                                raise RoomError("bad_token", "Ghế đã được mở ở một kết nối khác.")
                            if await self._dispatch(room, member, message):
                                room = member = None
                except (ValueError, RoomError) as exc:
                    code = exc.code if isinstance(exc, RoomError) else "bad_message"
                    detail = str(exc) if isinstance(exc, RoomError) else "JSON không hợp lệ."
                    await send(connection, {"type": "error", "code": code, "message": detail})
        except ConnectionClosed:
            pass
        finally:
            if room is not None:
                async with room.lock:
                    if member.connection is connection:
                        previous_host = room.host
                        room.disconnect(member)
                        if room.engine is None or room.host is not previous_host:
                            await self._broadcast(room)

    async def _enter(self, connection, message):
        kind = message["type"]
        if kind == "create_room":
            room, member = self.rooms.create(message.get("name"), message.get("seats"), connection)
        elif kind in {"join_room", "rejoin"}:
            room = self.rooms.get(message.get("code"))
            member = None
        else:
            raise RoomError("bad_message", "Cần tạo phòng, vào phòng hoặc vào lại trước.")
        async with room.lock:
            if kind == "join_room":
                member = room.join(message.get("name"), connection)
            if kind == "rejoin":
                member, previous = room.rejoin(message.get("token"), connection)
                if previous is not None and previous is not connection:
                    await send(previous, {
                        "type": "error", "code": "session_replaced",
                        "message": "Ghế của bạn đã chuyển sang tab hoặc thiết bị khác.",
                    })
            await send(connection, room.joined_message(member))
            recipients = {member.player_id} if room.engine is not None else None
            await self._broadcast(room, recipients)
        return room, member

    async def _dispatch(self, room, member, message):
        kind = message["type"]
        if kind == "leave":
            room.leave(member)
            if room.members:
                await self._broadcast(room)
            else:
                if room.runner is not None:
                    room.runner.cancel()
                self.rooms.discard_empty(room)
            return True
        if kind == "set_seats":
            room.set_seats(member, message.get("seats"))
            await self._broadcast(room)
        elif kind == "set_timers":
            room.set_timers(member, message.get("timers"))
            await self._broadcast(room)
        elif kind in {"start", "restart"}:
            if kind == "restart" and room.deadline is not None:
                raise RoomError("game_in_progress", "Đang chốt kết quả ván.")
            room.start(member, restart=kind == "restart")
            room.accepting = False
            room.runner = asyncio.create_task(self._play(room))
            self._games.add(room.runner)
            room.runner.add_done_callback(self._games.discard)
        elif kind == "action":
            await self._human_action(room, member, message)
        else:
            raise RoomError("bad_message", "Lệnh không hợp lệ khi đã ở trong phòng.")
        return False

    async def _human_action(self, room, member, message):
        engine = room.engine
        action = message.get("action")
        if not isinstance(action, dict):
            result = {"accepted": False, "reason": "invalid_action"}
        elif not room.accepting or engine is None or message.get("phase_id", room.phase_id) != room.phase_id:
            result = {"accepted": False, "reason": "action_not_allowed"}
        elif engine.phase.startswith("night_") and not engine.allowed_actions(member.player_id):
            result = {"accepted": False, "reason": "action_not_allowed"}
        elif action.get("type") in ("chat", "whisper") and (
                not isinstance(action.get("text"), str) or len(action["text"]) > MAX_CHAT_LENGTH):
            result = {"accepted": False, "reason": "invalid_text"}
        else:
            result = engine.submit_action(member.player_id, action)
        await send(member.connection, {"type": "action_result", **result})
        if result["accepted"]:
            if engine.phase != "night_witch" or not engine.allowed_actions(member.player_id):
                room.acted.add(member.player_id)
            self._check_ready(room)
            await self._broadcast_action(room, member.player_id)

    def _check_ready(self, room):
        engine = room.engine
        if engine.phase not in {"day_discussion", "finished"} and not engine.phase.startswith("night_") and all(
            pid in room.acted or not engine.allowed_actions(pid) for pid in room.names
        ):
            room.ready.set()

    async def _broadcast_action(self, room, player_id):
        phase = room.engine.phase
        recipients = None
        if phase == "night_wolf":
            recipients = {pid for pid in room.names if room.engine.allowed_actions(pid)}
        elif phase.startswith("night_") or phase == "pair":
            recipients = {player_id}
        await self._broadcast(room, recipients)

    async def _broadcast(self, room, recipients=None):
        deliveries = []
        for member in room.members.values():
            if member.connection is None or (recipients is not None and member.player_id not in recipients):
                continue
            message = room.lobby_message(member) if room.engine is None else room.state_message(member)
            deliveries.append(send(member.connection, message))
        await asyncio.gather(*deliveries)

    def _duration(self, room, phase):
        if phase == "day_discussion":
            return room.timers["discussion_seconds"]
        if phase == "day_vote":
            return room.timers["vote_seconds"]
        return room.timers["night_seconds"]

    async def _play(self, room):
        engine = room.engine
        bot_tasks = []
        night_end = None
        try:
            while engine.phase != "finished":
                async with room.lock:
                    room.phase_id += 1
                    phase_id = room.phase_id
                    room.acted.clear()
                    room.ready.clear()
                    seconds = self._duration(room, engine.phase)
                    now = asyncio.get_running_loop().time()
                    night = engine.phase.startswith("night_")
                    if night and night_end is None:
                        room.night_phase_id = phase_id
                        room.night_deadline = int((time.time() + seconds * FIXED_NIGHT_SLOTS) * 1000)
                    if night:
                        night_end = (night_end if night_end is not None else now) + seconds
                        end = night_end
                    else:
                        night_end = room.night_phase_id = room.night_deadline = None
                        end = now + seconds
                    room.deadline = int((time.time() + max(0, end - now)) * 1000)
                    room.accepting = True
                    self._check_ready(room)
                    bot_tasks = [
                        asyncio.create_task(self._bot_turn(room, phase_id, pid))
                        for pid in sorted(room.bots) if engine.allowed_actions(pid)
                    ]
                    await self._broadcast(room)
                remaining = max(0, end - asyncio.get_running_loop().time())
                if night:
                    await asyncio.sleep(remaining)
                else:
                    with suppress(asyncio.TimeoutError):
                        await asyncio.wait_for(room.ready.wait(), timeout=remaining)
                async with room.lock:
                    room.accepting = False
                    if engine.phase == "pair":
                        for pid in room.names:
                            action = fallback(engine.allowed_actions(pid))
                            if action is not None:
                                engine.submit_action(pid, action)
                    engine.advance()
                await self._cancel_bots(bot_tasks)
                bot_tasks.clear()
            async with room.lock:
                room.phase_id += 1
                room.deadline = None
                room.acted.clear()
                await self._broadcast(room)
        except Exception:
            LOGGER.exception("Game loop failed for room %s", room.code)
            async with room.lock:
                room.accepting = False
                room.failed = True
                await asyncio.gather(*(send(member.connection, {
                    "type": "error", "code": "game_error", "message": "Không thể tiếp tục ván."
                }) for member in room.members.values() if member.connection is not None))
        finally:
            await self._cancel_bots(bot_tasks)

    async def _cancel_bots(self, tasks):
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    def _worker_done(self, task):
        self._bot_workers.discard(task)
        if not task.cancelled():
            task.exception()

    async def _choose(self, view, timeout):
        # Keep slow provider requests off the event loop and bound pending calls.
        if timeout <= 0 or len(self._bot_workers) >= 20:
            return None
        task = asyncio.create_task(asyncio.to_thread(self.choose_bot, view))
        self._bot_workers.add(task)
        task.add_done_callback(self._worker_done)
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=timeout)
        except Exception:
            return None

    async def _bot_turn(self, room, phase_id, player_id):
        end = asyncio.get_running_loop().time() + BOT_TIMEOUT
        for _ in range(2):
            async with room.lock:
                if not room.accepting or room.phase_id != phase_id:
                    return
                view = room.engine.view(player_id)
            action = await self._choose(view, end - asyncio.get_running_loop().time())
            async with room.lock:
                if not room.accepting or room.phase_id != phase_id:
                    return
                if action is None:
                    break
                if room.engine.submit_action(player_id, action)["accepted"]:
                    room.acted.add(player_id)
                    self._check_ready(room)
                    await self._broadcast_action(room, player_id)
                    return
        async with room.lock:
            if not room.accepting or room.phase_id != phase_id:
                return
            action = fallback(room.engine.allowed_actions(player_id))
            if action is not None:
                room.engine.submit_action(player_id, action)
            room.acted.add(player_id)
            self._check_ready(room)
            if action is not None:
                await self._broadcast_action(room, player_id)


async def run(args):
    server = GameServer(discussion_seconds=args.discussion_seconds,
                        vote_seconds=args.vote_seconds, night_seconds=args.night_seconds)
    try:
        async with serve(server.handle, args.host, args.port, max_size=8192):
            print(f"Ma Sói WebSocket: ws://{args.host}:{args.port}/ws", flush=True)
            await asyncio.Future()
    finally:
        await server.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--discussion-seconds", type=float, default=90)
    parser.add_argument("--vote-seconds", type=float, default=30)
    parser.add_argument("--night-seconds", type=float, default=20)
    args = parser.parse_args()
    durations = (args.discussion_seconds, args.vote_seconds, args.night_seconds)
    if any(not isfinite(value) or value <= 0 for value in durations):
        parser.error("Phase durations must be positive.")
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
