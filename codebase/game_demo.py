"""Replay the synthetic CP2 fixture through the same engine used by clients."""

import json
import sys
from pathlib import Path
from random import Random

from .game_engine import GameEngine


def submit(engine, player_id, action):
    result = engine.submit_action(player_id, action)
    if not result["accepted"]:
        raise RuntimeError(f"{player_id}: {action['type']} rejected ({result['reason']})")


def main():
    path = Path(__file__).resolve().parents[1] / "data" / "cp2_sample_game.json"
    fixture = json.loads(path.read_text(encoding="utf-8"))
    players = fixture["setup"]["players"]
    observer = next(p["player_id"] for p in players if p["controller"] == "human")
    engine = GameEngine(players, rng=Random(0))
    print(f"Mở ván {fixture['fixture_id']} với {len(players)} người.")

    for turn in fixture["rounds"]:
        number = turn["round"]
        night = turn["night"]
        for player_id, target in night["wolf_votes"].items():
            submit(engine, player_id, {"type": "vote", "target_id": target})
        engine.advance()

        pending = night["role_actions"][:]
        while engine.phase.startswith("night_"):
            for action in pending[:]:
                options = engine.allowed_actions(action["player_id"])
                if any(option["type"] == action["type"] for option in options):
                    submit(engine, action["player_id"], action)
                    pending.remove(action)
            engine.advance()
        if pending:
            raise RuntimeError(f"Đêm {number} còn kỹ năng chưa dùng.")
        deaths = engine.view(observer)["last_deaths"]
        if deaths != night["expected"]["deaths"]:
            raise RuntimeError(f"Đêm {number} sai kết quả: {deaths}")
        print(f"Đêm {number}: {', '.join(deaths) or 'không ai'} bị loại.")

        engine.advance()
        day = turn["day"]
        if number == fixture["day_vote_case"]["view"]["round"]:
            example = fixture["day_vote_case"]["invalid_example"]
            actor = fixture["day_vote_case"]["view"]["player_id"]
            rejected = engine.submit_action(actor, example["action"])
            if rejected["accepted"] or rejected["phase"] != example["expected"]["phase"]:
                raise RuntimeError("Ca vote người đã chết chưa bị từ chối.")
        for player_id, target in day["votes"].items():
            submit(engine, player_id, {"type": "vote", "target_id": target})
        engine.advance()
        view = engine.view(observer)
        expected = {"eliminated": view["eliminated"], "winner": view["winner"]}
        if expected != day["expected"]:
            raise RuntimeError(f"Ngày {number} sai kết quả: {expected}")
        print(f"Ngày {number}: {view['eliminated'] or 'không ai'} bị loại.")

    if engine.phase != "finished":
        raise RuntimeError("Kịch bản kết thúc trước khi ván có kết quả.")
    print(f"Phe thắng: {engine.winner}.")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
