"""Chạy một ván Ma Sói CP2 trên terminal."""

import json
import os
import sys
from pathlib import Path
from random import Random

for _stream in (sys.stdout, sys.stderr, sys.stdin):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import tracing
from game_engine import GameEngine

MAX_PHASES = 200
TOTAL_KEYS = ("model_calls", "tokens_in", "tokens_out")


def _show_view(view, cursors):
    """Chỉ hiển thị dữ liệu được phép xem của người thật."""
    pid = view["player_id"]
    alive = ", ".join(p["player_id"] for p in view["players"] if p["alive"])
    print("\n[%s] Vòng %s · %s · vai mình: %s · phe: %s"
          % (pid, view["round"], view["phase"], view["role"], view["faction"]))
    print("Còn sống: " + alive)
    if "partner" in view:
        print("Người yêu: %s" % json.dumps(view["partner"], ensure_ascii=False))
    if view.get("inspections"):
        print("Kết quả soi: %s" % json.dumps(view["inspections"], ensure_ascii=False))
    for channel in ("public_chat", "private_chat", "wolf_chat"):
        messages = view.get(channel, [])
        key = (pid, channel, view["round"] if channel == "wolf_chat" else None)
        for message in messages[cursors.get(key, 0):]:
            label = {"private_chat": "Riêng", "wolf_chat": "Chat Sói"}.get(channel, "Chat")
            print("%s %s: %s" % (label, message["player_id"], message["text"]))
        cursors[key] = len(messages)
    for index, option in enumerate(view["allowed_actions"], 1):
        print("  %d. %s %s" % (index, option["type"],
                               " ".join(option.get("target_ids", []))))


def _parse_command(text, options):
    """Đổi lệnh chữ hoặc số thứ tự thành hành động."""
    parts = text.strip().split(maxsplit=1)
    if not parts:
        raise ValueError("Nhập hành động hoặc skip.")
    kind = parts[0].lower()
    if kind.isdigit():
        index = int(kind) - 1
        if not 0 <= index < len(options):
            raise ValueError("Số hành động không hợp lệ.")
        kind = options[index]["type"]
    body = parts[1].strip() if len(parts) > 1 else ""
    if kind == "skip":
        if any(o["type"] in {"vote", "bite", "pair"} for o in options):
            raise ValueError("Pha này bắt buộc chọn mục tiêu.")
        return None
    if kind in {"chat", "wolf_chat"}:
        return {"type": kind, "text": body}
    if kind == "whisper":
        target, _, message = body.partition(" ")
        return {"type": kind, "target_id": target, "text": message.strip()}
    if kind == "pair":
        return {"type": kind, "target_ids": body.split()}
    return {"type": kind, "target_id": body}


def _human_turn(engine, pid):
    """Hỏi lại đến khi hành động hợp lệ hoặc bỏ qua được phép."""
    print("Lệnh: vote P05, chat <lời>, whisper P03 <lời>, pair P01 P02,")
    print("      protect/inspect/save/poison/mark <ID>, skip; có thể thay tên bằng số.")
    used = set()
    while True:
        options = [o for o in engine.allowed_actions(pid) if o["type"] not in used]
        if not options:
            return
        try:
            action = _parse_command(input("%s > " % pid), options)
        except ValueError as exc:
            print(exc)
            continue
        if action is None:
            return
        if action["type"] in used:
            print("Đã dùng hành động này trong pha.")
            continue
        result = engine.submit_action(pid, action)
        if not result["accepted"]:
            print("Bị từ chối: " + result["reason"])
            continue
        if action["type"] == "wolf_chat":
            continue
        if engine.phase != "night_witch":
            return
        used.add(action["type"])
        if engine.allowed_actions(pid):
            print("Có thể dùng bình còn lại hoặc skip.")


def _call_npc(view, totals):
    """Luôn chốt trace, kể cả khi NPC lỗi hoặc trả sai hợp đồng."""
    tracing.begin("app")
    try:
        from agent import answer
        out = answer(json.dumps(view, ensure_ascii=False))
    finally:
        summary, _ = tracing.end()
        for key in TOTAL_KEYS:
            totals[key] += summary[key]
    reply = json.loads(out["output"])
    if (not isinstance(reply, dict)
            or not isinstance(reply.get("speech"), str)
            or not isinstance(reply.get("reason"), str)
            or "action" not in reply
            or (reply["action"] is not None and not isinstance(reply["action"], dict))):
        raise ValueError("Sai hợp đồng NPC.")
    return reply


PUBLIC_PHASES = {"day_discussion", "day_vote"}


def _log_action(pid, action, phase):
    """Chỉ in hành động công khai; hành động đêm và ghép đôi là bí mật."""
    if phase not in PUBLIC_PHASES:
        return
    kind = action["type"]
    if kind == "chat":
        print("%s: %s" % (pid, action["text"].replace("\n", " ")))
    elif kind == "whisper":
        print("%s whisper %s" % (pid, action["target_id"]))
    else:
        target = action.get("target_id", " ".join(action.get("target_ids", [])))
        print("%s %s %s" % (pid, kind, target))


