"""Authoritative map actions for the optional village workflow."""

WIDTH = 24
HEIGHT = 20
SQUARE = (11, 9)
BONFIRE_OFFSETS = ((-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0))
MOVE_INTERVAL = 0.10
VISION_RADIUS = 3
INTERACT_RADIUS = 1
DIRECTIONS = ((1, 0), (-1, 0), (0, 1), (0, -1))
HOUSE_TYPES = ("castle", "villa", "single_storey", "hut")
HOUSE_DOORS = {
    f"H{row * 5 + col + 1:02}": (x, y, HOUSE_TYPES[row])
    for row, y in enumerate((2, 6, 13, 17))
    for col, x in enumerate((2, 6, 10, 14, 18))
}
DOOR_TILES = {(x, y) for x, y, _ in HOUSE_DOORS.values()}
SEARCH_TILES = tuple(
    (x, y) for x in range(WIDTH) for y in range(HEIGHT)
    if (x, y) not in DOOR_TILES
    and abs(x - SQUARE[0]) + abs(y - SQUARE[1]) >= 4
)
ITEM_KINDS = ("shield", "sword")


def distance(first, second):
    return abs(first[0] - second[0]) + abs(first[1] - second[1])


class Village:
    def __init__(self, rng):
        self.rng = rng
        self.phase = None
        self.homes = {}
        self.positions = {}
        self.sleeping = set()
        self.items = {}
        self.held = {}
        self.next_move = {}
        self.dirty = False

    def go_to_square(self, alive):
        self.positions = dict.fromkeys(alive, SQUARE)
        self.next_move.clear()

    def begin_housing(self, alive):
        self.phase = "night_housing"
        self.homes = {pid: house for pid, house in self.homes.items() if pid in alive}
        self.go_to_square(alive)
        self.sleeping.clear()
        self.held.clear()

    def finish_housing(self):
        available = sorted(set(HOUSE_DOORS) - set(self.homes.values()))
        unassigned = sorted(set(self.positions) - set(self.homes))
        for pid, house in zip(unassigned, self.rng.sample(available, len(unassigned))):
            self.homes[pid] = house
        for pid, house in self.homes.items():
            self.positions[pid] = HOUSE_DOORS[house][:2]
        self.sleeping.update(self.positions)
        self.phase = None

    def begin_lucky_day(self, alive):
        self.phase = "lucky_day"
        self.go_to_square(alive)
        self.held.clear()
        self.items = dict(zip(ITEM_KINDS, self.rng.sample(SEARCH_TILES, len(ITEM_KINDS))))

    def finish_lucky_day(self):
        self.phase = None
        self.go_to_square(self.positions)
        self.items.clear()
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
        if now < self.next_move.get(pid, 0):
            return "move_too_fast"
        x, y = self.positions[pid]
        target = (x + dx, y + dy)
        if not (0 <= target[0] < WIDTH and 0 <= target[1] < HEIGHT):
            return "outside_map"
        self.positions[pid] = target
        self.next_move[pid] = now + MOVE_INTERVAL
        return None

    def _enter_house(self, pid, house):
        if not isinstance(house, str) or house not in HOUSE_DOORS:
            return "invalid_target"
        if house in self.homes.values() and self.homes.get(pid) != house:
            return "house_taken"
        door = HOUSE_DOORS[house][:2]
        if distance(self.positions[pid], door) > INTERACT_RADIUS:
            return "too_far"
        self.homes[pid] = house
        self.positions[pid] = door
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

    def bots_search(self, bots, now):
        for pid in sorted((bots & self.positions.keys()) - self.held.keys()):
            point = self.positions[pid]
            nearby = sorted((distance(point, tile), kind) for kind, tile in self.items.items()
                            if distance(point, tile) <= VISION_RADIUS)
            if nearby and nearby[0][0] <= INTERACT_RADIUS:
                self.act(pid, {"type": "pick_up", "item_id": nearby[0][1]}, now)
                continue
            x, y = point
            choices = [(dx, dy) for dx, dy in DIRECTIONS if 0 <= x + dx < WIDTH and 0 <= y + dy < HEIGHT]
            if nearby:
                target = self.items[nearby[0][1]]
                dx, dy = min(choices, key=lambda step: distance((x + step[0], y + step[1]), target))
            else:
                dx, dy = self.rng.choice(choices)
            self.act(pid, {"type": "move", "dx": dx, "dy": dy}, now)

    def view(self, pid, phase, wolf_pack=()):
        inside = pid in self.sleeping and phase != "night_wolf" and (
            phase.startswith("night_") or phase == "pair"
        )
        positions = self.positions.copy()
        for wolf, (dx, dy) in zip(wolf_pack, BONFIRE_OFFSETS):
            positions[wolf["player_id"]] = (SQUARE[0] + dx, SQUARE[1] + dy)
        view = {
            "size": {"width": WIDTH, "height": HEIGHT},
            "square": {"x": SQUARE[0], "y": SQUARE[1]},
            "positions": {key: {"x": x, "y": y} for key, (x, y) in positions.items()},
            "home_id": self.homes.get(pid),
            "area": (
                "home" if inside else
                "map" if phase in {"night_housing", "lucky_day"} else
                "square" if phase.startswith("day_") or phase == "night_wolf" else "home"
            ),
            "inside_home": inside,
            "held_item": self.held.get(pid),
        }
        if phase in {"night_housing", "night_wolf", "lucky_day"}:
            owners = {house: player for player, house in self.homes.items()}
            view["houses"] = [
                {"id": house, "x": x, "y": y, "kind": kind, "owner_id": owners.get(house)}
                for house, (x, y, kind) in HOUSE_DOORS.items()
            ]
        if phase == "lucky_day":
            view["visible_items"] = [
                {"id": kind, "kind": kind, "x": x, "y": y}
                for kind, (x, y) in self.items.items()
                if pid in self.positions and distance(self.positions[pid], (x, y)) <= VISION_RADIUS
            ]
        return view
