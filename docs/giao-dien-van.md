# Giao diện dữ liệu ván Ma Sói CP2

Bộ máy giữ trạng thái chính thức của ván. NPC và giao diện nhận trạng thái theo từng người, rồi gửi đề xuất hành động về bộ máy. Dữ liệu để bắt đầu nằm trong [ván mẫu CP2](../data/cp2_sample_game.json).

| Hàm | Ai gọi | Đầu vào và kết quả |
|---|---|---|
| `GameEngine(players)` | Phần khởi tạo ván | Danh sách có `player_id`, `role` và `controller` nếu có. Bộ máy xác định phe theo vai gốc, rồi cập nhật khi ghép đôi. |
| `view(player_id)` | Host, trước mỗi lượt hiển thị hoặc gọi model | Trả thông tin theo quyền xem của một người, gồm `phase`, `round`, `role`, `faction`, danh sách người sống, đoạn chat được phép đọc và `allowed_actions`. Kết quả soi và vai người yêu chỉ hiện cho người được phép biết. |
| `submit_action(player_id, action)` | Host khi nhận hành động người chơi hoặc đề xuất NPC | Trả `accepted`, `phase` và `reason` nếu từ chối. ID người hành động đến từ phiên chơi hoặc bộ điều phối NPC. |
| `advance()` | Host khi khóa lượt hoặc hết thời gian | Chốt kết quả của pha và trả tên pha mới. Host xử lý tuần tự các thao tác trong cùng một ván. |

Một người đang ở pha `day_vote` có thể thấy:

~~~json
{"player_id":"P03","phase":"day_vote","allowed_actions":[{"type":"vote","target_ids":["P01","P02","P05","P06"]}]}
~~~

Hành động và kết quả:

~~~json
{"type":"vote","target_id":"P05"}
{"accepted":true,"phase":"day_vote"}
~~~

Gửi ID đã chết hoặc chọn ngoài danh sách hợp lệ sẽ trả `accepted: false`. Phiếu được ghi ngay khi hợp lệ, còn việc ai bị loại diễn ra khi host khóa pha.

### Pha và loại hành động

| Pha | Loại hành động | Dữ liệu |
|---|---|---|
| `pair` | `pair` | `target_ids` chứa hai ID khác nhau. |
| `night_wolf`, `day_vote` | `vote` | `target_id`. Với lượt cắn thứ hai, pha vẫn là `night_wolf`, host đọc lại trạng thái và danh sách mục tiêu. |
| `night_protect` | `protect` | `target_id`. |
| `night_inspect` | `inspect` | `target_id`. Kết quả nằm trong `inspections` của Tiên tri sau khi khóa pha. |
| `night_witch` | `save`, `poison` | `target_id`. Có thể gửi mỗi loại một lần nếu còn bình. |
| `night_hunter` | `mark` | `target_id`. |
| `day_discussion` | `chat`, `whisper` | `text` và thêm `target_id` cho tin nhắn riêng. |
| `finished` | Hết lượt | `winner` là `dan`, `soi`, `tinh_nhan` hoặc `hoa`. |

Hùng dùng `view` làm đầu vào NPC và giữ `answer(text) -> {"output": str}` cho bộ đánh giá. Dũng dùng cùng `view` để mở nút đúng pha và gọi `submit_action` khi người chơi chọn. Nguồn nội bộ như vai toàn bàn và đáp án fixture thuộc phần khởi tạo và kiểm thử.

Chạy từ thư mục gốc để kiểm tra bộ máy với ván mock:

~~~bash
python -m codebase.game_demo
~~~

Dũng ghép bộ máy vào trình chạy terminal để luồng chính đi qua `python run.py`.
