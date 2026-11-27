"""Lobby membership, reconnect tokens, and safe WebSocket message payloads."""

import asyncio
import secrets
from dataclasses import dataclass

from .game_engine import GameEngine, deal_roles


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


class Room:
    def __init__(self, code, seats, rng, timers):
        self.code = code
        self.timers = timers.copy()
        self.seats = seats
        self.rng = rng
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
        self.accepting = False
        self.acted = set()

    def join(self, name, connection):
        if self.engine is not None:
            raise RoomError("game_in_progress", "Ván đã bắt đầu. Dùng mã vào lại nếu đã có ghế.")
        if len(self.members) >= self.seats:
            raise RoomError("room_full", "Phòng đã đủ chỗ.")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 20:
            raise RoomError("bad_message", "Tên hiển thị cần từ 1 đến 20 ký tự.")
        member = Member(name.strip(), secrets.token_urlsafe(24), connection)
        self.members[member.token] = member
        if self.host is None:
            self.host = member
        return member

    def rejoin(self, token, connection):
        if not isinstance(token, str) or token not in self.members:
            raise RoomError("bad_token", "Mã vào lại không hợp lệ.")
        member = self.members[token]
        member.connection = connection
        return member

    def leave(self, member):
        self.members.pop(member.token, None)
        member.connection = None
        if member is self.host:
            self.host = next(iter(self.members.values()), None)

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
        self.engine = GameEngine(players, rng=self.rng)

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
            "can_start": member is self.host,
        }

    def state_message(self, member, *, deadline, phase_id, acted):
        view = self.engine.view(member.player_id)
        return {
            "type": "state", "code": self.code, "me": member.player_id,
            "names": self.names.copy(), "deadline": deadline, "phase_id": phase_id,
            "is_host": member is self.host,
            "acted": member.player_id in acted, "view": view,
            "reveal": self.engine.reveal(),
        }


class Rooms:
    def __init__(self, rng, default_timers):
        self.rng = rng
        self._rooms = {}
        self.default_timers = default_timers.copy()

    def create(self, name, seats, connection):
        seats = seat_count(seats)
        while True:
            code = "".join(secrets.choice(ROOM_ALPHABET) for _ in range(4))
            if code not in self._rooms:
                break
        room = Room(code, seats, self.rng, self.default_timers)
        member = room.join(name, connection)
        self._rooms[code] = room
        return room, member

    def get(self, code):
        room = self._rooms.get(room_code(code))
        if room is None:
            raise RoomError("room_not_found", "Không tìm thấy phòng.")
        return room

    def discard_empty(self, room):
        if not room.members:
            self._rooms.pop(room.code, None)
