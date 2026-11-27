"""Authoritative in-memory rules for one Ma Sói game."""

from collections import Counter, deque
from dataclasses import dataclass
from random import Random


WOLF_ROLES = {"soi_thuong", "soi_con"}
CHAT_ACTIONS = ("chat", "whisper", "wolf_chat")
SPECIAL_ROLES = {
    "soi_con", "bao_ve", "tien_tri", "tien_tri_tap_su",
    "phu_thuy", "tho_san", "than_tinh_yeu",
}
NIGHT_ROLE_PHASES = ("night_protect", "night_inspect", "night_witch", "night_hunter")
FIXED_NIGHT_SLOTS = 2 + len(NIGHT_ROLE_PHASES)
ROLE_ACTIONS = {
    "night_protect": ("bao_ve", "protect"),
    "night_inspect": ("tien_tri", "inspect"),
    "night_hunter": ("tho_san", "mark"),
}


def deal_roles(seats, rng):
    """Deal roles with at most one wolf per three starting villagers."""
    if type(seats) is not int or not 4 <= seats <= 20:
        raise ValueError("A room requires 4 to 20 seats.")
    roles = ["tien_tri"]
    if seats >= 5:
        roles.append("bao_ve")
    ordinary_wolves = seats // 4
    if seats >= 8:
        roles.extend(("soi_con", "phu_thuy"))
        ordinary_wolves -= 1
    if seats >= 11:
        roles.extend(("tho_san", "than_tinh_yeu"))
    if seats >= 12:
        roles.append("tien_tri_tap_su")
    roles.extend(["soi_thuong"] * ordinary_wolves)
    roles.extend(["dan"] * (seats - len(roles)))
    rng.shuffle(roles)
    return roles


@dataclass(frozen=True)
class Player:
    player_id: str
    role: str


