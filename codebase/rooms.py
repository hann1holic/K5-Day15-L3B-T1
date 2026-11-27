"""Lobby membership, reconnect tokens, and safe WebSocket message payloads."""

import asyncio
import secrets
from dataclasses import dataclass, field

from .game_engine import GameEngine, deal_roles
from .village import Village


ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
PHASE_TIMERS = ("discussion_seconds", "vote_seconds", "night_seconds")
BOT_NAMES = (
    "An", "Bình", "Chi", "Duy", "Giang", "Hải", "Hạnh", "Hòa", "Hương", "Khôi",
    "Lan", "Linh", "Minh", "Nam", "Ngọc", "Phúc", "Quân", "Sơn", "Thảo", "Trang",
)


class RoomError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def room_code(value):
    if not isinstance(value, str):
        raise RoomError("bad_message", "Mã phòng không hợp lệ.")
    return value.strip().upper()


def seat_count(value):
    if type(value) is not int or not 4 <= value <= 20:
        raise RoomError("bad_message", "Số ghế phải là số nguyên từ 4 đến 20.")
    return value


@dataclass(eq=False)
class Member:
    name: str
    token: str
    connection: object
    player_id: str | None = None


@dataclass
class Dawn:
    previous_views: dict
    deaths: set
    survivors: list
    arrivals: list = field(default_factory=list)


@dataclass
class VoteExecution:
    player_id: str
    round: int
    last_night_deaths: list[str]


