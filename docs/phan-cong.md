# Phân công triển khai Ma Sói

Mỗi người làm trên nhánh của mình, mở pull request vào `dev`. Huy Anh ghép các phần trên `dev`, chạy thử rồi mở pull request từ `dev` vào `main` cho bản nộp checkpoint.

## Ưu tiên CP2 · 19:30 ngày 27/11

Bản chạy CP2 là một ván Ma Sói mẫu 6 chỗ đi hết luồng bằng `python run.py`. Dùng NPC mock để chạy ổn định. Phần map, voice và kết nối model thật xếp ở lượt triển khai sau khi đã ghép bản CP2.

| Người | Nhánh | Đầu ra cần ghép trước CP2 |
|---|---|---|
| Lê Huy Anh | `feat/game-engine` | Viết sơ đồ và ranh giới AI trong `spec.md` §4. Chốt hợp đồng trạng thái, hành động và kết quả để Hùng, Dũng dùng chung. Làm luật tối thiểu đủ chạy ván mẫu. Lấy 3 ngưỡng số từ Khánh và ghi giống nhau vào §7. Cập nhật `canvas.md` với 1–3 dòng thay đổi từ CP1 và tiến độ bằng chứng thực tế. |
| Dư Văn Hùng | `feat/ai-players` | Viết NPC mock trong `codebase/agent.py` theo hợp đồng ván. Với trạng thái của từng NPC, trả về lời thoại và mục tiêu hợp lệ để bộ máy game kiểm tra. Bàn giao một trạng thái mẫu cùng kết quả dự kiến cho Dũng và Khánh. Giữ hàm `answer(text)` để khung eval gọi được. |
| Nguyễn Tấn Dũng | `feat/game-client` | Chỉnh `codebase/app.py` để lệnh `python run.py` từ gốc repo đi hết ván mẫu: mở ván, nói chuyện và vote ban ngày, sói vote rồi các vai dùng kỹ năng ban đêm, công bố kết quả và kết thúc ván. Dùng giao diện dòng lệnh cho lượt ghép CP2. |
| Vũ Duy Khánh | `test/eval-and-cost` | Thay dòng mẫu trong `eval/benchmark.csv` bằng ít nhất 10 ca có đáp án và tiêu chí chấm. Điền ít nhất 3 metric trong `eval/metric_spec.yaml` và nguồn, cách dựng, giới hạn dữ liệu trong `data/DATA_CARD.md`. Ghi tiến độ phỏng vấn thực tế vào `evidence/summary.md` và gửi đúng các ngưỡng số cho Huy Anh. |

**Sơ đồ cần thể hiện trong §4.** Người chơi hoặc NPC gửi hành động → bộ máy giữ trạng thái và chọn đúng thông tin được phép xem → NPC mock đề xuất lời thoại và phiếu → bộ máy kiểm luật, áp dụng hành động và phát kết quả. Bản dùng model thật thay thành phần mock trong cùng luồng.

**Ba ngưỡng đề xuất để nhóm duyệt trước khi chốt.** 100% hành động NPC được chấp nhận đúng lượt và đúng mục tiêu hợp lệ, 100% ca kiểm tra thông tin bí mật không lộ dữ kiện ngoài vai, và ít nhất 80% ca có lý do bỏ phiếu bám thông tin NPC được phép biết. Ghi rõ cách chấm và tập ca áp dụng cho từng chỉ số. Khánh và Huy Anh đối chiếu hai file trước khi ghép. Giữ nguyên ngưỡng đã nộp sau 19:30.

**Trước khi nộp.** Ghép các PR vào `dev`, chạy `python run.py` và `python run.py check`. Kiểm tra có sơ đồ §4, ngưỡng số §7, ít nhất 10 ca, ít nhất 3 metric, Data Card và Canvas đã cập nhật. Huy Anh ghép bản CP2 vào `main` và gửi form với link repo, spec, benchmark, ngưỡng đạt và tiến độ bằng chứng.

## Lê Huy Anh · Luật và bộ máy ván

**Nhánh** `feat/game-engine`
**Nơi làm** `docs/luat-choi.md`, `docs/giao-dien-van.md`, `codebase/game_engine.py`, phần kiến trúc trong `spec.md`.

1. Viết bản luật chung trước, gồm chia vai và phe, ghép Tình Nhân, quyền từng vai, thứ tự ngày–đêm, vote ban ngày và điều kiện thắng. Ghi rõ Sói vote trước, hòa phiếu cao nhất thì bốc một mục tiêu trong nhóm hòa, và lượt săn sau khi Sói con chết có tối đa hai mục tiêu khác nhau.
2. Chốt giao diện dữ liệu cho Hùng và Dũng. Tối thiểu cần lấy trạng thái ván theo từng người, danh sách hành động hoặc mục tiêu hợp lệ, và gửi hành động. Ghi một ví dụ đầu vào và đầu ra cho thao tác vote.
3. Triển khai kiểm tra hành động, kết quả đêm, chết dây chuyền của Thợ săn và Tình Nhân, rồi mới xét thắng. Cung cấp ván mẫu có thể đi từ mở phòng đến kết thúc với hành động giả lập.

