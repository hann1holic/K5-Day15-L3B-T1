# Công việc CP2 Ma Sói

**Hạn nộp 19:30 ngày 27/11.** Bản CP2 cần chạy hết một ván Ma Sói giả lập từ terminal bằng `python run.py`, kèm sơ đồ kiến trúc và bộ đánh giá đã chốt ngưỡng đạt. Dùng [ván mẫu 6 người, 2 vòng](../data/cp2_sample_game.json) và NPC mock. Map, voice và model thật thuộc lượt phát triển tiếp theo.

## Lê Huy Anh · Luật và tích hợp

**Nhánh `feat/game-engine`** · `spec.md`, `canvas.md`, `codebase/game_engine.py`

- [ ] Chốt trạng thái từng người được xem, danh sách hành động hợp lệ và định dạng gửi hành động. Gửi ví dụ vote cho Hùng, Dũng và Khánh.
- [ ] Vẽ sơ đồ trong `spec.md` §4. Sơ đồ phải chỉ rõ NPC nhận thông tin gì, đề xuất hành động ở đâu và bộ máy kiểm luật ở đâu.
- [ ] Triển khai mở ván, chuyển ngày–đêm, vote, xử lý kết quả và xét thắng. Chạy được ván mẫu đến kết quả **phe Dân thắng**.
- [ ] Điền ngưỡng bằng số vào `spec.md` §7 theo đúng nội dung Khánh ghi trong `eval/metric_spec.yaml`.
- [ ] Cập nhật Canvas với 1–3 dòng thay đổi từ CP1 và tiến độ thu bằng chứng thực tế.

## Dư Văn Hùng · NPC mock

**Nhánh `feat/ai-players`** · `codebase/agent.py`

- [ ] Dùng `day_vote_case.view` trong ván mẫu làm đầu vào thử. Đây là thông tin được phép xem của một NPC.
- [ ] Trả lời thoại hoặc đề xuất hành động theo lượt, ví dụ `{"type":"vote","target_id":"P05"}`. Chuyển hành động về bộ máy để kiểm tra và ghi nhận.
- [ ] Giữ đầu vào và đầu ra của `answer(text)` theo khung repo để Khánh dùng được bộ chạy eval. Gửi Dũng và Khánh một cặp input/output đã chạy.

## Nguyễn Tấn Dũng · Bản chạy terminal

**Nhánh `feat/game-client`** · `codebase/app.py`

- [ ] Dùng dữ liệu ván mẫu để dựng màn vào ván, trạng thái người chơi và thao tác vote.
- [ ] Ghép NPC mock và bộ máy để chạy đủ lượt ngày, đêm và công bố phe thắng. Giao diện chỉ hiển thị trạng thái mà người chơi được phép xem.
- [ ] Chạy `python run.py` từ thư mục gốc và gửi các bước thao tác để nhóm chạy lại.

## Vũ Duy Khánh · Benchmark, metric và Data Card

**Nhánh `test/eval-and-cost`** · `eval/`, `data/DATA_CARD.md`, `evidence/`

- [ ] Điền ít nhất **10 ca có đáp án và tiêu chí chấm** trong `eval/benchmark.csv`. Bắt đầu từ hai ca trong ván mẫu: vote hợp lệ và vote người đã chết.
- [ ] Bổ sung ca cho hòa phiếu Sói, Sói con cắn hai mục tiêu, Bảo vệ gặp bình độc, Thợ săn và Tình Nhân chết dây chuyền, và NPC bị hỏi về vai bí mật.
- [ ] Điền ít nhất **3 metric có ngưỡng bằng số và cách chấm** trong `eval/metric_spec.yaml`. Gửi đúng ngưỡng đã thống nhất cho Huy Anh để đưa vào §7.
- [ ] Ghi nguồn, cách dựng và giới hạn của dữ liệu giả lập trong `data/DATA_CARD.md`. Cập nhật tiến độ phỏng vấn thật vào `evidence/summary.md`.

## Ghép và nộp

- [ ] Mỗi người mở PR từ nhánh của mình vào `dev`. Huy Anh ghép phần luật và dữ liệu trước, sau đó ghép NPC mock, terminal và đánh giá.
- [ ] Trên `dev`, chạy `python run.py` và `python run.py check`. Chạy thử trọn ván, rồi đối chiếu ngưỡng trong §7 với file metric.
- [ ] Kiểm tra Canvas cập nhật, sơ đồ §4, ngưỡng §7, ≥10 ca, ≥3 metric và Data Card.
- [ ] Huy Anh mở PR `dev` → `main`, kiểm tra commit trên GitHub và nộp form CP2. Giữ nguyên chuẩn đạt sau 19:30.

Xem [đầu vào, đầu ra và hướng dẫn chia nhánh](phan-cong.md) khi cần chi tiết tích hợp.
