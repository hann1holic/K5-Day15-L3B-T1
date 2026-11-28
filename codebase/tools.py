"""Công cụ đọc trạng thái riêng của NPC, không sửa ván."""
import json

from tracing import tool


@tool
def read_view(text: str):
    """read_view · Input: JSON view · Output: dict hoặc None · Tác động ngoài: không."""
    try:
        view = json.loads(text)
    except (TypeError, ValueError):
        return None
    if not isinstance(view, dict):
        return None
    for key in ("player_id", "phase", "role", "faction"):
        if not isinstance(view.get(key), str) or not view[key]:
            return None
    if not isinstance(view.get("round"), int) or isinstance(view["round"], bool):
        return None
    if not isinstance(view.get("public_chat"), list):
        return None
    if not isinstance(view.get("allowed_actions"), list):
        return None
    for message in view["public_chat"]:
        if (not isinstance(message, dict)
                or not isinstance(message.get("player_id"), str)
                or not isinstance(message.get("text"), str)):
            return None
    for option in view["allowed_actions"]:
        if not isinstance(option, dict) or option.get("type") not in {
                "vote", "protect", "inspect", "mark", "save", "poison", "pair", "chat", "whisper",
                "wolf_chat"}:
            return None
        if option["type"] not in {"chat", "wolf_chat"}:
            targets = option.get("target_ids")
            if not isinstance(targets, list) or not all(isinstance(p, str) and p for p in targets):
                return None
            allies = option.get("ally_target_ids", [])
            if not isinstance(allies, list) or any(pid not in targets for pid in allies):
                return None
    if "wolf_peers" in view and (not isinstance(view["wolf_peers"], list)
                                or not all(isinstance(p, str) for p in view["wolf_peers"])):
        return None
    if "partner" in view and (not isinstance(view["partner"], dict)
                             or not isinstance(view["partner"].get("player_id"), str)):
        return None
    if "inspections" in view and (not isinstance(view["inspections"], list)
                                 or not all(isinstance(p, dict) for p in view["inspections"])):
        return None
    if "player_names" in view and (not isinstance(view["player_names"], dict)
                                   or not all(isinstance(name, str) for name in view["player_names"].values())):
        return None
    return view


@tool
def legal_targets(view: dict, action_type: str) -> list:
    """legal_targets · Input: view, loại hành động · Output: ID hợp lệ · Tác động ngoài: không."""
    targets = []
    allies = []
    for option in view["allowed_actions"]:
        if option["type"] == action_type:
            for target in option.get("target_ids", []):
                if target not in targets:
                    targets.append(target)
            if action_type == "vote" and view.get("phase") == "night_wolf":
                allies.extend(option.get("ally_target_ids", []))
    if action_type == "vote":
        targets = [p for p in targets if p not in view.get("wolf_peers", []) or p in allies]
        if view.get("phase") == "day_vote" and isinstance(view.get("partner"), dict):
            targets = [p for p in targets if p != view["partner"].get("player_id")]
    return targets
