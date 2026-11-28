"""Luật bộ máy cho Lucky Day, cắn Sói con và chia vai. Chạy: python -m unittest discover -s tests"""

import unittest
from collections import Counter
from random import Random

from codebase.game_engine import WOLF_ROLES, GameEngine, deal_roles


def make(roles):
    """Tạo ván với ID P1, P2… theo thứ tự vai."""
    players = [{"player_id": "P%d" % i, "role": role} for i, role in enumerate(roles, 1)]
    return GameEngine(players, rng=Random(0))


def run_night(engine, actions=()):
    """Gửi lần lượt hành động đêm khi tới đúng pha, rồi đi tới sáng."""
    pending = list(actions)
    while engine.phase.startswith("night_"):
        for pid, action, _ in [item for item in pending if engine.phase == item[2]]:
            result = engine.submit_action(pid, action)
            assert result["accepted"], (pid, action, result)
        pending = [item for item in pending if engine.phase != item[2]]
        engine.advance()
    assert not pending, pending


def vote_day(engine, votes, items=None):
    """Từ day_discussion: phát vật phẩm, mở vote, bỏ phiếu và khóa phiếu."""
    assert engine.phase == "day_discussion"
    if items:
        engine.set_day_items(items)
    engine.advance()
    for voter, target in votes.items():
        assert engine.submit_action(voter, {"type": "vote", "target_id": target})["accepted"]
    engine.advance()


def wolf(pid, target):
    return (pid, {"type": "vote", "target_id": target}, "night_wolf")


class DealRolesTest(unittest.TestCase):
    def test_wolf_count_matches_rules(self):
        expected = {range(4, 8): 1, range(8, 12): 2, range(12, 16): 3, range(16, 20): 4, range(20, 21): 5}
        for seats_range, wolves in expected.items():
            for seats in seats_range:
                roles = Counter(deal_roles(seats, Random(seats)))
                self.assertEqual(sum(roles[r] for r in WOLF_ROLES), wolves, seats)
                self.assertGreaterEqual(seats - wolves, 3 * wolves, seats)


class WolfHuntTest(unittest.TestCase):
    def setUp(self):
        self.engine = make(["soi_thuong", "soi_con", "dan", "dan", "dan", "dan"])

    def test_pack_may_bite_soi_con_and_it_is_marked_as_ally(self):
        option = self.engine.allowed_actions("P1")[0]
        self.assertIn("P2", option["target_ids"])
        self.assertEqual(option["ally_target_ids"], ["P2"])
        soi_con = self.engine.allowed_actions("P2")[0]
        self.assertNotIn("P1", soi_con["target_ids"])
        self.assertNotIn("P2", soi_con["target_ids"])

    def test_biting_soi_con_opens_two_bites_next_night(self):
        run_night(self.engine, [wolf("P1", "P2")])
        self.assertEqual(self.engine.view("P1")["last_deaths"], ["P2"])
        vote_day(self.engine, {})
        self.assertEqual(self.engine.view("P1")["strikes_remaining"], 2)

    def test_wolf_chat_only_reaches_hunting_wolves(self):
        result = self.engine.submit_action("P1", {"type": "wolf_chat", "text": "Cắn P3"})
        self.assertTrue(result["accepted"])
        self.assertEqual(self.engine.view("P2")["wolf_chat"][0]["text"], "Cắn P3")
        self.assertNotIn("wolf_chat", self.engine.view("P3"))
        self.assertFalse(self.engine.submit_action("P3", {"type": "wolf_chat", "text": "hi"})["accepted"])


class LuckyDayTest(unittest.TestCase):
    def test_sword_doubles_vote(self):
        engine = make(["soi_thuong", "dan", "dan", "dan", "dan"])
        run_night(engine)
        vote_day(engine, {"P2": "P3", "P4": "P1"}, items={"P2": "sword"})
        self.assertEqual(engine.view("P1")["eliminated"], "P3")
        self.assertEqual(engine.view("P1")["lucky_vote_result"]["double_voters"], ["P2"])

    def test_shield_saves_vote_target_and_is_used_up(self):
        engine = make(["soi_thuong", "dan", "dan", "dan", "dan"])
        run_night(engine)
        vote_day(engine, {"P1": "P2", "P3": "P2"}, items={"P2": "shield"})
        view = engine.view("P2")
        self.assertIsNone(view["eliminated"])
        self.assertEqual(view["lucky_vote_result"]["shielded"], "P2")
        self.assertNotIn("night_shield", view)
        run_night(engine, [wolf("P1", "P2")])
        self.assertEqual(engine.view("P1")["last_deaths"], ["P2"])

    def test_unused_shield_blocks_bite_and_poison_for_one_night(self):
        engine = make(["soi_thuong", "dan", "dan", "dan", "phu_thuy", "dan"])
        run_night(engine)
        vote_day(engine, {}, items={"P2": "shield"})
        self.assertTrue(engine.view("P2")["night_shield"])
        self.assertNotIn("night_shield", engine.view("P3"))
        poison = ("P5", {"type": "poison", "target_id": "P2"}, "night_witch")
        run_night(engine, [wolf("P1", "P2"), poison])
        view = engine.view("P2")
        self.assertEqual(view["last_deaths"], [])
        self.assertTrue(next(p for p in view["players"] if p["player_id"] == "P2")["alive"])
        self.assertNotIn("night_shield", view)
        # Bình độc vẫn bị dùng hết để Phù thủy không suy ra ai giữ khiên.
        vote_day(engine, {})
        self.assertFalse(any(o["type"] == "poison" for o in engine.allowed_actions("P5")))

    def test_shield_does_not_stop_hunter_chain(self):
        engine = make(["soi_thuong", "dan", "tho_san", "dan", "dan", "dan"])
        run_night(engine, [("P3", {"type": "mark", "target_id": "P2"}, "night_hunter")])
        vote_day(engine, {"P1": "P3", "P4": "P3"}, items={"P2": "shield"})
        view = engine.view("P1")
        self.assertEqual(view["last_deaths"], ["P3", "P2"])
        self.assertNotIn("night_shield", engine.view("P2"))

    def test_items_only_set_before_vote(self):
        engine = make(["soi_thuong", "dan", "dan", "dan"])
        with self.assertRaises(ValueError):
            engine.set_day_items({"P2": "shield"})


if __name__ == "__main__":
    unittest.main()
