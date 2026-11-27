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
| `night_wolf` | `wolf_chat` | `text` từ 1 đến 200 ký tự. Chỉ Sói đang săn nhận tin nhắn này. |
| `night_protect` | `protect` | `target_id`. |
| `night_inspect` | `inspect` | `target_id`. Kết quả nằm trong `inspections` của Tiên tri sau khi khóa pha. |
| `night_witch` | `save`, `poison` | `target_id`. Có thể gửi mỗi loại một lần nếu còn bình. |
| `night_hunter` | `mark` | `target_id`. |
| `day_discussion` | `chat`, `whisper` | `text` và thêm `target_id` cho tin nhắn riêng. |
| `finished` | Hết lượt | `winner` là `dan`, `soi`, `tinh_nhan` hoặc `hoa`. |

Hùng dùng `view` làm đầu vào NPC và giữ `answer(text) -> {"output": str}` cho bộ đánh giá. Dũng dùng cùng `view` để mở nút đúng pha và gọi `submit_action` khi người chơi chọn. Nguồn nội bộ như vai toàn bàn và đáp án fixture thuộc phần khởi tạo và kiểm thử.

## Mốc chuẩn bị riêng và tập trung buổi sáng trên web

Hai pha dưới đây nằm trong WebSocket `state`. Bộ máy terminal tiếp tục chạy trực tiếp theo các pha ở trên.

| `view.phase` | Ai nhận và dùng dữ liệu nào |
|---|---|
| `night_prepare` | Chỉ người sắp có lượt. `deadline` là thời điểm bắt đầu hành động theo Unix mili giây, cách 5 giây khi pha mở. `view.next_phase` là lượt kế tiếp của chính người đó, gồm cả Cupid. `allowed_actions` rỗng cho tới khi server mở lượt. |
| `night_wait` | Người chưa tới lượt dùng chung một `phase_id` và `deadline` đến sáng. Server chừa cùng 5 giây chuẩn bị cho cả lượt trống, nên họ không thấy lượt bị bỏ qua khi một vai đã chết. |
| `day_arrival` | Mỗi người nhận `view.arrivals`, danh sách ID đã xuất hiện ở phòng khách theo thứ tự. `view.you_died` chỉ đúng với người bị loại trong đêm đó, dùng làm tín hiệu riêng. |
| `day_discussion` hoặc `finished` | Server chuyển pha sau khi công bố lần lượt tất cả người sống. Nếu đêm đó đã có phe thắng, server gửi kết quả sau pha tập trung. |

Ở `day_arrival`, `deadline` là `null`, `allowed_actions` và `last_deaths` rỗng, `winner` và `reveal` là `null`. Trường `players` duy trì trạng thái công khai trước khi xử lý cái chết trong đêm. Giao diện dùng `arrivals` để hiện người vừa xuất hiện, rồi dùng `you_died` và `phase_id` để báo riêng một lần. Người vào lại giữa pha nhận danh sách đã tập trung và tín hiệu riêng của chính mình.

## Tín hiệu hiệu ứng loại người và kết quả ván

| `view.effect.type` | Ai nhận và chạy lúc nào |
|---|---|
| `night_slash` | Chỉ người chết trong đêm nhận lúc bắt đầu `day_arrival`. Hiện một nhát chém ngang màn hình của người đó. Những người còn lại tiếp tục thấy danh sách người tới phòng khách theo từng đợt. |
| `vote_execution` | Cả phòng nhận cùng ID sự kiện và `player_id` của người bị loại trực tiếp bằng phiếu. Hiện cảnh dân làng ném người đó vào đống lửa ở quảng trường. Người chết dây chuyền không có cảnh riêng. Nếu hòa, bỏ lượt hoặc khiên chặn phiếu loại thì không có sự kiện này. |
| `victory` | Ghế thuộc phe thắng nhận khi `view.phase` chuyển sang `finished`. Người đã bị loại vẫn nhận theo phe cuối ván. |
| `defeat` | Ghế thuộc phe thua nhận cùng lúc công bố kết quả. |
| `draw` | Mọi ghế nhận nếu `view.winner` là `hoa`. |

