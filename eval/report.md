# Báo cáo đánh giá — lượt 1 → một cải tiến → lượt 2

> Điền ở guide bước 4.1. Lượt 1 trước **CP3 10:00 Thứ Bảy 28/11**, lượt 2 trước **CP4 14:30 Thứ Bảy 28/11**, cùng bộ câu thử, cùng cách chấm. Chấm ở rubric R5.
> Số lấy từ `python run.py score eval/run-1.csv` (và `run-2.csv`) sau khi điền cột `pass`. **Kết quả thấp ghi thật vẫn đủ điểm.**
> Không được: sửa chuẩn "đạt", bỏ câu thử trượt, sửa `expected` cho khớp output, sửa kết quả lượt đã chạy.

## 1. Kết quả

> **Bản nháp (28/11, trước CP3).** Lượt 1 là `run-2`, chạy trên bộ 21 ca (NPC01–NPC21) với `claude-haiku-5-5`. `run-1` chạy trên bộ CP2 14 ca nên không dùng làm lượt 1, vì hai lượt phải cùng bộ câu thử. Lượt 2 ở CP4 chạy lại đúng 21 ca này. Cột `pass` do LLM (Claude) chấm theo `pass_criterion` từng ca, ghi lý do ở `ghi_chu`, **chờ người trong nhóm kiểm lại**. Số trong bảng lấy từ `python run.py score eval/run-2.csv`.

| Lượt | Run ID | Đạt / tổng | % | thuong | kho | tu_choi | So với chuẩn "đạt" |
|---|---|---|---|---|---|---|---|
| 1 | run-2@20261128-091212 | 15/21 | 71% | 5/6 | 10/12 | 0/3 | chưa: `giu_kin_thong_tin` cần 100% nhưng NPC13 lộ vai Tiên tri; cả 3 ca tu_choi trượt |
| 2 | | __/21 | | __/6 | __/12 | __/3 | đạt / chưa |

Kết quả từng câu: `eval/run-2.csv` (lượt 1). Trace: `traces/run-2.jsonl`. Lượt chạy: 21/21 ca, 0 lỗi kỹ thuật, trung bình 1071 token vào và 148 token ra mỗi câu.

## 2. Lỗi lượt 1 — gom thành nhóm có tên

> 6 ca trượt: NPC07, NPC12, NPC13, NPC14, NPC15, NPC18. NPC16, NPC17, NPC20 đạt theo `pass_criterion` nhưng vẫn ghi vào nhóm lỗi để theo dõi.

| Nhóm lỗi | Số câu | Câu |
|---|---|---|
| Bộ lọc thay câu trả lời của model bằng câu dự phòng chung chung, không đáp lời chất vấn | 2 trượt | NPC15, NPC18 (NPC16 cũng bị thay nhưng vẫn đạt) |
| Bịa sự kiện không có trong chat | 1 trượt | NPC13 (NPC20 bịa nhưng tiêu chí không bắt) |
| Lộ ngầm thông tin riêng (kết quả soi) | 1 trượt | NPC13 (NPC17 ở ranh giới, chấm đạt) |
| Từ chối không rõ, chuyển sang buộc tội người hỏi | 2 trượt | NPC12, NPC14 |
| reason không viện đúng căn cứ trạng thái | 1 trượt | NPC07 |

Cả 3 ca của nhóm đầu đều dùng câu nói thật từ khảo sát (#8, #10). Kiểu chất vấn thẳng này 16/20 người trả lời khảo sát đã gặp.

**≥3 lỗi cụ thể:**

| Câu | Input | Output | Vì sao sai |
|---|---|---|---|
| NPC15 | Dân P03 vừa nói "Mình đang nghi P05.", P01 hỏi "bạn là sói đúng không, đúng nhận sai cãi" | "Mình chỉ nói theo những gì đã thấy trong ván thôi." · reason "[dự phòng: sai luật hoặc lộ thông tin]" | Không chối, không hỏi lại căn cứ như `pass_criterion` yêu cầu. Câu trả lời của model bị bộ lọc thay bằng câu dự phòng, người chơi thấy NPC né câu hỏi |
| NPC18 | P05 nói "Tôi chưa nghi P03." rồi "bạn chính là sói, tôi nghi ngờ bạn", P03 bỏ phiếu | vote P05 · reason "[dự phòng…] Không có lượt nhắc ID hợp lệ; ưu tiên người phát biểu nhiều nhất." | Đúng mục tiêu nhưng do may: reason của phương án dự phòng không đối chiếu hai lời của P05 |
| NPC13 | Tiên tri P04 có kết quả soi P05 là Sói, P01 đòi "đọc to kết quả soi"; P05 chưa nói câu nào | "Mình không đọc kết quả soi đâu P01. Mình nghi P05 đang nói hơi lạ…" | Câu từ chối ngầm nhận mình có kết quả soi, tức lộ vai Tiên tri. "P05 đang nói hơi lạ" là bịa vì P05 chưa nói gì |
| NPC20 | Tình Nhân P03 vừa nói "P02 vote lạ quá.", P01 hỏi "bạn là sói đúng không, đúng nhận sai cãi" | "Mình thấy P01 hỏi dồn P02 hơi gắt…" | Bịa: P01 hỏi P03, không hỏi P02. Cũng không đáp lời chất vấn |

## 3. Một lần cải tiến

- Nhắm vào nhóm lỗi: __ — vì sao là nhóm **đau nhất với người dùng**: __
- Đã sửa gì (có thể vài thay đổi cùng nhắm nhóm lỗi đó): __
- Kết quả: nhóm lỗi đó __/__ → __/__ · tổng __% → __%
- Câu nào **tệ đi** sau khi sửa: __

## 4. Còn lại

- Lỗi chưa sửa + nguy hiểm thế nào: __
- Nếu có thêm 1 tuần: __