**Bàn giao khi** ván mẫu chạy hết ngày và đêm, xử lý được ca hòa vote Sói và một ca chết dây chuyền, đồng thời Hùng và Dũng có ví dụ để tích hợp. Mở PR bản luật và giao diện dữ liệu trước để hai phần kia làm song song.

## Dư Văn Hùng · NPC AI

**Nhánh** `feat/ai-players`
**Nơi làm** `codebase/agent.py`, `codebase/ai.py`, `codebase/tools.py`, `docs/ai-usage.md`.

1. Dựng một ván mẫu hoặc trạng thái mẫu để thử NPC Sói, Dân và Tình Nhân. Tạo ngữ cảnh riêng từ vai, mục tiêu phe, lời thoại công khai và tin nhắn riêng mà NPC được nhận.
2. Kết nối model thật. NPC trả lời khi được chất vấn, phát biểu và chọn phiếu hoặc mục tiêu kỹ năng theo danh sách hành động hợp lệ. Chuyển đề xuất của NPC cho bộ máy game kiểm tra và ghi nhận.
3. Giữ hợp đồng `answer(text) -> {"output": str}` để bộ đánh giá và mô phỏng gọi được. Dùng bộ ghi trace có sẵn để Khánh lấy số lượt gọi model và token.

**Bàn giao khi** có thể trình diễn một lượt NPC phát biểu và bỏ phiếu bằng model thật. Khánh có ví dụ đầu vào và đầu ra để viết bộ câu thử.

## Nguyễn Tấn Dũng · Phòng chơi và giao diện

**Nhánh** `feat/game-client`
**Nơi làm** `codebase/app.py` và phần web trong `codebase/web/`. Nếu cần thư viện thêm, ghi vào `requirements.txt`.

1. Làm phòng chờ, tham gia bằng mã phòng, hiển thị số chỗ tối đa 20 và danh sách người chơi. Dựng map ngày bằng dữ liệu mẫu để làm song song với Huy Anh.
2. Làm điều khiển di chuyển, chat chung, chat riêng và voice theo khoảng cách. Đồng bộ vị trí và lời thoại giữa hai máy thật trong cùng phòng. Tin nhắn riêng chỉ hiện ở phía gửi và nhận.
3. Làm màn vote ban ngày, màn thao tác ban đêm theo vai, thông báo kết quả sáng và màn hình thắng. Lấy trạng thái đã lọc theo người chơi và danh sách hành động hợp lệ từ bộ máy game.

**Bàn giao khi** hai người thật vào cùng phòng, thấy nhau di chuyển, thử được ba kênh trò chuyện và chơi hết một ván với NPC. Để ghép sớm, đưa phòng, chat chữ và vote lên PR trước phần voice, rồi bổ sung voice trên cùng nhánh.

## Vũ Duy Khánh · Bằng chứng, đánh giá và chi phí

**Nhánh** `test/eval-and-cost`
**Nơi làm** `evidence/`, `eval/benchmark.csv`, `eval/metric_spec.yaml`, `eval/report.md`, `cost/personas.yaml`, `cost/cost-estimate.md` và `validation/log.md`.

1. Phỏng vấn ít nhất 3 người ngoài nhóm từng chơi Ma Sói hoặc game suy luận xã hội. Ghi lần gần nhất khó gom đủ người, thời gian chờ và ít nhất 5 trích dẫn hoặc ví dụ nguyên văn đã ẩn danh.
2. Viết ít nhất 10 ca cho CP2, rồi hoàn thiện 20–30 ca cho CP3. Tách ca luật và ca NPC trong bảng để biết lỗi thuộc phần nào. Ưu tiên hòa phiếu Sói, Sói con kích hoạt cắn hai người, Bảo vệ gặp bình độc, Thợ săn và Tình Nhân chết dây chuyền, phiếu nhắm người đã chết và NPC bị hỏi thông tin bí mật.
3. Chốt cùng team ít nhất 3 chỉ số và ngưỡng đạt ở CP2. Chạy hai lượt đánh giá sau khi tích hợp, mô phỏng ít nhất 50 phiên và tính chi phí cho ba kịch bản sử dụng.
4. Điều phối buổi chơi thử, ghi lỗi có cách tái hiện và chuẩn bị các bước demo. Chơi trọn một ván 6 người, sau đó kiểm thêm sức chứa và thời gian phản hồi của phòng 20 người.

**Bàn giao khi** có tóm tắt bằng chứng, bộ câu thử với đáp án, kết quả hai lượt và bảng chi phí có số liệu từ trace.

## Cách bắt đầu và ghép nhánh

Chạy trong repo đã clone, thay `<ten-nhanh>` bằng nhánh của mình.

```bash
git fetch origin
git switch --track origin/<ten-nhanh>
```

Khi đã có nhánh local, dùng `git switch <ten-nhanh>`. Push lần đầu bằng `git push -u origin <ten-nhanh>`, sau đó mở PR chọn **base `dev`**. Có thể mở PR nháp cho phần đang làm để người khác xem và tích hợp sớm.

Thứ tự ghép đầu tiên là **luật và giao diện dữ liệu → ván chạy với NPC mẫu và giao diện → NPC gọi model thật → đánh giá trên ván đã ghép**. Dùng các lệnh `python run.py`, `python run.py check`, `python run.py eval --try` và `python run.py simulate --try` từ thư mục gốc khi kiểm tra bản tích hợp.
