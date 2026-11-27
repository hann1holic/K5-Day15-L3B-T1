# Voice — hợp đồng giao thức (nhánh `feature/voice`)

Ba phần làm song song theo đúng file này. Đổi hợp đồng thì sửa file này trước, báo các phần còn lại.

## Phạm vi

- Voice chỉ bật khi **ván đang chạy và phòng không có bot** (`room.bots` rỗng — mọi ghế là người). Phòng có bot: không voice (bot không nghe được, lệch thông tin).
- Kiểu **mesh WebRTC**: mỗi cặp người chơi một `RTCPeerConnection`, chỉ audio. Server **chỉ chuyển tín hiệu**, không đụng tới âm thanh.
- Ai được nói (server tính, client tự tắt mic theo):
  - `day_discussion`: người **còn sống**.
  - `finished` (hết ván): mọi người.
  - Mọi pha khác (đêm, `pair`, `night_prepare`, `day_arrival`, `day_vote`): không ai.
- Người đã chết vẫn **nghe** được phòng chung, không nói được.
- Luật tắt/bật mic do client thực thi (mesh không cho server cắt tiếng) — chấp nhận cho hackathon.

## Server → client: trường `voice` trong mỗi `state_message`

Mỗi tin `type: "state"` (hoặc tin trạng thái ván hiện có do `Room.state_message` tạo) có thêm:

```json
"voice": {
  "enabled": true,
  "can_speak": true,
  "peers": ["P02", "P05"]
}
```

- `enabled`: ván chạy và phòng không có bot. `false` thì client đóng hết kết nối voice.
- `can_speak`: theo bảng trên, cho chính người nhận tin.
- `peers`: `player_id` của **những người khác đang có kết nối WebSocket** trong phòng (không gồm mình). Rỗng khi `enabled` là `false`.
- `lobby_message` không có trường này (trong sảnh chưa có `player_id`).

## Tín hiệu WebRTC

Client → server:

```json
{"type": "rtc_signal", "to": "P03", "data": { "kind": "offer", "sdp": "..." }}
```

Server → người nhận:

```json
{"type": "rtc_signal", "from": "P01", "data": { ... y nguyên ... }}
```

Server kiểm, sai thì trả `{"type":"error","code":...}` như các lệnh khác:

| Điều kiện | code |
|---|---|
| `voice.enabled` là false | `voice_disabled` |
| `to` không phải người khác đang kết nối trong phòng | `bad_target` |
| `data` không phải object, hoặc `json.dumps(data)` > 6000 ký tự | `bad_message` |
| `data.kind` không thuộc danh sách dưới | `bad_message` |
| quá 120 tin `rtc_signal` / 10 giây / người | `rate_limited` |

`data.kind` hợp lệ:

| kind | trường thêm | ý nghĩa |
|---|---|---|
| `offer` | `sdp` (str) | SDP offer |
| `answer` | `sdp` (str) | SDP answer |
| `ice` | `candidate` (object hoặc null) | trickle ICE; `null` = hết candidate |
| `hangup` | — | đóng kết nối với người gửi |
| `group_invite` | `group_id` (str), `members` (list player_id) | mời vào nhóm riêng |
| `group_accept` | `group_id` | đồng ý |
| `group_decline` | `group_id` | từ chối |
| `group_leave` | `group_id` | rời nhóm riêng |

Server **không** đọc `sdp`/`candidate`/nhóm — chỉ kiểm `kind` và kích thước rồi chuyển. Giới hạn WebSocket là 8192 byte/tin nên luôn dùng trickle ICE (không đợi gom hết candidate vào SDP).

## Ai gọi trước (tránh hai bên cùng offer)

Với mỗi cặp, người có `player_id` **nhỏ hơn** (so chuỗi) tạo offer. Người còn lại chỉ trả lời. Khi `peers` thêm người mới, bên nhỏ hơn gọi; khi người đó biến khỏi `peers`, cả hai tự đóng.

## Nhóm riêng 1-1, 1-2, 1-3

- Chỉ tạo được trong `day_discussion`, chỉ giữa người còn sống. Nhóm có tối đa **4 người** (mình + 3).
- Mỗi người ở **tối đa một** nhóm riêng cùng lúc.
- Đang trong nhóm riêng: tiếng của mình **chỉ gửi tới thành viên nhóm** (các kết nối khác `replaceTrack(null)`); mình vẫn nghe phòng chung nhưng nhỏ đi (ví dụ volume 0.3) để biết làng đang nói gì.
- Hết `day_discussion` → mọi nhóm riêng tự giải tán.
- Không dựng kết nối mới cho nhóm: mesh đã có kết nối từng cặp, nhóm chỉ là chọn gửi tiếng tới đâu.

## ICE servers

Client đọc `import.meta.env.VITE_ICE_SERVERS` (JSON mảng `RTCIceServer`). Không có thì dùng `[{"urls": "stun:stun.l.google.com:19302"}]`. TURN (nếu cần cho 4G/wifi trường chặn) cấu hình qua biến này.

## HTTPS

`getUserMedia` chỉ chạy trên `localhost` hoặc HTTPS. Trang HTTPS thì client dùng `wss://<host>:8000/ws`, nên server cần tùy chọn `--certfile` / `--keyfile`.

## Chia việc

| Phần | Ai | File được sửa |
|---|---|---|
| Server: `voice` trong state, relay `rtc_signal`, TLS | phiên Claude | `codebase/server.py`, `codebase/rooms.py` |
| Client: mesh, mic, nhóm riêng, UI | Codex #1 | `codebase/web/src/voice.js` (mới), `main.js`, `index.html`, `styles.css`, `theme-rpg.css` |
| HTTPS dev, cert, tài liệu chạy | Codex #2 | `codebase/web/vite.config.js` (mới), `scripts/dev-cert.sh` (mới), `docs/voice.md` (mới), `codebase/web/README.md`, `.gitignore` |

Không phần nào sửa file của phần khác.