class Room:
    def __init__(self, code, seats, rng, timers, *, village_enabled=False):
        self.code = code
        self.timers = timers.copy()
        self.seats = seats
        self.rng = rng
        self.village_enabled = village_enabled
        self.village = None
        self.members = {}
        self.host = None
        self.engine = None
        self.names = {}
        self.bots = set()
        self.lock = asyncio.Lock()
        self.ready = asyncio.Event()
        self.runner = None
        self.phase_id = 0
        self.deadline = None
        self.night_deadline = None
        self.night_phase_id = None
        self.prepare_deadline = None
        self.dawn = None
        self.vote_execution = None
        self.accepting = False
        self.acted = set()
        self.bot_tasks = []
        self.bot_workers = set()
        self.turn_end = 0
        self.idle_task = None

    def join(self, name, connection):
        # A finished match whose results are already out (deadline cleared) accepts newcomers.
        finished = (self.engine is not None and self.engine.phase == "finished"
                    and self.deadline is None)
        if self.engine is not None and not finished:
            raise RoomError("game_in_progress", "Ván đã bắt đầu. Dùng mã vào lại nếu đã có ghế.")
        if len(self.members) >= self.seats:
            raise RoomError("room_full", "Phòng đã đủ chỗ.")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 20:
            raise RoomError("bad_message", "Tên hiển thị cần từ 1 đến 20 ký tự.")
        if any(m.name.casefold() == name.strip().casefold() for m in self.members.values()):
            raise RoomError("name_taken", "Tên này đã có người dùng trong phòng.")
        if finished:
            # Everyone returns to the lobby so the host can start the next match with the newcomer.
            self.back_to_lobby()
        member = Member(name.strip(), secrets.token_urlsafe(24), connection)
        self.members[member.token] = member
        if self.host is None:
            self.host = member
        return member

    def rejoin(self, token, connection):
        if not isinstance(token, str) or token not in self.members:
            raise RoomError("bad_token", "Mã vào lại không hợp lệ.")
        member = self.members[token]
        previous = member.connection
        member.connection = connection
        self._elect_host()
        return member, previous

    def disconnect(self, member):
        member.connection = None
        self._elect_host()

    def leave(self, member):
        self.members.pop(member.token, None)
        self.disconnect(member)
        # An NPC takes over the seat so its role keeps acting for the rest of the match.
        if self.engine is not None and member.player_id is not None:
            self.bots.add(member.player_id)

    def has_connection(self):
        return any(m.connection is not None for m in self.members.values())

    def back_to_lobby(self):
        """Drop a broken match so the host can start a fresh one."""
        self.engine = None
        self.village = None
        self.accepting = False
        self.deadline = self.night_deadline = self.night_phase_id = self.prepare_deadline = None
        self.dawn = None
        self.vote_execution = None
        self.acted.clear()
        self.names = {}
        self.bots = set()
        for member in self.members.values():
            member.player_id = None

    def _elect_host(self):
        if self.host is None or self.host.connection is None:
            self.host = next((m for m in self.members.values() if m.connection is not None), None)

    def require_host(self, member):
        if member is not self.host:
            raise RoomError("not_host", "Chỉ chủ phòng có quyền làm việc này.")

    def set_seats(self, member, seats):
        self.require_host(member)
        if self.engine is not None:
            raise RoomError("game_in_progress", "Chỉ đổi số ghế trong phòng chờ.")
        seats = seat_count(seats)
        if seats < len(self.members):
            raise RoomError("bad_message", "Số ghế nhỏ hơn số người đã vào.")
        self.seats = seats

    def set_timers(self, member, timers):
        self.require_host(member)
        if self.engine is not None:
            raise RoomError("game_in_progress", "Chỉ đổi thời gian trong phòng chờ.")
        if not isinstance(timers, dict) or set(timers) != set(PHASE_TIMERS):
            raise RoomError("bad_message", "Cần nhập thời gian cho cả ba pha.")
        if any(type(value) is not int or not 1 <= value <= 600 for value in timers.values()):
            raise RoomError("bad_message", "Mỗi thời gian phải là số nguyên từ 1 đến 600 giây.")
        self.timers = timers.copy()

    def start(self, member, *, restart=False):
        self.require_host(member)
        if restart:
            if self.engine is None or self.engine.phase != "finished":
                raise RoomError("game_in_progress", "Chỉ chơi lại khi ván đã kết thúc.")
        elif self.engine is not None:
            raise RoomError("game_in_progress", "Ván đã bắt đầu.")

        ids = [f"P{i:02}" for i in range(1, self.seats + 1)]
        self.rng.shuffle(ids)
        roles = deal_roles(self.seats, self.rng)
        players = [{"player_id": pid, "role": role} for pid, role in zip(ids, roles)]
        humans = list(self.members.values())
        self.names = {}
        for person, pid in zip(humans, ids):
            person.player_id = pid
            self.names[pid] = person.name
        bot_ids = ids[len(humans):]
        self.bots = set(bot_ids)
        taken = {person.name.casefold() for person in humans}
        bot_names = [name for name in BOT_NAMES if name.casefold() not in taken]
        self.rng.shuffle(bot_names)
        self.names.update(zip(bot_ids, bot_names))
        self.engine = GameEngine(players, rng=self.rng, fixed_night=True)
        self.village = Village(self.rng) if self.village_enabled else None
        self.night_phase_id = self.night_deadline = self.prepare_deadline = None
        self.dawn = None
        self.vote_execution = None

    def joined_message(self, member):
        return {"type": "joined", "code": self.code, "token": member.token,
                "is_host": member is self.host}

    def lobby_message(self, member):
        return {
            "type": "lobby", "code": self.code, "seats": self.seats,
            "members": [{"name": m.name, "is_host": m is self.host,
                         "connected": m.connection is not None}
                        for m in self.members.values()],
            "bots_on_start": self.seats - len(self.members),
            "timers": self.timers.copy(),
            "village_enabled": self.village_enabled,
            "can_start": member is self.host,
        }

    def capture_dawn_views(self):
        return {member.player_id: self.engine.view(member.player_id)
                for member in self.members.values()}

    def begin_dawn(self, previous_views):
        after = self.engine.view(next(iter(self.names)))
        survivors = sorted(player["player_id"] for player in after["players"] if player["alive"])
        self.dawn = Dawn(previous_views, set(after["last_deaths"]), survivors)
        self.phase_id += 1

    def begin_vote_execution(self, before_vote, player_id, deadline):
        self.vote_execution = VoteExecution(player_id, before_vote["round"], before_vote["last_deaths"])
        self.phase_id += 1
        self.deadline = deadline
        self.acted.clear()

    def state_message(self, member):
        view = self.engine.view(member.player_id)
        deadline = self.deadline
        phase_id = self.phase_id
        acted = member.player_id in self.acted
        reveal = self.engine.reveal()
        if self.dawn is not None:
            view = dict(self.dawn.previous_views[member.player_id])
            view.pop("night_shield", None)
            view.update(
                phase="day_arrival", allowed_actions=[], last_deaths=[], eliminated=None,
                winner=None, arrivals=self.dawn.arrivals[:],
                you_died=member.player_id in self.dawn.deaths,
            )
            if view["you_died"]:
                view["effect"] = {"type": "night_slash", "id": phase_id, "player_id": member.player_id}
            deadline = reveal = None
            acted = False
        elif self.vote_execution is not None:
            execution = self.vote_execution
            view.update(
                phase="day_vote", round=execution.round, allowed_actions=[],
                last_deaths=execution.last_night_deaths[:], winner=None,
                effect={"type": "vote_execution", "id": phase_id, "player_id": execution.player_id},
            )
            reveal = None
            acted = False
        elif self.village is not None and self.village.phase is not None:
            view["phase"] = self.village.phase
            view["allowed_actions"] = self.village.allowed_actions(member.player_id)
            acted = False
        elif view["phase"] == "finished" and deadline is None:
            winner = view["winner"]
            outcome = "draw" if winner == "hoa" else (
                "victory" if view["faction"] == winner else "defeat"
            )
            view["effect"] = {"type": outcome, "id": phase_id, "player_id": member.player_id}
        elif view["phase"].startswith("night_") or view["phase"] == "pair":
            preparing = self.prepare_deadline is not None and bool(view["allowed_actions"])
            if preparing or not self.accepting or not view["allowed_actions"]:
                if preparing:
                    view["next_phase"] = view["phase"]
                    view["phase"] = "night_prepare"
                    deadline = self.prepare_deadline
                else:
                    view["phase"] = "night_wait"
                    deadline = self.night_deadline
                    phase_id = self.night_phase_id
                view["allowed_actions"] = []
                acted = False
        if self.village is not None and self.dawn is None:
            pack = view.get("wolf_pack", ()) if view["phase"] == "night_wolf" else ()
            view["village"] = self.village.view(member.player_id, view["phase"], pack)
        if self.vote_execution is not None or view["phase"] in {
            "night_wait", "night_prepare", "night_housing", "day_arrival",
        }:
            for key in ("strikes_remaining", "wolf_votes", "wolf_pack", "wolf_chat"):
                view.pop(key, None)
        return {
            "type": "state", "code": self.code, "me": member.player_id,
            "names": self.names.copy(), "deadline": deadline, "phase_id": phase_id,
            "is_host": member is self.host, "acted": acted, "view": view, "reveal": reveal,
        }


class Rooms:
    def __init__(self, rng, default_timers):
        self.rng = rng
        self._rooms = {}
        self.default_timers = default_timers.copy()

    def create(self, name, seats, connection, *, village_enabled=False):
        seats = seat_count(seats)
        if type(village_enabled) is not bool:
            raise RoomError("bad_message", "Cấu hình làng cần giá trị true hoặc false.")
        while True:
            code = "".join(secrets.choice(ROOM_ALPHABET) for _ in range(4))
            if code not in self._rooms:
                break
        room = Room(code, seats, self.rng, self.default_timers, village_enabled=village_enabled)
        member = room.join(name, connection)
        self._rooms[code] = room
        return room, member

    def get(self, code):
        room = self._rooms.get(room_code(code))
        if room is None:
            raise RoomError("room_not_found", "Không tìm thấy phòng.")
        return room

    def is_open(self, room):
        return self._rooms.get(room.code) is room

    def discard(self, room):
        if self.is_open(room):
            del self._rooms[room.code]

    def discard_empty(self, room):
        if not room.members:
            self.discard(room)
