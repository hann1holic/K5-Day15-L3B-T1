# Phân công làm game Ma Sói chơi được

Mục tiêu: một game web chơi được thật. Mỗi người chơi trên máy của mình, vào chung một phòng bằng mã. Ghế trống được bot AI ngồi thay. Chơi hết ván ngày–đêm, xem kết quả, chơi lại.

`python run.py` bản terminal giữ nguyên làm bản dự phòng. Bộ máy luật `codebase/game_engine.py` dùng lại, không viết lại.

## Kiến trúc

```
Trình duyệt (mỗi người 1 máy)                Server Python
┌──────────────────────────┐   WebSocket   ┌──────────────────────────────┐
│ Vite + Phaser + HTML     │ ◀───────────▶ │ server.py: phòng, mã phòng,   │
│ Sảnh → Phòng chờ → Ván   │  state/action │ chia vai, hẹn giờ pha, bot    │
│ → Kết quả                │               │   └─ GameEngine (đã có)       │
└──────────────────────────┘               │   └─ agent.answer() cho bot   │
                                           └──────────────────────────────┘
```

Luồng chơi: tạo phòng, nhận mã → bạn bè nhập mã vào phòng → chủ phòng bấm Bắt đầu → ghế trống thành bot → chia vai ngẫu nhiên → chơi ngày–đêm, mỗi pha có đồng hồ → hết ván lật vai cả bàn → chơi lại.

Hợp đồng giữa server và giao diện: [`docs/api.md`](api.md). Server và giao diện đều làm theo file này. Muốn đổi thì sửa `api.md` trước, Hùng duyệt, rồi mới sửa code.

## Chia việc

| Người | Phần | File của mình | Xong khi |
|---|---|---|---|
| **Lê Huy Anh** | Server và phòng chơi | `codebase/server.py`, `codebase/rooms.py`, `deal_roles()` trong `codebase/game_engine.py`, `requirements.txt` | 3 trình duyệt + 2 bot chơi hết một ván; mỗi người chỉ nhận view của mình; thoát ra vào lại vẫn chơi tiếp |
| **Nguyễn Tấn Dũng** | Giao diện web | `codebase/web/**` | Đủ 4 màn Sảnh · Phòng chờ · Ván · Kết quả; chơi hết ván không cần mở terminal |
| **Vũ Duy Khánh** | Bot AI và nội dung | `codebase/agent.py`, `codebase/ai.py`, `codebase/tools.py`, `data/roles.json`, `validation/log.md` | Bot gọi model thật, nói tiếng Việt tự nhiên, trả lời dưới 5 giây; lỗi hay quá giờ thì rơi về mock; không lộ vai |
| **Dư Văn Hùng** | Hợp đồng, test, review | `docs/api.md`, `tests/**` | `api.md` chốt trước khi mọi người code; script test giả lập 2 người + 2 bot qua server; mọi PR vào `dev` qua tay Hùng |

### Lê Huy Anh · Server

1. **Chia vai** `deal_roles(n, rng) -> list[str]` theo số người. Đề xuất, nhóm chốt:

   | Số người | Vai |
   |---|---|
   | 4 | 1 Sói thường · Tiên tri · 2 Dân |
   | 5 | 1 Sói thường · Tiên tri · Bảo vệ · 2 Dân |
   | 6–7 | 2 Sói thường · Tiên tri · Bảo vệ · còn lại Dân |
   | 8–10 | 2 Sói thường · Sói con · Tiên tri · Bảo vệ · Phù thủy · còn lại Dân |
   | 11–20 | thêm Thợ săn, Thần tình yêu; Sói ≈ 1/4 số người |

2. **Phòng:** tạo phòng ra mã 4 ký tự; vào phòng bằng mã + tên hiển thị; người tạo là chủ phòng; ghế tối đa chủ phòng chọn (4–20); chỉ chủ phòng bắt đầu được; tối thiểu 4 ghế tính cả bot.
3. **Ghế và bot:** lúc bắt đầu, ghế trống thành bot. Gán mã `P01…` ngẫu nhiên cho cả người lẫn bot để không đoán được ai là bot qua mã.
4. **Đồng hồ pha:** thảo luận 90 giây · vote 30 giây · mỗi pha đêm 20 giây (cấu hình được). Hết giờ thì `advance()`. Mọi người có lượt đều đã hành động thì chuyển sớm. Người không hành động: vote/kỹ năng bỏ qua.
5. **Bot:** đến lượt thì gọi `agent.answer(json view)` trong luồng riêng, không làm treo phòng. Quá 5 giây hoặc bị từ chối thì dùng hành động dự phòng như `codebase/app.py`.
6. **Đẩy trạng thái:** mỗi lần ván đổi, gửi `state` cho **từng người** bằng `engine.view(pid)` của chính người đó. Không bao giờ gửi vai người khác trước khi hết ván.
7. **Vào lại:** mỗi người nhận `token` khi vào phòng; mất mạng thì vào lại bằng mã phòng + token.
8. Lệnh chạy: `python -m codebase.server` (ghi vào README).

