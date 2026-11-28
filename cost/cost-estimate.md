# Chi phí khi dùng thật

> Số lấy từ `python run.py simulate` (`cost/simulate-1-summary.md`), không điền tay. Lúc build dùng tài khoản trả phí của nhóm; giá dưới đây là giá API trả phí.

## 1. Đầu vào

- **Quy ước:** 1 phiên = 1 ván Ma Sói có bot lấp ghế. 1 lượt = 1 lần một bot phải hành động, tức một lần gọi `agent.answer()`.
- **Persona** (`cost/personas.yaml`): 3 kiểu theo câu 18 của khảo sát ("Trong 1 tháng qua, chuyện muốn chơi mà thiếu người xảy ra mấy lần?"). Chỉ 8/20 người báo ≥1 lần, nên lấy 8 người này làm người dùng:

  | Persona | Tỉ lệ | Ván có bot / người / tháng | Lượt bot / ván | Nguồn |
  |---|---|---|---|---|
  | `thieu_nguoi_nhieu` | 1/8 | 4 | 10 | Khảo sát câu 18: "từ 4 lần trở lên", lấy mức thấp nhất |
  | `thieu_nguoi_vua` | 4/8 | 2,5 | 10 | Khảo sát câu 18: "2–3 lần", lấy điểm giữa *(tự ước tính)* |
  | `thieu_nguoi_it` | 3/8 | 1 | 10 | Khảo sát câu 18: "1 lần" |

  Giả định: mỗi lần thiếu người là một ván có bot *(tự ước tính)*. Khảo sát chưa hỏi người chơi có chấp nhận chơi với bot hay không.
- **Lượt bot / ván = 10, đo và tính như sau:**
  - Chạy 500 ván 6 ghế bằng `codebase/game_engine.py`, hành động ngẫu nhiên hợp lệ: mỗi bot hành động 3,4 lần mỗi ván, ván trung bình dài 1,9 vòng.
  - Server web cho mỗi bot thêm tối đa 1 lượt đáp lời ở mỗi pha thảo luận: +1,9, thành khoảng 5,3 lượt mỗi bot mỗi ván.
  - Số bot mỗi ván lấy từ khảo sát ("thiếu mấy người": 1 người ×6, 2 ×5, 3 ×2, ≥4 ×1), trung bình 1,86 bot. Vậy 1,86 × 5,3 ≈ 10 lượt.
- **Số người dùng / tháng**, 3 kịch bản:
  - **Thấp 233:** 700 học viên L3 (README hackathon) × 20/24 người đã chơi trong 3 tháng × 8/20 người thiếu người ≥1 lần/tháng (khảo sát).
  - **Cơ sở 1.000** và **cao 5.000:** *(tự ước tính)*, giả định game lan sang bạn bè ngoài lớp và vài cộng đồng board game. Chưa có nguồn công khai.
- **Giá** (USD / 1 triệu token, vào / ra): Claude Haiku 5.5 **$0,10 / $0,50** (prompt ≤100K token) · Claude Sonnet 5.5 **$2,00 / $10,00**. Nguồn: bảng giá API Anthropic theo tài liệu claude-api cập nhật 03/11/2026, xem 28/11/2026. **Cần đối chiếu lại với `further-reading/model-prices.md` của repo đề.**
- **Tỉ lệ đạt** dùng để tính: **15/21 (71%)**, lượt `run-2@20261128-091212`, cũng là lượt 1 chính thức trong `eval/README.md`. Khi có lượt 2, chạy lại `python run.py simulate --rate-from eval/run-N.csv` với N là lượt 2 để cập nhật.
- **Đo token trên `claude-haiku-5-5`**, tính giá cho `claude-haiku-5-5` và `claude-sonnet-5-5`. Hai model cùng hãng nhưng số token của Sonnet vẫn có thể lệch đôi chút.

## 2. Kết quả mô phỏng

Lượt mô phỏng: `cost/simulate-1.csv` · run ID `simulate-1@20261128-112814` · **50 phiên** · seed 42 · lỗi 0/50. Trace: `traces/simulate-1.jsonl`.

