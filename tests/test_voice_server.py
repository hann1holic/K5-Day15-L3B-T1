"""Voice relay checks against a real local server (docs/voice-protocol.md).

Run: python -m unittest tests.test_voice_server
"""

import asyncio
import json
from random import Random
import unittest
from unittest import mock

from websockets.asyncio.client import connect
from websockets.asyncio.server import serve

from codebase import server as server_module
from codebase.server import GameServer


def no_model(view):
    # Bots fall back to a random legal action without calling a model.
    return None


class Client:
    def __init__(self, ws):
        self.ws = ws
        self.inbox = asyncio.Queue()
        self.reader = asyncio.create_task(self._read())
        self.token = None
        self.state = None

    async def _read(self):
        async for raw in self.ws:
            message = json.loads(raw)
            if message["type"] == "state":
                self.state = message
            await self.inbox.put(message)

    async def send(self, **message):
        await self.ws.send(json.dumps(message))

    async def expect(self, predicate, timeout=15):
        async def wait():
            while True:
                message = await self.inbox.get()
                if predicate(message):
                    return message
        return await asyncio.wait_for(wait(), timeout)

    async def error(self, code):
        message = await self.expect(lambda m: m["type"] in ("error", "rtc_signal"))
        assert message == {**message, "type": "error", "code": code}, message
        return message

    async def close(self):
        await self.ws.close()
        self.reader.cancel()
        await asyncio.gather(self.reader, return_exceptions=True)


def is_state(m):
    return m["type"] == "state"


class VoiceServerTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        patches = [mock.patch.object(server_module, "PREPARE_SECONDS", 0),
                   mock.patch.object(server_module, "DAWN_STEP_SECONDS", 0)]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        self.game = GameServer(rng=Random(7), discussion_seconds=60, vote_seconds=60,
                               night_seconds=1, choose_bot=no_model)
        self.ws_server = await serve(self.game.handle, "127.0.0.1", 0, max_size=8192)
        port = self.ws_server.sockets[0].getsockname()[1]
        self.url = f"ws://127.0.0.1:{port}/ws"
        self.clients = []

    async def asyncTearDown(self):
        for client in self.clients:
            await client.close()
        await self.game.close()
        self.ws_server.close()
        await self.ws_server.wait_closed()

    async def client(self, **first):
        client = Client(await connect(self.url))
        self.clients.append(client)
        await client.send(**first)
        joined = await client.expect(lambda m: m["type"] in ("joined", "error"))
        assert joined["type"] == "joined", joined
        client.token = joined["token"]
        client.code = joined["code"]
        return client

    async def room(self, seats, humans):
        host = await self.client(type="create_room", name="A", seats=seats)
        others = [await self.client(type="join_room", code=host.code, name=name)
                  for name in "BCDEFG"[:humans - 1]]
        players = [host, *others]
        await host.send(type="start")
        for player in players:
            await player.expect(is_state)
        return players

    async def test_full_human_room_relays_signals(self):
        players = await self.room(4, 4)
        ids = [p.state["me"] for p in players]
        for player in players:
            voice = player.state["voice"]
            self.assertTrue(voice["enabled"])
            self.assertEqual(voice["peers"], sorted(i for i in ids if i != player.state["me"]))
            self.assertFalse(voice["can_speak"])  # the match opens at night

        a, b, c, d = players
        await a.send(type="rtc_signal", to=ids[1], data={"kind": "offer", "sdp": "v=0"})
        relayed = await b.expect(lambda m: m["type"] == "rtc_signal")
        self.assertEqual(relayed, {"type": "rtc_signal", "from": ids[0],
                                   "data": {"kind": "offer", "sdp": "v=0"}})
        await b.send(type="rtc_signal", to=ids[0], data={"kind": "ice", "candidate": None})
        relayed = await a.expect(lambda m: m["type"] == "rtc_signal")
        self.assertEqual(relayed["from"], ids[1])

        await a.send(type="rtc_signal", to=ids[0], data={"kind": "hangup"})
        await a.error("bad_target")
        await a.send(type="rtc_signal", to="P99", data={"kind": "hangup"})
        await a.error("bad_target")
        await a.send(type="rtc_signal", to=ids[1], data={"kind": "shout"})
        await a.error("bad_message")
        await a.send(type="rtc_signal", to=ids[1], data="offer")
        await a.error("bad_message")
        await a.send(type="rtc_signal", to=ids[1], data={"kind": "offer", "sdp": "x" * 6000})
        await a.error("bad_message")

        # A dropped seat leaves everyone's peers; rejoining puts it back.
        await d.close()
        self.clients.remove(d)
        state = await a.expect(lambda m: is_state(m) and ids[3] not in m["voice"]["peers"])
        self.assertEqual(state["voice"]["peers"], sorted(ids[1:3]))
        await b.expect(lambda m: is_state(m) and ids[3] not in m["voice"]["peers"])
        await a.send(type="rtc_signal", to=ids[3], data={"kind": "hangup"})
        await a.error("bad_target")
        d = await self.client(type="rejoin", code=a.code, token=d.token)
        await d.expect(is_state)
        self.assertEqual(d.state["voice"]["peers"], sorted(ids[:3]))
        await a.expect(lambda m: is_state(m) and ids[3] in m["voice"]["peers"])
        await c.expect(lambda m: is_state(m) and ids[3] in m["voice"]["peers"])

        # Day discussion: the living may speak, the dead only listen.
        for player in (a, b, c, d):
            state = await player.expect(lambda m: is_state(m) and m["view"]["phase"] == "day_discussion",
                                        timeout=30)
            alive = {p["player_id"]: p["alive"] for p in state["view"]["players"]}
            self.assertEqual(state["voice"]["can_speak"], alive[state["me"]])
            self.assertTrue(state["voice"]["enabled"])

        # 120 signals per 10 seconds per player; the next one is refused.
        for _ in range(server_module.RTC_RATE_LIMIT):
            await c.send(type="rtc_signal", to=ids[0], data={"kind": "hangup"})
        await c.send(type="rtc_signal", to=ids[0], data={"kind": "hangup"})
        await c.error("rate_limited")
        received = 0
        while received < server_module.RTC_RATE_LIMIT:
            message = await a.expect(lambda m: m["type"] == "rtc_signal")
            self.assertEqual(message["from"], ids[2])
            received += 1

    async def test_room_with_bots_has_no_voice(self):
        players = await self.room(5, 4)
        for player in players:
            self.assertEqual(player.state["voice"], {"enabled": False, "can_speak": False, "peers": []})
        a, b = players[:2]
        await a.send(type="rtc_signal", to=b.state["me"], data={"kind": "offer", "sdp": "v=0"})
        await a.error("voice_disabled")

    async def test_lobby_has_no_voice(self):
        host = await self.client(type="create_room", name="A", seats=4)
        lobby = await host.expect(lambda m: m["type"] == "lobby")
        self.assertNotIn("voice", lobby)
        await host.send(type="rtc_signal", to="P01", data={"kind": "hangup"})
        await host.error("voice_disabled")


if __name__ == "__main__":
    unittest.main()
