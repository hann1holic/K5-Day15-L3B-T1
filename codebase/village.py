"""Authoritative map actions for the optional village workflow."""

from collections import deque

WIDTH = 32
HEIGHT = 26
SQUARE = ((WIDTH - 1) // 2, (HEIGHT - 1) // 2)
SQUARE_BOUNDS = {
    "min_x": SQUARE[0] - 6, "min_y": SQUARE[1] - 4,
    "max_x": SQUARE[0] + 6, "max_y": SQUARE[1] + 4,
}
SQUARE_SEAT_OFFSETS = (
    (-4, -3), (-2, -3), (0, -3), (2, -3), (4, -3),
    (5, -2), (5, -1), (5, 0), (5, 1), (5, 2),
    (4, 3), (2, 3), (0, 3), (-2, 3), (-4, 3),
    (-5, 2), (-5, 1), (-5, 0), (-5, -1), (-5, -2),
)
BONFIRE_OFFSETS = ((-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0))
MOVE_INTERVAL = 0.10
GHOST_MOVE_INTERVAL = MOVE_INTERVAL / 2  # linh hồn đi nhanh gấp đôi
MOVE_JITTER_ALLOWANCE = 0.20
VISION_RADIUS = 3
INTERACT_RADIUS = 1
DIRECTIONS = ((1, 0), (-1, 0), (0, 1), (0, -1))
HOUSE_TYPES = ("castle", "villa", "single_storey", "hut")
HOUSE_DOORS = {
    f"H{row * 5 + col + 1:02}": (x, y, HOUSE_TYPES[row])
    for row, y in enumerate((3, 6, 19, 23))
    for col, x in enumerate((4, 10, 15, 21, 26))
}
HOUSE_ENTRANCES = {house: (x, y + 1) for house, (x, y, _) in HOUSE_DOORS.items()}
BLOCKED_TILES = {
    (x + dx, y + dy)
    for x, y, _ in HOUSE_DOORS.values()
    for dx in (-1, 0, 1)
    for dy in (-1, 0)
}
SEARCH_TILES = tuple(
    (x, y) for x in range(WIDTH) for y in range(HEIGHT)
    if (x, y) not in BLOCKED_TILES
    and abs(x - SQUARE[0]) + abs(y - SQUARE[1]) >= 4
)
ITEM_KINDS = ("shield", "sword")


def distance(first, second):
    return abs(first[0] - second[0]) + abs(first[1] - second[1])


def walking_steps(point):
    x, y = point
    for dx, dy in DIRECTIONS:
        target = (x + dx, y + dy)
        if 0 <= target[0] < WIDTH and 0 <= target[1] < HEIGHT and target not in BLOCKED_TILES:
            yield target, (dx, dy)


def route_to(start, destinations):
    """Return the closest reachable destination and the first step toward it."""
    frontier = deque([start])
    first_step = {start: None}
    while frontier and destinations:
        point = frontier.popleft()
        if point in destinations:
            return point, first_step[point]
        for target, direction in walking_steps(point):
            if target not in first_step:
                first_step[target] = first_step[point] or direction
                frontier.append(target)
    return None, None


class Village:
    def __init__(self, rng, *, previous_item_tiles=None):
        self.rng = rng
        self.phase = None
        self.homes = {}
        self.positions = {}
        self.sleeping = set()
        self.items = {}
        self.previous_item_tiles = previous_item_tiles if previous_item_tiles is not None else set()
        self.bot_item_targets = {}
        self.held = {}
        self.next_move = {}
        self.ghosts = {}        # người đã chết: đi tự do khắp làng, chỉ người chết khác thấy
        self.abandoned = set()  # nhà của người đã chết, ai cũng vào được
        self.dirty = False

    def sync_ghosts(self, alive):
        """Turn every player who just died into a ghost that ignores the village rules."""
        dead = (self.positions.keys() | self.homes.keys()) - set(alive) - self.ghosts.keys()
        for pid in sorted(dead):
            house = self.homes.pop(pid, None)
            if house is not None:
                self.abandoned.add(house)
            point = self.positions.pop(pid, None)
            if point is None or point in BLOCKED_TILES:
                point = HOUSE_ENTRANCES[house] if house is not None else SQUARE
            self.ghosts[pid] = point
            self.sleeping.discard(pid)
            self.held.pop(pid, None)
            self.next_move.pop(pid, None)
            self.bot_item_targets.pop(pid, None)
        return bool(dead)

    def ghost_move(self, pid, dx, dy, now):
        if pid not in self.ghosts:
            return "action_not_allowed"
        if type(dx) is not int or type(dy) is not int or (dx, dy) not in DIRECTIONS:
            return "invalid_move"
        due = self.next_move.get(pid, 0)
        if now < due - MOVE_JITTER_ALLOWANCE:
            return "move_too_fast"
        x, y = self.ghosts[pid]
        target = (x + dx, y + dy)
        if not (0 <= target[0] < WIDTH and 0 <= target[1] < HEIGHT):
            return "outside_map"
        if target in BLOCKED_TILES:
            return "blocked_tile"
        self.ghosts[pid] = target
        self.next_move[pid] = max(due, now) + GHOST_MOVE_INTERVAL
        return None

    def go_to_square(self, alive, *, spread=True):
        if spread:
            players = sorted(alive)
            seats = len(SQUARE_SEAT_OFFSETS)
            self.positions = {}
            for index, pid in enumerate(players):
                dx, dy = SQUARE_SEAT_OFFSETS[index * seats // len(players)]
                self.positions[pid] = (SQUARE[0] + dx, SQUARE[1] + dy)
        else:
            self.positions = dict.fromkeys(alive, SQUARE)
        self.next_move.clear()

    def begin_housing(self, alive):
        self.phase = "night_housing"
        self.homes = {pid: house for pid, house in self.homes.items() if pid in alive}
        self.go_to_square(alive, spread=False)
        self.sleeping.clear()
        self.held.clear()

    def finish_housing(self):
        available = sorted(set(HOUSE_DOORS) - set(self.homes.values()))
        unassigned = sorted(set(self.positions) - set(self.homes))
        for pid, house in zip(unassigned, self.rng.sample(available, len(unassigned))):
            self.homes[pid] = house
            self.abandoned.discard(house)
        for pid, house in self.homes.items():
            self.positions[pid] = HOUSE_DOORS[house][:2]
        self.sleeping.update(self.positions)
        self.phase = None

    def begin_lucky_day(self, alive):
        self.phase = "lucky_day"
        self.go_to_square(alive, spread=False)
        self.held.clear()
        self.bot_item_targets.clear()
        available = [tile for tile in SEARCH_TILES if tile not in self.previous_item_tiles]
        self.items = dict(zip(ITEM_KINDS, self.rng.sample(available, len(ITEM_KINDS))))
        self.previous_item_tiles.clear()
        self.previous_item_tiles.update(self.items.values())

    def finish_lucky_day(self):
        self.phase = None
        self.go_to_square(self.positions)
        self.items.clear()
        self.bot_item_targets.clear()
        return self.held.copy()

    def allowed_actions(self, pid):
        if pid not in self.positions:
            return []
        if self.phase == "night_housing" and pid not in self.sleeping:
            return [{"type": "move"}, {"type": "enter_house"}]
        if self.phase == "lucky_day":
            actions = [{"type": "move"}]
            if pid not in self.held:
                actions.append({"type": "pick_up"})
            return actions
        return []

    def act(self, pid, action, now):
        kind = action.get("type")
        if not any(kind == option["type"] for option in self.allowed_actions(pid)):
            return "action_not_allowed"
        if kind == "move":
            reason = self._move(pid, action.get("dx"), action.get("dy"), now)
        elif kind == "enter_house":
            reason = self._enter_house(pid, action.get("house_id"))
        else:
            reason = self._pick_up(pid, action.get("item_id"))
        if reason is None:
            self.dirty = True
        return reason

    def _move(self, pid, dx, dy, now):
        if type(dx) is not int or type(dy) is not int or (dx, dy) not in DIRECTIONS:
            return "invalid_move"
        due = self.next_move.get(pid, 0)
        if now < due - MOVE_JITTER_ALLOWANCE:
            return "move_too_fast"
        x, y = self.positions[pid]
        target = (x + dx, y + dy)
        if not (0 <= target[0] < WIDTH and 0 <= target[1] < HEIGHT):
            return "outside_map"
        if target in BLOCKED_TILES:
            return "blocked_tile"
        self.positions[pid] = target
        self.next_move[pid] = max(due, now) + MOVE_INTERVAL
        return None

    def _enter_house(self, pid, house):
        if not isinstance(house, str) or house not in HOUSE_DOORS:
            return "invalid_target"
        if house in self.homes.values() and self.homes.get(pid) != house:
            return "house_taken"
        if self.positions[pid] != HOUSE_ENTRANCES[house]:
            return "too_far"
        self.homes[pid] = house
        self.abandoned.discard(house)  # nhà hoang có chủ mới
        self.positions[pid] = HOUSE_DOORS[house][:2]
        self.sleeping.add(pid)
        return None

    def _pick_up(self, pid, item):
        if not isinstance(item, str) or item not in self.items:
            return "item_unavailable"
        if distance(self.positions[pid], self.items[item]) > INTERACT_RADIUS:
            return "too_far"
        self.held[pid] = item
        del self.items[item]
        return None

    def bots_go_home(self, bots, now):
        available = set(HOUSE_DOORS) - set(self.homes.values())
        for pid in sorted((bots & self.positions.keys()) - self.sleeping):
            home = self.homes.get(pid)
            candidates = (home,) if home else available
            entrances = {HOUSE_ENTRANCES[house]: house for house in candidates}
            entrance, direction = route_to(self.positions[pid], entrances)
            if entrance is None:
                continue
            house = entrances[entrance]
            available.discard(house)
            if direction is None:
                self.act(pid, {"type": "enter_house", "house_id": house}, now)
            else:
                dx, dy = direction
                self.act(pid, {"type": "move", "dx": dx, "dy": dy}, now)

    def bots_search(self, bots, now):
        for pid in sorted((bots & self.positions.keys()) - self.held.keys()):
            point = self.positions[pid]
            kind = self.bot_item_targets.get(pid)
            if kind not in self.items:
                nearby = min(((distance(point, tile), item) for item, tile in self.items.items()
                              if distance(point, tile) <= VISION_RADIUS), default=None)
                kind = nearby[1] if nearby else None
                self.bot_item_targets[pid] = kind
            if kind is not None:
                destination = self.items[kind]
                if distance(point, destination) <= INTERACT_RADIUS:
                    self.act(pid, {"type": "pick_up", "item_id": kind}, now)
                    continue
                _, direction = route_to(point, {destination})
            else:
                choices = [direction for _, direction in walking_steps(point)]
                direction = self.rng.choice(choices) if choices else None
            if direction is not None:
                dx, dy = direction
                self.act(pid, {"type": "move", "dx": dx, "dy": dy}, now)

    def view(self, pid, phase, wolf_pack=()):
        ghost = pid in self.ghosts
        inside = not ghost and pid in self.sleeping and phase != "night_wolf" and (
            phase.startswith("night_") or phase == "pair"
        )
        positions = self.positions.copy()
        for wolf, (dx, dy) in zip(wolf_pack, BONFIRE_OFFSETS):
            positions[wolf["player_id"]] = (SQUARE[0] + dx, SQUARE[1] + dy)
        if ghost:
            # Chỉ người chết mới thấy các linh hồn khác.
            positions.update(self.ghosts)
        view = {
            "size": {"width": WIDTH, "height": HEIGHT},
            "blocked_tiles": [{"x": x, "y": y} for x, y in sorted(BLOCKED_TILES)],
            "square": {"x": SQUARE[0], "y": SQUARE[1]},
            "square_bounds": SQUARE_BOUNDS.copy(),
            "positions": {key: {"x": x, "y": y} for key, (x, y) in positions.items()},
            "home_id": self.homes.get(pid),
            "area": (
                "map" if ghost else
                "home" if inside else
                "map" if phase in {"night_housing", "lucky_day"} else
                "square" if phase.startswith("day_") or phase == "night_wolf" else "home"
            ),
            "inside_home": inside,
            "held_item": self.held.get(pid),
            "abandoned_houses": sorted(self.abandoned),
        }
        if ghost:
            view["ghost"] = True
            view["ghosts"] = sorted(self.ghosts)
        if ghost or phase in {"night_housing", "night_wolf", "lucky_day"}:
            owners = {house: player for player, house in self.homes.items()}
            view["houses"] = [
                {"id": house, "x": x, "y": y, "kind": kind, "owner_id": owners.get(house),
                 "abandoned": house in self.abandoned}
                for house, (x, y, kind) in HOUSE_DOORS.items()
            ]
        if phase == "lucky_day":
            # Linh hồn chỉ xem, không nhặt được, nên thấy hết cổ vật.
            view["visible_items"] = [
                {"id": kind, "kind": kind, "x": x, "y": y}
                for kind, (x, y) in self.items.items()
                if ghost or (pid in self.positions and distance(self.positions[pid], (x, y)) <= VISION_RADIUS)
            ]
        return view