| Persona | Số phiên mô phỏng | Lượt / phiên | Token vào / phiên | Token ra / phiên | Gọi model / phiên |
|---|---:|---:|---:|---:|---:|
| thieu_nguoi_nhieu | 6 | 10 | 14.572 | 1.416 | 7,8 |
| thieu_nguoi_vua | 26 | 10 | 15.049 | 1.477 | 8,2 |
| thieu_nguoi_it | 18 | 10 | 14.682 | 1.466 | 7,9 |

Số lần gọi model mỗi phiên (khoảng 8) thấp hơn số lượt (10). Lý do: ở những lượt bot không có hành động hợp lệ (`allowed_actions` rỗng, ví dụ bot đã chết), `answer()` không gọi model.

| Model | Chi phí / phiên | Chi phí / task thành công | / tháng — thấp (233) | / tháng — cơ sở (1.000) | / tháng — cao (5.000) | / người / tháng (cơ sở) |
|---|---:|---:|---:|---:|---:|---:|
| claude-haiku-5-5 | $0,0022 | $0,0031 | $1,10 | $4,71 | $23,56 | $0,0047 |
| claude-sonnet-5-5 | $0,0444 | $0,0621 | $21,96 | $94,25 | $471,26 | $0,0943 |

Chi phí / task thành công = chi phí trung bình mỗi phiên ÷ tỉ lệ đạt (71%), không coi như đạt 100%.

## 3. So với impact

- **Impact / người / tháng** (`spec.md` §2): 8 người báo ít nhất 15 lần thiếu người mỗi tháng. Với 15 phút chờ mỗi lần, mỗi người mất khoảng **28 phút chờ mỗi tháng** (225 phút ÷ 8 người, kịch bản minh hoạ). Theo khảo sát, 9/15 lần thiếu người kết thúc bằng việc mất hẳn ván.
- **Chi phí / người / tháng** (cơ sở, Claude Haiku 5.5): **$0,0047**, tức khoảng 2,1 ván có bot mỗi tháng, mỗi ván $0,0022.
- **Kết luận một dòng — đáng làm không:** **Đáng làm.** Với Haiku 5.5, chi phí model chưa tới 0,5 cent cho mỗi người mỗi tháng, đổi lại khoảng 28 phút chờ và phần lớn số ván bị mất. Chi phí model không phải là rào cản. Câu hỏi còn mở là người chơi có chấp nhận chơi với bot không, và cái đó cần người dùng thử để trả lời, không phải mô phỏng chi phí.

## 4. Độ nhạy và giới hạn

| Cần gạt | Chi phí / tháng (cơ sở) | Đổi bao nhiêu |
|---|---:|---|
| Haiku 5.5 (đang dùng) | $4,71 | — |
| Đổi sang Sonnet 5.5 | $94,25 | ×20 |
| Quy mô cao (5.000 người), Haiku | $23,56 | ×5, vẫn dưới $25 / tháng |
| Tỉ lệ đạt tăng từ 71% lên 90% | chi phí / task thành công $0,0031 → $0,0024 | −21% |

- **Token:** mỗi lần gọi model mất khoảng 1.800 token vào. Phần lớn là system prompt theo vai và view JSON của bot, gửi lại ở mỗi lượt. Có thể giảm bằng cách rút gọn view (bỏ trường bot không cần, như `players` khi đã có danh sách người còn sống) hoặc dùng prompt caching, nếu prompt đủ dài để được cache.
- **Chưa tính:** chi phí server và hosting cho phòng chơi WebSocket, chi phí voice/TURN nếu bật, giờ công người duyệt. Ở quy mô này, nhiều khả năng các khoản đó lớn hơn chi phí model *(tự ước tính, chưa đo)*.
- **Giới hạn của số:** persona chỉ dựa trên 8 người trong khảo sát; số người dùng ở kịch bản cơ sở và cao là tự ước tính; lượt bot mỗi ván đo bằng hành động ngẫu nhiên, nên ván thật có thể dài hoặc ngắn hơn.
