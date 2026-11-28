"""Hành động trên map: về nhà, đi lại và nhặt đồ. Chạy: python -m unittest discover -s tests"""

import unittest
from random import Random

from codebase.rooms import Room
from codebase.village import BLOCKED_TILES, HOUSE_DOORS, HOUSE_ENTRANCES, SEARCH_TILES, SQUARE, Village


class HousingTest(unittest.TestCase):
    def setUp(self):
        self.village = Village(Random(0))
        self.village.begin_housing({"P1", "P2", "P3"})

    def test_enter_house_needs_entrance_and_free_house(self):
        enter = {"type": "enter_house", "house_id": "H01"}
        self.assertEqual(self.village.act("P1", enter, 0), "too_far")
        self.village.positions["P1"] = HOUSE_ENTRANCES["H01"]
        self.assertIsNone(self.village.act("P1", enter, 0))
        self.assertEqual(self.village.homes["P1"], "H01")
        self.assertEqual(self.village.allowed_actions("P1"), [])
        self.village.positions["P2"] = HOUSE_ENTRANCES["H01"]
        self.assertEqual(self.village.act("P2", enter, 0), "house_taken")

    def test_finish_housing_gives_everyone_a_distinct_house(self):
        self.village.positions["P1"] = HOUSE_ENTRANCES["H05"]
        self.village.act("P1", {"type": "enter_house", "house_id": "H05"}, 0)
        self.village.finish_housing()
        homes = self.village.homes
        self.assertEqual(set(homes), {"P1", "P2", "P3"})
        self.assertEqual(len(set(homes.values())), 3)
        self.assertEqual(homes["P1"], "H05")
        self.assertEqual(self.village.sleeping, {"P1", "P2", "P3"})
        self.assertIsNone(self.village.phase)

    def test_dead_owner_frees_house_next_night(self):
        self.village.finish_housing()
        house = self.village.homes["P3"]
        self.village.begin_housing({"P1", "P2"})
        self.assertNotIn("P3", self.village.homes)
        self.assertNotIn(house, self.village.homes.values())

    def test_bots_walk_home_before_time_runs_out(self):
        bots = {"P1", "P2", "P3"}
        now = 0.0
        for _ in range(30):  # 15 giây, mỗi bước 0,5 giây
            self.village.bots_go_home(bots, now)
            now += 0.5
        self.assertEqual(self.village.sleeping, bots)
        self.assertEqual(len(set(self.village.homes.values())), 3)


class MovementTest(unittest.TestCase):
    def setUp(self):
        self.village = Village(Random(0))
        self.village.begin_lucky_day({"P1", "P2"})

    def test_move_rate_limit_allows_small_burst_then_rejects(self):
        right = {"type": "move", "dx": 1, "dy": 0}
        results = [self.village.act("P1", right, 0.0) for _ in range(4)]
        self.assertEqual(results, [None, None, None, "move_too_fast"])
        self.assertEqual(self.village.positions["P1"], (SQUARE[0] + 3, SQUARE[1]))

    def test_move_rejects_bad_direction_and_houses(self):
        self.assertEqual(self.village.act("P1", {"type": "move", "dx": 2, "dy": 0}, 0), "invalid_move")
        door_x, door_y, _ = HOUSE_DOORS["H01"]
        self.village.positions["P1"] = (door_x, door_y + 1)
        self.assertIn((door_x, door_y), BLOCKED_TILES)
        self.assertEqual(self.village.act("P1", {"type": "move", "dx": 0, "dy": -1}, 0), "blocked_tile")

    def test_pick_up_needs_one_tile_range_and_one_item_per_player(self):
        x, y = self.village.items["shield"]
        pick = {"type": "pick_up", "item_id": "shield"}
        self.assertEqual(self.village.act("P1", pick, 0), "too_far")
        self.village.positions["P1"] = (x, y)
        self.assertIsNone(self.village.act("P1", pick, 0))
        self.village.positions["P2"] = (x, y)
        self.assertEqual(self.village.act("P2", pick, 0), "item_unavailable")
        self.assertEqual(self.village.allowed_actions("P1"), [{"type": "move"}])
        self.assertEqual(self.village.finish_lucky_day(), {"P1": "shield"})


class LuckyDaySpawnTest(unittest.TestCase):
    def test_spawn_excludes_previous_tiles_even_after_restart(self):
        room = Room("ABC123", 6, Random(0), {}, village_enabled=True)
        host = room.join("Host", None)
        room.start(host)
        previous = set()
        for index in range(3):
            if index == 2:
                room.engine.phase = "finished"
                room.start(host, restart=True)
            room.village.rng.seed(0)  # The same draw would repeat if the pool stayed the same.
            room.village.begin_lucky_day(room.engine.living_ids())
            tiles = set(room.village.items.values())
            self.assertEqual(len(tiles), 2)
            self.assertLessEqual(tiles, set(SEARCH_TILES))
            self.assertTrue(tiles.isdisjoint(previous))
            room.village.finish_lucky_day()
            previous = tiles


if __name__ == "__main__":
    unittest.main()


class GhostTest(unittest.TestCase):
    """Người chết thành linh hồn: đi nhanh gấp đôi, không theo luật làng, chỉ người chết thấy nhau."""

    def setUp(self):
        self.village = Village(Random(0))
        self.village.begin_housing({"P1", "P2", "P3"})
        self.village.finish_housing()
        self.home = self.village.homes["P1"]
        self.village.sync_ghosts({"P2", "P3"})

    def test_dead_player_becomes_ghost_and_house_is_abandoned(self):
        self.assertEqual(self.village.ghosts["P1"], HOUSE_ENTRANCES[self.home])
        self.assertNotIn("P1", self.village.positions)
        self.assertNotIn("P1", self.village.homes)
        self.assertIn(self.home, self.village.abandoned)
        self.assertEqual(self.village.allowed_actions("P1"), [])

    def test_ghost_ignores_gathering_and_anyone_may_take_the_abandoned_house(self):
        self.village.go_to_square({"P2", "P3"})
        self.village.homes.pop("P2")
        self.village.begin_housing({"P2", "P3"})
        self.assertNotIn("P1", self.village.positions)
        self.assertIn("P1", self.village.ghosts)
        self.village.positions["P2"] = HOUSE_ENTRANCES[self.home]
        self.assertIsNone(self.village.act("P2", {"type": "enter_house", "house_id": self.home}, 0))
        self.assertEqual(self.village.homes["P2"], self.home)
        self.assertNotIn(self.home, self.village.abandoned)

    def test_ghost_moves_twice_as_often(self):
        dx, dy = next((dx, dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                      if (self.village.ghosts["P1"][0] + dx, self.village.ghosts["P1"][1] + dy) not in BLOCKED_TILES)
        start = self.village.ghosts["P1"]
        self.assertIsNone(self.village.ghost_move("P1", dx, dy, 0))
        self.assertEqual(self.village.ghosts["P1"], (start[0] + dx, start[1] + dy))
        self.assertIsNone(self.village.ghost_move("P1", -dx, -dy, 0.05))
        self.assertEqual(self.village.ghost_move("P2", 1, 0, 0), "action_not_allowed")

    def test_only_ghosts_see_ghosts(self):
        living = self.village.view("P2", "day_discussion")
        dead = self.village.view("P1", "day_discussion")
        self.assertNotIn("P1", living["positions"])
        self.assertNotIn("ghost", living)
        self.assertTrue(dead["ghost"])
        self.assertIn("P1", dead["positions"])
        self.assertEqual(dead["area"], "map")
        self.assertIn(self.home, dead["abandoned_houses"])
