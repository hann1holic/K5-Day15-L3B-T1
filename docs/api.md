# API server ↔ giao diện

> **Bản nháp — Hùng duyệt, Huy Anh và Dũng đồng ý thì chốt.** Chỗ ghi *(cần chốt)* là đề xuất.
> Server (`codebase/server.py`, Huy Anh) và giao diện (`codebase/web/`, Dũng) đều làm theo file này. Đổi hợp đồng thì sửa file này trước.

## 1. Kết nối

- Một WebSocket duy nhất: `ws://<host>:8000/ws` *(cần chốt cổng)*.
- Mọi tin nhắn là JSON một object, có trường `type`.
- Server là nguồn sự thật. Giao diện **không tự tính luật**, chỉ hiển thị `state` và gửi `action`.
- Mỗi lần ván hoặc phòng đổi, server gửi lại **toàn bộ** `lobby` hoặc `state` cho từng người (không gửi phần chênh lệch). Giao diện cứ vẽ lại theo tin mới nhất.

## 2. Client gửi lên server

| `type` | Trường | Khi nào |
|---|---|---|
| `create_room` | `name`: tên hiển thị (1–20 ký tự) · `seats`: 4–20 | Ở Sảnh, bấm Tạo phòng. Người gửi thành chủ phòng |
| `join_room` | `code`: mã 4 ký tự · `name` | Ở Sảnh, nhập mã rồi bấm Vào |
| `rejoin` | `code` · `token` | Mở lại trang hoặc mất mạng. Giao diện lưu `code` và `token` vào `localStorage` |
| `set_seats` | `seats`: 4–20 | Chủ phòng đổi số ghế ở Phòng chờ |
| `start` | — | Chủ phòng bấm Bắt đầu |
| `action` | `action`: hành động theo mục 5 | Trong ván, khi người chơi bấm nút hoặc gửi chat |
| `restart` | — | Chủ phòng bấm Chơi lại ở màn Kết quả (giữ phòng, chia vai mới) |
| `leave` | — | Rời phòng |

Ví dụ:

```json
{"type": "join_room", "code": "K7QM", "name": "Lan"}
{"type": "action", "action": {"type": "vote", "target_id": "P05"}}
```

## 3. Server gửi xuống client

| `type` | Trường | Khi nào |
|---|---|---|
| `joined` | `code` · `token` · `is_host` | Trả lời `create_room`, `join_room`, `rejoin` thành công |
| `lobby` | xem 3.1 | Ở Phòng chờ, mỗi khi có người vào/ra hoặc đổi số ghế |
| `state` | xem 3.2 | Từ lúc bắt đầu đến khi hết ván, mỗi khi ván đổi |
| `action_result` | `accepted` · `reason` (khi từ chối) | Trả lời mỗi `action` |
| `error` | `code` · `message` | Lệnh sai (mục 6). Không đóng kết nối |

### 3.1 `lobby`

```json
{
  "type": "lobby",
  "code": "K7QM",
  "seats": 6,
  "members": [
    {"name": "Lan", "is_host": true, "connected": true},
    {"name": "Minh", "is_host": false, "connected": true}
  ],
  "bots_on_start": 4,
  "can_start": true
}
```

`bots_on_start = seats - số người`. `can_start` chỉ `true` với chủ phòng.

### 3.2 `state`

`view` là **nguyên kết quả `engine.view(player_id)` của chính người nhận**, không thêm bớt. Server bọc thêm thông tin phòng:

```json
{
  "type": "state",
  "code": "K7QM",
  "me": "P03",
  "names": {"P01": "Lan", "P02": "Bot Tư", "P03": "Minh", "P04": "Bot Hoa", "P05": "Bot Sáu", "P06": "Bot Năm"},
  "deadline": 1764240000000,
  "acted": true,
  "view": {
    "round": 1,
    "phase": "day_vote",
    "player_id": "P03",
    "role": "dan",
    "faction": "dan",
    "players": [{"player_id": "P01", "alive": true}, {"player_id": "P04", "alive": false}],
    "public_chat": [{"player_id": "P05", "text": "Tôi nghi P03 từ đầu."}],
    "private_chat": [],
    "allowed_actions": [{"type": "vote", "target_ids": ["P01", "P02", "P05", "P06"]}],
    "last_deaths": ["P04"],
    "eliminated": null,
    "winner": null
  },
  "reveal": null
}
```

| Trường | Nghĩa |
|---|---|
| `me` | Mã ghế của người nhận |
| `names` | Tên hiển thị của mọi ghế. **Không có cờ bot.** Tên bot do Khánh đặt, không bắt buộc có chữ "Bot" *(cần chốt: có cho người chơi biết ghế nào là bot không)* |
| `deadline` | Thời điểm hết pha, mili-giây Unix. Giao diện tự đếm ngược |
| `acted` | Người nhận đã hành động bắt buộc trong pha này chưa (để làm mờ nút) |
| `view` | Xem bảng dưới |
| `reveal` | `null` cho đến khi `view.phase == "finished"`; khi đó là `[{"player_id","role","faction","alive"}]` của cả bàn |

