"""In-memory Ma Sói room server. Run with python -m codebase.server."""

import argparse
import asyncio
from contextlib import suppress
from functools import partial
import json
import logging
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
PREPARE_SECONDS = 5
DAWN_STEP_SECONDS = 0.7
HOUSING_SECONDS = 15
LUCKY_DAY_SECONDS = 30
MAP_UPDATE_SECONDS = 0.2
BOT_SEARCH_SECONDS = 0.5
BOT_MARGIN_SECONDS = 0.3
SEND_TIMEOUT = 5
ROOM_IDLE_SECONDS = 300
MAX_PHASE_SECONDS = 600


async def send(connection, message):
    try:
        await asyncio.wait_for(connection.send(json.dumps(message, ensure_ascii=False)), SEND_TIMEOUT)
    except ConnectionClosed:
        pass
    except asyncio.TimeoutError:
        # A client that stops reading must not hold the room lock for everyone else.
        LOGGER.warning("Dropping a WebSocket client that stopped reading.")
        connection.transport.abort()


def clip_text(action):
    if (isinstance(action, dict) and action.get("type") in ("chat", "whisper")
            and isinstance(action.get("text"), str)):
        return {**action, "text": action["text"][:MAX_CHAT_LENGTH]}
    return action


def bot_action(view):
    response = json.loads(answer(json.dumps(view, ensure_ascii=False))["output"])
    return response["action"]