Dũng dùng `view.effect.id` để phát mỗi hiệu ứng một lần trong phòng kể cả khi server gửi lại cùng trạng thái. Trong 2 giây dành cho `vote_execution`, `view.phase` vẫn là `day_vote`, `allowed_actions` rỗng, `deadline` cho biết lúc kết thúc cảnh. Giữ quảng trường cho đến khi server gửi pha kế tiếp. Server gửi đêm mới hoặc công bố phe thắng sau khoảng này. Tín hiệu hết hiệu lực khi `view.effect` biến mất.

Khi kết thúc ván, server gửi tín hiệu riêng cùng `view.winner` và `reveal` sau cảnh bình minh hoặc cảnh vote cuối. Dùng `view.winner` để chọn phong cách cho phe thắng. Khi người chơi vào lại sau khi ván kết thúc, server gửi lại cùng `effect.id` và cùng kết quả của ghế đó.

## Workflow map, nhà ngủ và Lucky Day

Frontend đang ghép map có thể tạo phòng bằng `{"type":"create_room","name":"Lan","seats":6,"village":true}`. Phòng cũ mặc định dùng luồng hiện tại. Trạng thái phòng chờ có `village_enabled`. Pha map dùng cùng WebSocket và cùng `phase_id`, gửi trong phong bì `{"type":"action","phase_id":7,"action":{...}}`.

| Pha | Thời gian và dữ liệu nhận | Hành động |
|---|---|---|
| `night_housing` | 15 giây trước lượt Cupid hoặc Sói. `view.village.houses` chứa mã, loại, tọa độ cửa và chủ nhà. `home_id` và `inside_home` của người nhận cho biết đã vào nhà chưa. | `{"type":"move","dx":1,"dy":0}` hoặc `{"type":"enter_house","house_id":"H03"}`. Dùng phím F để gửi hành động vào nhà. |
| `night_wolf` | Chỉ Sói đang săn nhận `view.village.area: "square"`, vị trí của đàn quanh `view.village.square` và danh sách chủ nhà để gắn tên ở cửa. | `wolf_chat` để bàn riêng, `vote` để chốt mục tiêu. Server từ chối `move`. |
| Các lượt đêm còn lại | `view.village.area` là `home` cho người ngủ và các vai dùng kỹ năng. | Hành động theo vai tiếp tục dùng hợp đồng ở trên. |
| `lucky_day` | 30 giây sau khi tập trung xong vào ngày chẵn. `visible_items` chỉ có vật phẩm gần người nhận và chưa bị lấy. `held_item` là vật phẩm của chính người nhận. | `move` hoặc `{"type":"pick_up","item_id":"shield"}`. ID của hai vật phẩm là `shield` và `sword`. |
| `day_discussion`, `day_vote` | `view.village.area` là `square`. Khi có gươm hoặc khiên phát huy tác dụng, trạng thái sau khi khóa phiếu có `view.lucky_vote_result` với `shielded` và `double_voters`. | Chat và vote như cũ. Server từ chối đi lại trong hai pha này. |

Bản tọa độ mẫu do server cung cấp trong `view.village.size`, `square`, `positions` và `houses`. Tọa độ bắt đầu từ 0. `view.village.blocked_tiles` là danh sách `{x, y}` của các ô nhà bị chặn, kể cả ô cửa. Với cửa tại `(x, y)`, thân nhà chiếm `x-1` đến `x+1` và `y-1` đến `y`. Chỉ gửi `enter_house` từ ô `(x, y+1)`. Khi vào nhà, server đặt nhân vật tại tọa độ cửa và khóa di chuyển. Dùng `positions` và tọa độ cửa để ẩn người đã vào nhà. Dùng `owner_id` để hiện tên chủ và làm mờ phím F ở nhà của người khác.