### Nguyễn Tấn Dũng · Giao diện

1. Dựng Vite + Phaser trong `codebase/web/`. Lệnh: `npm install` rồi `npm run dev`.
2. **Sảnh:** ô tên hiển thị, nút Tạo phòng, ô nhập mã + nút Vào.
3. **Phòng chờ:** mã phòng to để đọc cho bạn, danh sách người, số ghế bot sẽ thêm, nút Bắt đầu (chỉ chủ phòng).
4. **Ván:**
   - Map làng 2D (Kenney Tiny Town), nhân vật đứng quanh đống lửa, tên trên đầu; người chết thành bia mộ.
   - Lớp HTML đè lên: thẻ vai của mình, đồng hồ pha, khung chat chung + nhắn riêng, nút hành động sinh từ `allowed_actions`, thông báo sáng ra.
   - Ban đêm phủ màu tối, chỉ người có lượt thấy nút.
   - Nút chỉ gửi `action`; kết quả nhận/từ chối hiện ngay cạnh nút.
5. **Kết quả:** phe thắng, lật vai cả bàn, nút Chơi lại.
6. Khi server chưa xong: làm với server giả theo `docs/api.md` (file JSON mẫu hoặc mock WebSocket).
7. Nếu còn giờ: nhân vật đi lại, bong bóng chat trên đầu, âm thanh ngày/đêm.

Mọi người dùng chung một kiểu nhân vật, chỉ khác màu và tên. Không dùng sprite theo vai.

### Vũ Duy Khánh · Bot AI và nội dung

1. Nối model thật trong `codebase/ai.py` theo `docs/connect-model.md`. Token lấy từ `usage`, không ước lượng. Không commit `.env`.
2. Prompt NPC theo vai trong `codebase/agent.py`. Mỗi bot một tên Việt và một nét tính cách nhẹ (nóng tính, ít nói, hay nghi…). Lời nói dưới 150 ký tự.
3. Giữ lớp kiểm đang có: hành động phải nằm trong `allowed_actions`, lời nói không lộ vai/đồng đội/người yêu; sai thì rơi về mock.
4. `answer()` phải trả trong 5 giây; quá giờ trả mock (server cũng tự chặn).
5. `data/roles.json`: mỗi vai có tên tiếng Việt, phe, mô tả một dòng, câu hướng dẫn cho pha có kỹ năng. Dũng đọc file này để hiển thị.
6. Cho người ngoài nhóm chơi thử khi có M1/M2, ghi lỗi và phản hồi vào `validation/log.md`.

### Dư Văn Hùng · Hợp đồng, test, review

1. **Đầu tiên:** chốt [`docs/api.md`](api.md) với Huy Anh và Dũng.
2. `tests/test_room.py`: giả lập 2 client người + 2 bot chơi hết ván qua server; kiểm mỗi client chỉ nhận view của mình, không thấy vai người khác trước khi hết ván, ván luôn kết thúc.
3. Review mọi PR vào `dev`. Chạy test trước khi merge.

## Quy tắc làm việc

- Mỗi người một nhánh `game/<phan>`, PR vào `dev`, Hùng review rồi merge.
- Chỉ sửa file của mình (bảng trên). Cần đổi file người khác thì nhắn người đó.
- PR nhỏ, mô tả cách chạy thử.
- Không commit `.env`, API key, thông tin cá nhân người chơi thử.

## Thứ tự ghép

| Mốc | Có gì | Ai |
|---|---|---|
| **M0** | `docs/api.md` chốt | Hùng |
| **M1** | 1 người chơi trên trình duyệt với bot mock, hết một ván | Huy Anh (phòng, đồng hồ pha) + Dũng (4 màn, chưa cần map) |
| **M2** | 2–3 người trên nhiều máy cùng phòng, bot lấp ghế trống, vào lại được | Huy Anh + Dũng, test của Hùng |
| **M3** | Bot dùng model thật | Khánh |
| **M4** | Map Phaser, hiệu ứng, âm thanh, chạy online cho người ngoài vào, chơi thử | Dũng, Huy Anh, Khánh |

M1 xong là đã có game chơi được. Các mốc sau là thêm tính năng.