**Trường trong `view`** (theo `codebase/game_engine.py`):

| Trường | Luôn có | Nghĩa |
|---|---|---|
| `round`, `phase` | có | Vòng, pha hiện tại (mục 4) |
| `player_id`, `role`, `faction` | có | Chỉ của người nhận |
| `players` | có | Mọi ghế và còn sống không; không có vai |
| `public_chat` | có | Chat chung đã gửi |
| `private_chat` | có | Tin riêng người nhận gửi hoặc nhận |
| `allowed_actions` | có | Nút được bấm ở pha này; `[]` = chỉ chờ |
| `last_deaths` | có | Người chết đêm vừa rồi (để hiện "sáng ra") |
| `eliminated` | có | Người bị vote loại ngày vừa rồi, hoặc `null` |
| `winner` | có | `null` hoặc `dan` · `soi` · `tinh_nhan` · `hoa` |
| `wolf_peers` | chỉ Sói | Mã các Sói khác |
| `wolf_votes`, `strikes_remaining` | chỉ Sói, pha `night_wolf` | Phiếu cắn của đàn, số lượt cắn còn lại |
| `partner` | chỉ Tình Nhân | `{player_id, role}` của người yêu |
| `inspections` | chỉ Tiên tri | Kết quả soi |

## 4. Pha

| `phase` | Ai có nút | Hạn giờ đề xuất |
|---|---|---|
| `pair` | Thần tình yêu | 20 giây |
| `night_wolf` | Sói còn sống | 20 giây (lượt cắn thứ hai cùng tên pha) |
| `night_protect` | Bảo vệ | 20 giây |
| `night_inspect` | Tiên tri | 20 giây |
| `night_witch` | Phù thủy | 20 giây |
| `night_hunter` | Thợ săn | 20 giây |
| `day_discussion` | mọi người sống | 90 giây |
| `day_vote` | mọi người sống | 30 giây |
| `finished` | — | — |

Pha đêm của vai không có trong ván thì bộ máy tự bỏ qua. Mọi người có lượt đã hành động xong thì server chuyển pha sớm *(cần chốt: thảo luận có chuyển sớm không)*.

Giao diện **không được lộ vai qua pha**: ban đêm mọi người đều thấy cùng một màn "Đêm xuống", chỉ người có `allowed_actions` mới thấy nút.

## 5. Hành động (`action.action`)

Giao diện sinh nút từ `allowed_actions`, rồi gửi:

| `type` | Trường | Ghi chú |
|---|---|---|
| `vote` | `target_id` | Vote ban ngày, hoặc Sói vote cắn ban đêm |
| `protect` · `inspect` · `save` · `poison` · `mark` | `target_id` | Chỉ chọn trong `target_ids` |
| `pair` | `target_ids`: 2 mã khác nhau | |
| `chat` | `text` | Chat chung, tối đa 200 ký tự *(cần chốt)* |
| `whisper` | `target_id` · `text` | Nhắn riêng |

Server tự điền người gửi từ phiên kết nối, **không nhận `player_id` từ client**.

## 6. Lỗi

`action_result.reason` lấy nguyên từ bộ máy:

| `reason` | Nghĩa |
|---|---|
| `invalid_action` | Không phải object hành động |
| `action_not_allowed` | Loại hành động không có trong `allowed_actions` lúc này |
| `invalid_target` | Mục tiêu không hợp lệ (đã chết, ngoài danh sách…) |
| `invalid_text` | Chat rỗng |

`error.code` của server:

| `code` | Khi nào |
|---|---|
| `room_not_found` | Sai mã phòng |
| `room_full` | Phòng đủ ghế người thật |
| `game_in_progress` | Vào phòng khi ván đang chạy (chỉ `rejoin` được) |
| `bad_token` | `rejoin` sai token |
| `not_host` | Không phải chủ phòng mà gửi `start` / `set_seats` / `restart` |
| `bad_message` | JSON sai hoặc thiếu trường |

## 7. Bot

- Lúc `start`, mỗi ghế trống thành một bot. Mã `P01…` xáo ngẫu nhiên cho cả người lẫn bot.
- Đến lượt bot, server gọi `agent.answer(json.dumps(view))` trong luồng riêng, đọc `{"speech", "action", "reason"}` từ `output`.
- `reason` **không bao giờ** gửi xuống client.
- Bot quá 5 giây hoặc bị từ chối hai lần: server dùng hành động dự phòng (mục tiêu đầu tiên cho vote, bỏ qua cho kỹ năng).
- Người thật mất kết nối giữa ván: ghế vẫn là người, hết giờ thì bỏ lượt *(cần chốt: có cho bot chơi thay sau N pha không)*.
