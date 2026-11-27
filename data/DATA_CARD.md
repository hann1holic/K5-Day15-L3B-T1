# Data card — dữ liệu CP2

Bản đầu ngày 27/11/2026, **(nháp chờ nhóm duyệt trước 19:30)**. Chưa có dữ liệu phỏng vấn, khảo sát hoặc ván của người dùng thật. Hai dataset dưới đây đều là `synthetic`, không phải bằng chứng pain.

## Dataset 1 · Ván mẫu CP2

- File: `data/cp2_sample_game.json`, mã fixture `CP2-GAME-01`.
- Nguồn: nhóm tự dựng kịch bản sáu người, hai vòng ngày–đêm; một người được cấu hình `human`, năm người `mock`. Nhãn controller không chứng minh có người thật tham gia.
- Mục đích: replay ván terminal, kiểm luật và hợp đồng `view`/`submit_action`; làm gốc dựng benchmark NPC.
- Quy mô: 6 ID giả P01–P06, 2 vòng; gồm vai Dân, Sói thường, Tiên tri, Bảo vệ và một `day_vote_case`. Vai toàn bàn và đáp án fixture chỉ dùng cho khởi tạo/kiểm thử.
- Xử lý: đọc JSON, tạo `GameEngine`, chạy hành động theo pha rồi lấy `view(player_id)` đã lọc quyền; không đưa setup hoặc expected vào input NPC. Chạy minh họa: `python3 -m codebase.game_demo`; engine dùng `Random(0)` trong demo.
- Giới hạn: không phải ván thật, không có người dùng thật hay dữ liệu cá nhân. Không có sẵn cặp Tình Nhân, Phù thủy, Thợ săn hoặc Sói con; không đại diện mọi cấu hình/chiến thuật.
- Kiểm: đã đối chiếu cấu trúc fixture với engine khi dựng benchmark. Chưa có người trong nhóm duyệt độc lập hoặc số output NPC được chấm tay; không báo cáo độ chính xác từ fixture.

## Dataset 2 · Benchmark NPC CP2

- File: `eval/benchmark.csv`, phiên bản nháp CP2 ngày 27/11/2026; 14 ca NPC01–NPC14: `thuong` 4, `kho` 7, `tu_choi` 3 (cả 3 là tấn công).
- Nguồn: tự viết từ fixture và các biến thể tự dựng; `tu_viet: cp2_sample_game` 11 ca, `tu_viet` 3 ca (NPC08, NPC09, NPC10). Nguồn người dùng/data thật: 0/14.
- Cách dựng: khởi tạo engine từ fixture, seed `Random(0)`; tạo chat bằng `submit_action`, tiến pha bằng `advance`, lấy nguyên view của người được kiểm. NPC01 dùng chat của `day_vote_case`; NPC03/NPC13 đổi bảo vệ để Tiên tri sống; NPC07 tạo hòa phiếu rồi sang thảo luận ngày kế; NPC10 đổi P05 thành Sói con, loại P05 ban ngày rồi lấy view lượt cắn thứ hai. NPC08 xóa `allowed_actions`; NPC09 cắt dấu đóng JSON để kiểm đầu vào lỗi. Đây là hai ngoại lệ cố ý đối với view hợp lệ.
- Xử lý: JSON một dòng trong ô input, CSV có đúng sáu cột; không chứa setup, expected, vai toàn bàn hoặc đáp án. Không lọc theo output NPC, không gọi model để viết đáp án.
- Kiểm cấu trúc đã thực hiện khi dựng: 12 view đầy đủ khớp kết quả `engine.view`; 11 hành động mẫu trên bản sao engine được `submit_action` chấp nhận, 1 view không có lượt; kiểm riêng 1 view thiếu trường và 1 JSON hỏng. Đây là kiểm dữ liệu thử, chưa phải chấm chất lượng NPC.
- Nhãn: expected/pass_criterion do tự viết theo hợp đồng chính thức, cần nhóm duyệt. Ba metric và danh sách ID áp dụng ở `eval/metric_spec.yaml`; chưa có người thứ hai chấm thử 5 output.
- Giới hạn: bộ CP2 nhỏ, chưa đủ 20–30 ca CP3 và chưa đạt tỷ lệ nguồn thật ≥1/3. Chưa phủ kỹ năng pair/save/poison/mark, voice/map hay model thật. Chế độ giả token 0 không tạo bằng chứng chất lượng model hay chi phí API thực.