Mỗi bước đi một ô theo bốn hướng. Giao diện gửi `move` mỗi 180 ms. Server có dung sai 200 ms cho tin đến dồn và từ chối bước vào ô nhà bằng `blocked_tile`. Lấy đồ trong phạm vi một ô theo Manhattan. Nếu hai người cùng tranh một nhà hoặc một món, thao tác hợp lệ đến server trước được ghi nhận. Giao diện đọc trạng thái kế tiếp để đồng bộ tọa độ và các mã lỗi như `house_taken`, `item_unavailable`, `too_far` hoặc `move_too_fast`.

Trong `night_wolf`, `view.wolf_pack` chứa `player_id` và `role` (`soi_thuong` hoặc `soi_con`) của từng Sói còn sống trong đàn, kể cả người nhận. Dũng dùng danh sách này để hiện đúng hình từng Sói bên đống lửa. `view.wolf_chat` chứa tin nhắn riêng của đàn trong đêm đó. Trong hành động `vote`, `target_ids` là toàn bộ mục tiêu hợp lệ và `ally_target_ids` đánh dấu Sói con nếu đàn có thể cắn đồng đội. Các trường này chỉ được gửi cho Sói đang có lượt săn.

### Tên và hiển thị cổ vật

Dũng dùng cùng một bảng ánh xạ tên, biểu tượng và công dụng cho vật phẩm trên map, thông báo nhặt đồ, ô đồ đang giữ và kết quả bỏ phiếu. Giữ mã `sword` và `shield` trong `held_item`, `visible_items` và khi gửi `pick_up`.

| Mã server | Tên hiển thị | Mô tả |
|---|---|---|
| `sword` | **Gươm Excalibur** | Phiếu của bạn tính gấp đôi trong ngày hôm nay. |
| `shield` | **Khiên Pridwen** | Cứu bạn nếu bị vote loại hôm nay. Nếu còn khiên sau lượt vote, nó chặn cú cắn và bình độc trong đêm kế tiếp. |

Trước khi khóa phiếu, chỉ chủ vật phẩm thấy tên cổ vật mình đang giữ. Sau khi nhận `view.lucky_vote_result`, dùng `double_voters` để hiện Gươm Excalibur đã nhân đôi phiếu và `shielded` để hiện Khiên Pridwen đã cứu người bị vote loại. Khiên còn hiệu lực qua đêm có `view.night_shield: true` trong trạng thái riêng của chủ khiên, kể cả khi `held_item` đã được dọn. Dùng trường này để hiện khiên còn bảo vệ người chơi. Server bỏ trường này ở `day_arrival`.

#### Đũa Morgana trong bản thử

- Cổ vật hiếm nhặt trong Lucky Day và dùng vào ban đêm. Mốc đang thử là 10% cơ hội mỗi ván, tối đa một đũa và một lần dùng.
- Phe Dân chọn một người bất kỳ đã chết để hồi sinh. Người đó giữ vai và phe. Nếu người dùng đũa chết sau đó, người được hồi sinh chết theo. Nếu Tiên tri gốc được cứu sau khi Tiên tri tập sự đã lên vai, mỗi Tiên tri soi riêng một lượt.
- Phe Sói chọn một người còn sống bên Dân để gửi lời mời ẩn danh. Chỉ người được mời thấy nút đồng ý hoặc từ chối. Người đồng ý chuyển thành Sói thường. Cách dùng cho phe Tình Nhân và mã action chính thức cần chốt khi đưa bản thử vào server.
- Sáng hôm sau, dùng đúng một thông báo công khai cho cả hai cách dùng, kể cả khi lời mời thất bại. **“Đêm qua, có người đã dùng Đũa Morgana.”** Giữ kín người dùng, mục tiêu và nội dung lời mời. Nếu hồi sinh thành công, cập nhật người trở lại tại thời điểm họ xuất hiện ở quảng trường.
- Chỉ hiện Đũa Morgana và các nút thao tác khi server gửi vật phẩm hoặc quyền tương ứng. Server hiện phục vụ Gươm Excalibur và Khiên Pridwen trong workflow Lucky Day.

Chạy từ thư mục gốc để kiểm tra bộ máy với ván mock:

~~~bash
python -m codebase.game_demo
~~~

Dũng ghép bộ máy vào trình chạy terminal để luồng chính đi qua `python run.py`.