def fallback(options, rng):
    # Pick at random so timed-out bots do not all pile onto the lowest player ID.
    for option in options:
        kind = option["type"]
        targets = option.get("target_ids", [])
        if kind == "pair" and len(targets) >= 2:
            return {"type": kind, "target_ids": rng.sample(targets, 2)}
        if kind == "vote" and targets:
            return {"type": kind, "target_id": rng.choice(targets)}
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
                        if not room.has_connection():
                            self._schedule_idle(room)

    def _schedule_idle(self, room):
        if room.idle_task is not None:
            room.idle_task.cancel()
        room.idle_task = asyncio.create_task(self._expire_idle(room))

    async def _expire_idle(self, room):
        # Keep the room long enough for players to reconnect, then free it.
        await asyncio.sleep(ROOM_IDLE_SECONDS)
        async with room.lock:
            if room.has_connection():
                return
            if room.runner is not None:
                room.runner.cancel()
            self.rooms.discard(room)

    async def _enter(self, connection, message):
        kind = message["type"]
        if kind == "create_room":
            room, member = self.rooms.create(
                message.get("name"), message.get("seats"), connection,
                village_enabled=message.get("village", False),
            )
        elif kind in {"join_room", "rejoin"}:
            room = self.rooms.get(message.get("code"))
            member = None
        else:
            raise RoomError("bad_message", "Cần tạo phòng, vào phòng hoặc vào lại trước.")
        async with room.lock:
            if not self.rooms.is_open(room):
                raise RoomError("room_not_found", "Không tìm thấy phòng.")
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
                pid = member.player_id
                map_phase = room.village is not None and room.village.phase is not None
                if (room.accepting and not map_phase and pid is not None and pid not in room.acted
                        and room.engine.allowed_actions(pid)):
                    room.bot_tasks.append(asyncio.create_task(self._bot_turn(room, room.phase_id, pid)))
                await self._broadcast(room)
                if not room.has_connection():
                    self._schedule_idle(room)
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
        if room.village is not None and room.village.phase is not None:
            await self._village_action(room, member, action, message.get("phase_id"))
            return
        if not isinstance(action, dict):
            result = {"accepted": False, "reason": "invalid_action"}
        elif not room.accepting or engine is None or message.get("phase_id", room.phase_id) != room.phase_id:
            result = {"accepted": False, "reason": "action_not_allowed"}
        elif ((engine.phase.startswith("night_") or engine.phase == "pair")
                and not engine.allowed_actions(member.player_id)):
            # Answer before the engine so its reply cannot name a hidden private turn.
            result = {"accepted": False, "reason": "action_not_allowed"}
        elif action.get("type") in ("chat", "whisper") and (
                not isinstance(action.get("text"), str) or len(action["text"]) > MAX_CHAT_LENGTH):
            result = {"accepted": False, "reason": "invalid_text"}
        else:
            result = engine.submit_action(member.player_id, action)
        await send(member.connection, {"type": "action_result", **result})
        if result["accepted"]:
            # Chat never uses up a turn, and the witch may still have a second potion.
            if action["type"] not in ("chat", "whisper") and (
                    engine.phase != "night_witch" or not engine.allowed_actions(member.player_id)):
                room.acted.add(member.player_id)
            self._check_ready(room)
            await self._broadcast_action(room, member.player_id)

    async def _village_action(self, room, member, action, phase_id):
        now = asyncio.get_running_loop().time()
        if not isinstance(action, dict):
            reason = "invalid_action"
        elif not room.accepting or phase_id != room.phase_id or now >= room.turn_end:
            reason = "action_not_allowed"
        else:
            reason = room.village.act(member.player_id, action, now)
        result = {"type": "action_result", "accepted": reason is None}
        if reason is not None:
            result["reason"] = reason
        await send(member.connection, result)

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
        night_end = None
        housed_round = None
        try:
            while engine.phase != "finished":
                if (room.village is not None and engine.phase in {"pair", "night_wolf"}
                        and housed_round != engine.round):
                    await self._play_village_phase(room, "night_housing", HOUSING_SECONDS)
                    housed_round = engine.round
                async with room.lock:
                    room.phase_id += 1
                    phase_id = room.phase_id
                    room.acted.clear()
                    room.ready.clear()
                    seconds = self._duration(room, engine.phase)
                    now = asyncio.get_running_loop().time()
                    phase = engine.phase
                    night = phase.startswith("night_")
                    private_turn = night or phase == "pair"
                    start = night_end if private_turn and night_end is not None else now
                    opens = start + PREPARE_SECONDS if private_turn else start
                    end = opens + seconds
                    wall_time = time.time()
                    if private_turn:
                        # Cupid's pair turn counts as the first slot of night one, so
                        # waiting players keep a single countdown until dawn.
                        if night_end is None:
                            room.night_phase_id = phase_id
                            slots = FIXED_NIGHT_SLOTS + (phase == "pair")
                            total = (seconds + PREPARE_SECONDS) * slots
                            room.night_deadline = int((wall_time + total) * 1000)
                        night_end = end
                    else:
                        night_end = None
                        room.night_phase_id = room.night_deadline = None
                    room.deadline = int((wall_time + max(0, end - now)) * 1000)
                    if private_turn:
                        room.prepare_deadline = int((wall_time + max(0, opens - now)) * 1000)
                        room.accepting = False
                    else:
                        self._open_turn(room, phase_id, end)
                    await self._broadcast(room)
                if private_turn:
                    await asyncio.sleep(max(0, opens - asyncio.get_running_loop().time()))
                    async with room.lock:
                        self._open_turn(room, phase_id, end)
                        recipients = {pid for pid in room.names if engine.allowed_actions(pid)}
                        await self._broadcast(room, recipients)
                    await asyncio.sleep(max(0, end - asyncio.get_running_loop().time()))
                else:
                    remaining = max(0, end - asyncio.get_running_loop().time())
                    with suppress(asyncio.TimeoutError):
                        await asyncio.wait_for(room.ready.wait(), timeout=remaining)
                async with room.lock:
                    room.accepting = False
                    # Bots whose model call ran out of time still take a legal default.
                    pending = room.names if engine.phase == "pair" else sorted(room.bots - room.acted)
                    for pid in pending:
                        action = fallback(engine.allowed_actions(pid), room.rng)
                        if action is not None:
                            engine.submit_action(pid, action)
                    dawn_views = room.capture_dawn_views() if phase == "night_hunter" else None
                    engine.advance()
                    if phase == "day_vote" and room.village is not None:
                        room.village.held.clear()
                    if dawn_views is not None:
                        room.begin_dawn(dawn_views)
                await self._cancel_bots(room)
                if dawn_views is not None:
                    await self._play_dawn(room)
                    if room.village is not None and engine.phase == "day_discussion":
                        if engine.round % 2 == 0:
                            await self._play_village_phase(room, "lucky_day", LUCKY_DAY_SECONDS)
                        else:
                            async with room.lock:
                                room.village.go_to_square(engine.living_ids())
            async with room.lock:
                room.phase_id += 1
                room.deadline = None
                room.acted.clear()
                await self._broadcast(room)
        except Exception:
            LOGGER.exception("Game loop failed for room %s", room.code)
            async with room.lock:
                room.back_to_lobby()
                await asyncio.gather(*(send(member.connection, {
                    "type": "error", "code": "game_error",
                    "message": "Không thể tiếp tục ván. Phòng đã về phòng chờ.",
                }) for member in room.members.values() if member.connection is not None))
                await self._broadcast(room)
        finally:
            await self._cancel_bots(room)

    def _open_turn(self, room, phase_id, end):
        room.prepare_deadline = None
        room.accepting = True
        room.turn_end = end
        self._check_ready(room)
        room.bot_tasks = [
            asyncio.create_task(self._bot_turn(room, phase_id, pid))
            for pid in sorted(room.bots) if room.engine.allowed_actions(pid)
        ]

    async def _play_dawn(self, room):
        async with room.lock:
            await self._broadcast(room)
        for player_id in room.dawn.survivors:
            await asyncio.sleep(DAWN_STEP_SECONDS)
            async with room.lock:
                room.dawn.arrivals.append(player_id)
                await self._broadcast(room)
        await asyncio.sleep(DAWN_STEP_SECONDS)
        async with room.lock:
            room.dawn = None

    async def _play_village_phase(self, room, phase, seconds):
        loop = asyncio.get_running_loop()
        village = room.village
        async with room.lock:
            alive = room.engine.living_ids()
            if phase == "night_housing":
                village.begin_housing(alive)
            else:
                village.begin_lucky_day(alive)
            room.phase_id += 1
            room.acted.clear()
            room.turn_end = loop.time() + seconds
            room.deadline = int((time.time() + seconds) * 1000)
            room.accepting = True
            village.dirty = False
            await self._broadcast(room)
        next_bot_search = loop.time() + BOT_SEARCH_SECONDS
        while loop.time() < room.turn_end:
            await asyncio.sleep(min(MAP_UPDATE_SECONDS, max(0, room.turn_end - loop.time())))
            async with room.lock:
                now = loop.time()
                if now >= room.turn_end:
                    break
                if phase == "lucky_day" and now >= next_bot_search:
                    village.bots_search(room.bots, now)
                    next_bot_search = now + BOT_SEARCH_SECONDS
                if village.dirty:
                    village.dirty = False
                    await self._broadcast(room)
        async with room.lock:
            room.accepting = False
            if phase == "night_housing":
                village.finish_housing()
            else:
                room.engine.set_day_items(village.finish_lucky_day())

    async def _cancel_bots(self, room):
        tasks, room.bot_tasks = room.bot_tasks, []
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    @staticmethod
    def _worker_done(workers, task):
        workers.discard(task)
        if not task.cancelled():
            task.exception()

    async def _choose(self, room, view, timeout):
        # Keep slow provider requests off the event loop. The cap is per room, so
        # one room with a hung provider cannot starve the bots of every other room.
        if timeout <= 0 or len(room.bot_workers) >= room.seats:
            return None
        task = asyncio.create_task(asyncio.to_thread(self.choose_bot, view))
        room.bot_workers.add(task)
        task.add_done_callback(partial(self._worker_done, room.bot_workers))
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=timeout)
        except Exception:
            return None

    async def _bot_turn(self, room, phase_id, player_id):
        # Leave time for the fallback before the phase closes, even with short timers.
        now = asyncio.get_running_loop().time()
        end = min(now + BOT_TIMEOUT, room.turn_end - BOT_MARGIN_SECONDS)
        for _ in range(2):
            async with room.lock:
                if not room.accepting or room.phase_id != phase_id:
                    return
                view = room.engine.view(player_id)
            action = await self._choose(room, view, end - asyncio.get_running_loop().time())
            async with room.lock:
                if not room.accepting or room.phase_id != phase_id:
                    return
                if action is None:
                    break
                action = clip_text(action)
                if room.engine.submit_action(player_id, action)["accepted"]:
                    room.acted.add(player_id)
                    self._check_ready(room)
                    await self._broadcast_action(room, player_id)
                    return
        async with room.lock:
            if not room.accepting or room.phase_id != phase_id:
                return
            action = fallback(room.engine.allowed_actions(player_id), room.rng)
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
    # Same integer range the lobby accepts in set_timers.
    parser.add_argument("--discussion-seconds", type=int, default=90)
    parser.add_argument("--vote-seconds", type=int, default=30)
    parser.add_argument("--night-seconds", type=int, default=20)
    args = parser.parse_args()
    durations = (args.discussion_seconds, args.vote_seconds, args.night_seconds)
    if any(not 1 <= value <= MAX_PHASE_SECONDS for value in durations):
        parser.error(f"Phase durations must be whole seconds from 1 to {MAX_PHASE_SECONDS}.")
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