class GameEngine:
    """Receive actions from trusted sessions and expose a per-player view."""

    def __init__(self, players, *, rng=None, fixed_night=False):
        players = [Player(item["player_id"], item["role"])
                   for item in players]
        ids = [player.player_id for player in players]
        roles = Counter(player.role for player in players)
        if not 3 <= len(ids) <= 20 or len(set(ids)) != len(ids) or not all(ids):
            raise ValueError("A game requires 3 to 20 distinct, non-empty player IDs.")
        if roles.keys() - (SPECIAL_ROLES | {"dan", "soi_thuong"}):
            raise ValueError("Unknown role.")
        if any(roles[role] > 1 for role in SPECIAL_ROLES):
            raise ValueError("Each special role can appear once per game.")
        wolves = sum(roles[role] for role in WOLF_ROLES)
        if not 0 < wolves < len(ids):
            raise ValueError("A game requires both wolves and villagers.")

        self._players = {player.player_id: player for player in players}
        self._factions = {p.player_id: "soi" if p.role in WOLF_ROLES else "dan"
                          for p in players}
        self._alive = set(ids)
        self._rng = rng if rng is not None else Random()
        self._lover_pair = ()
        self._promoted_seer = None
        self._hunter_mark = None
        self._wolf_bonus = False
        self._potions = {"save", "poison"}
        self._inspections = {}
        self._public_chat = []
        self._private_chat = {player_id: [] for player_id in ids}
        self._wolf_chat = []
        self._votes = {}
        self._day_items = {}
        self._lucky_vote_result = None
        self._night_actions = {}
        self._wolf_targets = []
        self._wolf_strikes = 1
        self._fixed_night = fixed_night
        self._wolf_slot = 1
        self._last_deaths = []
        self._eliminated = None
        self.round = 1
        self.winner = None
        self.phase = "pair" if roles["than_tinh_yeu"] else "night_wolf"

    def living_ids(self):
        return self._alive.copy()

    def set_day_items(self, items):
        if self.phase != "day_discussion":
            raise ValueError("Lucky Day items must be set before the day vote.")
        self._day_items = {pid: item for pid, item in items.items() if pid in self._alive}

    def _role(self, player_id):
        if player_id == self._promoted_seer:
            return "tien_tri"
        return self._players[player_id].role

    def _others(self, player_id):
        return sorted(self._alive - {player_id})

    def _vote_options(self, player_id):
        if self.phase == "day_vote":
            return [{"type": "vote", "target_ids": self._others(player_id)}]
        if self._factions[player_id] != "soi":
            return []
        if self._fixed_night and self._wolf_slot == 2 and (
            self._wolf_strikes < 2 or not self._wolf_targets
        ):
            return []
        targets = [p for p in self._others(player_id) if p not in self._wolf_targets
                   and (self._factions[p] != "soi" or self._role(p) == "soi_con")]
        return [{"type": "vote", "target_ids": targets,
                 "ally_target_ids": [p for p in targets if self._factions[p] == "soi"]}] if targets else []

    def allowed_actions(self, player_id):
        if player_id not in self._alive:
            return []

        role = self._role(player_id)
        if self.phase == "pair" and role == "than_tinh_yeu" and not self._lover_pair:
            return [{"type": "pair", "target_ids": sorted(self._alive), "target_count": 2}]
        if self.phase == "night_wolf":
            votes = self._vote_options(player_id)
            return [*votes, {"type": "wolf_chat"}] if votes else []
        if self.phase == "day_vote":
            return self._vote_options(player_id)
        if self.phase == "day_discussion":
            return [{"type": "chat"}, {"type": "whisper", "target_ids": self._others(player_id)}]
        if self.phase == "night_witch" and role == "phu_thuy":
            options = []
            bite_victims = sorted(self._bite_victims())
            if "save" in self._potions and bite_victims and "save" not in self._night_actions:
                options.append({"type": "save", "target_ids": bite_victims})
            if "poison" in self._potions and "poison" not in self._night_actions:
                options.append({"type": "poison", "target_ids": sorted(self._alive)})
            return options
        role_action = ROLE_ACTIONS.get(self.phase)
        if role_action and role == role_action[0]:
            action = role_action[1]
            targets = self._others(player_id) if action == "mark" else sorted(self._alive)
            return [{"type": action, "target_ids": targets}]
        return []

    def view(self, player_id):
        """Return only information this player is entitled to see."""
        if player_id not in self._players:
            raise KeyError(player_id)
        view = {
            "round": self.round,
            "phase": self.phase,
            "player_id": player_id,
            "role": self._role(player_id),
            "faction": self._factions[player_id],
            "players": [{"player_id": p, "alive": p in self._alive} for p in self._players],
            "public_chat": [message.copy() for message in self._public_chat],
            "private_chat": [message.copy() for message in self._private_chat[player_id]],
            "allowed_actions": self.allowed_actions(player_id),
            "last_deaths": self._last_deaths[:],
            "eliminated": self._eliminated,
            "winner": self.winner,
        }
        if self._lucky_vote_result is not None:
            view["lucky_vote_result"] = {
                "shielded": self._lucky_vote_result["shielded"],
                "double_voters": self._lucky_vote_result["double_voters"][:],
            }
        if self._factions[player_id] == "soi":
            view["wolf_peers"] = sorted(p for p in self._players
                                       if self._factions[p] == "soi" and p != player_id)
            if self.phase == "night_wolf" and view["allowed_actions"]:
                view["wolf_pack"] = [
                    {"player_id": pid, "role": self._role(pid)}
                    for pid in sorted(self._alive) if self._factions[pid] == "soi"
                ]
                view["wolf_chat"] = [message.copy() for message in self._wolf_chat]
                view["wolf_votes"] = dict(self._votes)
                view["strikes_remaining"] = self._wolf_strikes - len(self._wolf_targets)
        if player_id in self._lover_pair:
            partner = next(p for p in self._lover_pair if p != player_id)
            view["partner"] = {"player_id": partner, "role": self._players[partner].role}
        if player_id in self._inspections:
            view["inspections"] = [item.copy() for item in self._inspections[player_id]]
        return view

    def reveal(self):
        """Return the full role list only once the match has ended."""
        if self.phase != "finished":
            return None
        return [
            {"player_id": pid, "role": player.role, "faction": self._factions[pid],
             "alive": pid in self._alive}
            for pid, player in self._players.items()
        ]

    def submit_action(self, player_id, action):
        """Apply one legal action. The caller supplies an authenticated player ID."""
        if not isinstance(action, dict):
            return self._reject("invalid_action")
        kind = action.get("type")
        option = next((item for item in self.allowed_actions(player_id)
                       if item["type"] == kind), None)
        if option is None:
            return self._reject("action_not_allowed")
        target = action.get("target_id")
        if kind == "pair":
            targets = action.get("target_ids")
            if (not isinstance(targets, list) or len(targets) != 2
                    or any(p not in option["target_ids"] for p in targets)
                    or targets[0] == targets[1]):
                return self._reject("invalid_target")
            self._lover_pair = tuple(targets)
            for partner in targets:
                self._factions[partner] = "tinh_nhan"
        else:
            if "target_ids" in option and target not in option["target_ids"]:
                return self._reject("invalid_target")
            if kind in CHAT_ACTIONS:
                body = action.get("text")
                if not isinstance(body, str) or not body.strip():
                    return self._reject("invalid_text")
                message = {"player_id": player_id, "text": body.strip()}
                if kind == "whisper":
                    message["target_id"] = target
                    self._private_chat[player_id].append(message)
                    self._private_chat[target].append(message)
                elif kind == "wolf_chat":
                    self._wolf_chat.append(message)
                else:
                    self._public_chat.append(message)
            elif kind == "vote":
                self._votes[player_id] = target
            else:
                self._night_actions[kind] = target
        return {"accepted": True, "phase": self.phase}

    def _reject(self, reason):
        return {"accepted": False, "phase": self.phase, "reason": reason}

    def _vote_leaders(self):
        counts = Counter()
        for voter, target in self._votes.items():
            double = self.phase == "day_vote" and self._day_items.get(voter) == "sword"
            counts[target] += 2 if double else 1
        if not counts:
            return []
        highest = max(counts.values())
        return sorted(player_id for player_id, count in counts.items() if count == highest)

    def _bite_victims(self):
        return set(self._wolf_targets) - {self._night_actions.get("protect")}

    def _start_night(self):
        self.phase = "night_wolf"
        self._wolf_strikes = 2 if self._wolf_bonus else 1
        self._wolf_slot = 1
        self._wolf_bonus = False
        self._wolf_targets.clear()
        self._wolf_chat.clear()
        self._night_actions.clear()
        self._votes.clear()

    def _advance_night_roles(self, start):
        for phase in NIGHT_ROLE_PHASES[start:]:
            self.phase = phase
            if self._fixed_night or any(self.allowed_actions(p) for p in self._alive):
                return
        self._resolve_night()

    def advance(self):
        """Close the current phase. Call only from the game runner, not a client."""
        if self.phase == "finished":
            return self.phase
        if self.phase == "pair":
            if not self._lover_pair:
                raise ValueError("Thần Tình Yêu must choose the pair before the first hunt.")
            self._start_night()
        elif self.phase == "night_wolf":
            leaders = self._vote_leaders()
            self._votes.clear()
            if leaders:
                self._wolf_targets.append(self._rng.choice(leaders))
            if self._fixed_night:
                if self._wolf_slot == 1:
                    self._wolf_slot += 1
                    return self.phase
            elif leaders and len(self._wolf_targets) < self._wolf_strikes and any(
                    self._factions[p] == "soi" and self._vote_options(p) for p in self._alive):
                return self.phase
            self._advance_night_roles(0)
        elif self.phase in NIGHT_ROLE_PHASES:
            if self.phase == "night_inspect" and "inspect" in self._night_actions:
                seer = next(p for p in sorted(self._alive) if self._role(p) == "tien_tri")
                target = self._night_actions["inspect"]
                self._inspections.setdefault(seer, []).append(
                    {"target_id": target, "is_wolf": self._players[target].role in WOLF_ROLES}
                )
            self._advance_night_roles(NIGHT_ROLE_PHASES.index(self.phase) + 1)
        elif self.phase == "day_discussion":
            self.phase = "day_vote"
        elif self.phase == "day_vote":
            leaders = self._vote_leaders()
            self._eliminated = leaders[0] if len(leaders) == 1 else None
            shielded = None
            if self._day_items.get(self._eliminated) == "shield":
                shielded, self._eliminated = self._eliminated, None
            double_voters = sorted(voter for voter in self._votes if self._day_items.get(voter) == "sword")
            self._lucky_vote_result = (
                {"shielded": shielded, "double_voters": double_voters}
                if shielded or double_voters else None
            )
            self._day_items.clear()
            self._last_deaths = self._resolve_deaths([self._eliminated])
            if not self._finish_if_ready():
                self.round += 1
                self._start_night()
        return self.phase

    def _resolve_night(self):
        self._lucky_vote_result = None
        victims = self._bite_victims()
        self._eliminated = None
        if "save" in self._night_actions:
            victims.discard(self._night_actions["save"])
            self._potions.remove("save")
        if "poison" in self._night_actions:
            victims.add(self._night_actions["poison"])
            self._potions.remove("poison")
        if "mark" in self._night_actions:
            self._hunter_mark = self._night_actions["mark"]
        self._last_deaths = self._resolve_deaths(sorted(victims))
        if not self._finish_if_ready():
            self.phase = "day_discussion"

    def _resolve_deaths(self, targets):
        queue = deque(p for p in targets if p is not None)
        deaths = []
        lost_seer = False
        while queue:
            target = queue.popleft()
            if target not in self._alive:
                continue
            self._alive.remove(target)
            deaths.append(target)
            role = self._players[target].role
            if target in self._lover_pair:
                queue.extend(p for p in self._lover_pair if p != target)
            if role == "tho_san" and self._hunter_mark is not None:
                queue.append(self._hunter_mark)
            if role == "soi_con":
                self._wolf_bonus = True
            lost_seer = lost_seer or role == "tien_tri"
        if lost_seer:
            self._promoted_seer = next(
                (p for p in self._alive if self._players[p].role == "tien_tri_tap_su"),
                None,
            )
        return deaths

    def _finish_if_ready(self):
        counts = Counter(self._factions[p] for p in self._alive)
        wolves, villagers, lovers = (counts[key] for key in ("soi", "dan", "tinh_nhan"))
        if not self._alive:
            self.winner = "hoa"
        elif lovers == 2 and lovers >= wolves + villagers:
            self.winner = "tinh_nhan"
        elif wolves and wolves >= villagers + lovers:
            self.winner = "soi"
        elif villagers and not wolves and not lovers:
            self.winner = "dan"
        if self.winner:
            self.phase = "finished"
        return self.winner is not None