def _fallback(options, preferred=None):
    """Chọn mục tiêu đầu cho lượt bắt buộc; bỏ qua kỹ năng tùy chọn."""
    ordered = sorted(options, key=lambda o: o["type"] != preferred)
    for option in ordered:
        kind = option["type"]
        targets = option.get("target_ids", [])
        if kind == "pair" and len(targets) >= 2:
            return {"type": kind, "target_ids": targets[:2]}
        if kind in {"vote", "bite"} and targets:
            outsiders = [pid for pid in targets if pid not in option.get("ally_target_ids", ())]
            return {"type": kind, "target_id": (outsiders or targets)[0]}
    return None


def _npc_turn(engine, pid, totals):
    """Thử tối đa hai lần, rồi dùng phương án dự phòng hợp lệ."""
    preferred = None
    for _ in range(2):
        view = engine.view(pid)
        try:
            reply = _call_npc(view, totals)
            action = reply["action"]
            # Một lời thoại chung thay cho chat để tránh nói hai câu.
            if view["phase"] == "day_discussion" and reply["speech"].strip():
                action = {"type": "chat", "text": reply["speech"].strip()}
            if action is None:
                if not any(o["type"] in {"pair", "vote", "bite"}
                           for o in view["allowed_actions"]):
                    return
                continue
            preferred = action.get("type")
            result = engine.submit_action(pid, action)
            if result["accepted"]:
                _log_action(pid, action, view["phase"])
                if action["type"] == "wolf_chat":
                    continue
                return
        except Exception:
            # Không đưa dữ liệu lỗi có thể chứa vai riêng lên terminal.
            continue
    phase = engine.phase
    action = _fallback(engine.allowed_actions(pid), preferred)
    if action is not None:
        result = engine.submit_action(pid, action)
        if not result["accepted"]:
            raise RuntimeError("Hành động dự phòng bị từ chối: " + result["reason"])
        _log_action(pid, action, phase)
    elif phase in PUBLIC_PHASES:
        print("%s skip" % pid)


def _play(engine, players, totals, auto):
    """Điều phối theo pha, kể cả lượt cắn thứ hai cùng tên pha."""
    humans = [p["player_id"] for p in players if p.get("controller") == "human"]
    observer = humans[0] if humans else players[0]["player_id"]
    cursors = {}
    for _ in range(MAX_PHASES):
        if engine.phase == "finished":
            break
        phase = engine.phase
        print("\n--- Vòng %s · %s ---" % (engine.round, phase))
        for pid in humans:
            _show_view(engine.view(pid), cursors)
        for player in players:
            pid = player["player_id"]
            if not engine.allowed_actions(pid):
                continue
            if pid in humans and not auto:
                _human_turn(engine, pid)
            else:
                _npc_turn(engine, pid, totals)
        engine.advance()
        view = engine.view(observer)
        # Các trường kết quả được giữ qua pha; chỉ in khi vừa chốt đêm/ngày.
        if phase == "day_vote" or engine.phase in {"day_discussion", "finished"}:
            print("Người chết: " + (", ".join(view["last_deaths"]) or "không ai"))
            if view["eliminated"]:
                print("Bị vote loại: " + view["eliminated"])
    if engine.phase != "finished":
        raise RuntimeError("Chạm giới hạn an toàn %d pha, ván chưa kết thúc." % MAX_PHASES)
    print("\nPhe thắng: %s" % engine.winner)
    print("Vai toàn bàn (sau khi hết ván):")
    for player in players:
        view = engine.view(player["player_id"])
        print("%s · %s · phe %s · %s" % (
            view["player_id"], view["role"], view["faction"],
            "sống" if any(p["player_id"] == view["player_id"] and p["alive"]
                         for p in view["players"]) else "đã chết"))


def main() -> int:
    totals = dict.fromkeys(TOTAL_KEYS, 0)
    try:
        path = Path(__file__).resolve().parents[1] / "data" / "cp2_sample_game.json"
        with path.open(encoding="utf-8") as stream:
            players = json.load(stream)["setup"]["players"]
        engine = GameEngine(players, rng=Random(0))
        auto = os.environ.get("AUTO_HUMAN") == "1" or not sys.stdin.isatty()
        print("Ma Sói CP2 · %d người · %s" % (
            len(players), "tự chạy" if auto else "nhập lệnh; Ctrl+C để thoát"))
        _play(engine, players, totals, auto)
        return 0
    except (EOFError, KeyboardInterrupt):
        print("\nĐã thoát ván.")
        return 0
    except Exception as exc:
        print("Lỗi ván: %s" % exc)
        return 1
    finally:
        print("Tổng gọi model: %d · token vào: %d · token ra: %d" % (
            totals["model_calls"], totals["tokens_in"], totals["tokens_out"]))


if __name__ == "__main__":
    sys.exit(main())
