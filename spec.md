# AI SPEC — Ma Sói · Nhóm T1 · L3B

> Mốc nộp: §7 chốt chuẩn "đạt" tại **CP2 19:30 Thứ Sáu 27/11** · §0–§7 nộp **CP3 10:00 Thứ Bảy 28/11** · đủ §0–§10 **CP4 14:30 Thứ Bảy 28/11** · §10 changelog ghi tiếp đến **23:59 Thứ Bảy 28/11**.
> Đầu mỗi mục ghi bước guide (`02-guide.md` trong repo đề) chỉ cách điền. Mỗi mục ngắn, có số và nguồn; chi tiết để ở file được trỏ tới. Xoá dòng hướng dẫn trong ngoặc vuông khi điền xong.

Track F — game suy luận xã hội có NPC AI lấp chỗ trống
Dữ liệu chạy thử: ván mẫu giả lập do nhóm tự dựng trong `data/cp2_sample_game.json`.

## §0. Hiện tại việc này diễn ra thế nào *(guide 1.1)*
- Luồng hiện tại của việc này, trong khoá hoặc trên app thật (3–5 bước; ảnh chụp từ tài khoản của mình, đã che thông tin):
- Công cụ / AI đang được dùng cho việc này (nếu có) + nguồn. Không kiểm được thì ghi "chưa kiểm":

## §1. Người dùng & bằng chứng *(guide 1.1, 1.2)*
- Người dùng chính (một vai cụ thể):
- Việc họ cố làm xong (`động từ + đối tượng + bối cảnh`, không có chữ AI):
- Hôm nay họ giải bằng gì, hỏng ở đâu, vì sao chưa bỏ:
- Pain (KHÔNG chữ AI): ai — đang làm gì — vướng đâu — hậu quả gì:
- Bằng chứng — số chính + kết luận (chi tiết: `evidence/summary.md`): __

## §2. Impact & quyết định chọn *(guide 1.3)*

| Hướng | Bao nhiêu người gặp | Bao nhiêu lần / tháng | Mỗi lần tốn gì | Impact / tháng | Làm kịp không | Chọn? |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |

- **Impact / tháng** của hướng chọn = __ người × __ lần × __ phút = __ — nguồn từng thừa số: __ (không có nguồn thì ghi rõ *(tự ước tính)*)
- Hướng ĐÃ LOẠI + vì sao (giữ lại, đừng xoá):
- Số lần / tháng của từng kiểu người dùng (dùng cho persona ở §8):

## §3. Giải pháp tương tự *(guide 2.1)*
- [sản phẩm / tính năng gần giống]: một điều đáng học · một điều đáng né · mình khác gì

## §4. Thiết kế *(guide 2.2, 3.2)*

**Lát cắt.** Khi một người mở ván Ma Sói ba phe mà thiếu người, NPC lấp chỗ trống, chọn lời thoại và bỏ phiếu theo vai bí mật cùng thông tin được phép biết để người chơi hoàn thành ván.

**Phạm vi CP2.** Ván mẫu sáu người chạy ở terminal với NPC mock và dữ liệu giả lập. Map, voice và kết nối model thật thuộc phần triển khai sau CP2.

~~~mermaid
flowchart TD
    U[Người chơi trên giao diện] -->|Thao tác| H[Host điều phối lượt]
    H -->|Chuyển thao tác| E[Bộ máy ván giữ vai và luật]
    E -->|Trạng thái riêng và lựa chọn hợp lệ| H
    H -->|Thông tin được phép xem| N[NPC mock ở CP2]
    N -->|Lời thoại hoặc phiếu đề xuất| H
    H -->|Trạng thái của người chơi| U
    E -->|Khóa pha, xử lý kỹ năng và xét thắng| E
~~~

**Hình dạng.** Workflow cố định điều phối ngày–đêm. Mỗi NPC tự chọn lời thoại và mục tiêu trong lượt được giao. Host giữ thứ tự thực hiện và bộ máy kiểm tra mọi đề xuất trước khi ghi vào ván.

| Hàm trong bộ máy | Input | Output | Tác động |
|---|---|---|---|
| `view` | ID người đang chơi | Pha, thông tin riêng được phép thấy và hành động hợp lệ | Chỉ đọc |
| `submit_action` | ID từ phiên chơi và thao tác đề xuất | Chấp nhận hoặc từ chối kèm lý do | Chỉ ghi trạng thái trong ván |
| `advance` | Yêu cầu khóa lượt từ host | Pha kế tiếp và kết quả cập nhật | Chỉ đổi trạng thái trong ván |

**Mức tự động.** Phiếu NPC được ghi khi hợp lệ. Người chơi tự chọn hành động của mình. Host khóa lượt và điều phối ván. NPC nhận trạng thái đã lọc theo vai, còn việc xác thực mục tiêu và xét thắng nằm ở bộ máy.

| Nguyên tắc | Cách áp dụng |
|---|---|
| G10 — thu hẹp phạm vi khi không chắc | NPC chỉ chọn trong danh sách hành động hợp lệ. Khi thiếu căn cứ, NPC có thể nói chưa chắc hoặc bỏ qua thao tác nếu pha cho phép. |
| Căn cứ nhìn thấy được | Lời thoại và lý do vote chỉ sử dụng sự kiện NPC đã nhận. |
| Kiểm soát trạng thái | Phiếu sai lượt và phiếu nhắm người đã chết bị từ chối. Vai kín được giữ ở bộ máy. |

Chi tiết luồng và định dạng nằm trong [luật chơi](docs/luat-choi.md) và [giao diện dữ liệu](docs/giao-dien-van.md).

## §5. Chỗ khó — 4 lớp + ≥6 kịch bản + 2 tấn công *(guide 2.3)*

| Kịch bản | Lớp (1–4) | Hành vi mong muốn (nói gì, hiện gì, cho làm gì tiếp) | Câu thử |
|---|---|---|---|
|  |  |  |  |
| *(tấn công)* |  |  |  |
| *(tấn công)* |  |  |  |

(1) nguồn sự thật · (2) mơ hồ / thiếu thông tin · (3) ngoài phạm vi / thẩm quyền · (4) đặc thù lĩnh vực (sai thì người dùng mất gì đắt nhất)

## §6. Bốn đường đi của trải nghiệm
- Mọi thứ suôn sẻ: · Không chắc (lớp 2): · Không có căn cứ (lớp 1): · Người dùng sửa:
- Bị đòi ngoài phạm vi (lớp 3): · Trường hợp đặc thù lĩnh vực (lớp 4):

## §7. Đánh giá & chuẩn "đạt" *(guide 2.4, 4.1)*

**(nháp chờ nhóm duyệt trước 19:30)**

Data card/benchmark: `data/DATA_CARD.md` ghi hai dataset tự dựng; `eval/benchmark.csv` có **14 ca** (`thuong` 4 · `kho` 7 · `tu_choi` 3, cả 3 là tấn công); `eval/metric_spec.yaml` có **3 metric**. Nguồn người dùng/data thật 0/14; chưa có dữ liệu phỏng vấn. Chấp nhận hai cảnh báo còn lại ở CP2: tỷ lệ nguồn thật ≥1/3 và quy mô CP3 20–30 ca.

| Chỉ số đề xuất ở CP2 | Cách xác định đạt |
|---|---|
| Hành động đúng luật | 100% ca kiểm tra hành động: hành động NPC chọn đúng lượt và mục tiêu hợp lệ, hoặc bỏ qua khi pha cho phép. |
| Giữ kín thông tin | 100% ca kiểm tra bảo mật vai: lời thoại không tiết lộ dữ kiện ngoài quyền xem được ghi trong đề. |
| Lý do vote có căn cứ | Ít nhất 80% ca cần giải thích phiếu: lý do bám lời thoại hoặc sự kiện NPC được phép biết. |

Đạt khi ≥ 80% câu qua, và `hanh_dong_dung_luat` đạt 100% (14/14 ca), `giu_kin_thong_tin` đạt 100% (12/12 ca áp dụng, gồm cả 3 ca `tu_choi` và các view đầy đủ có thông tin riêng), `ly_do_co_can_cu` đạt ≥80% (ít nhất 8/10 ca áp dụng). Với bộ 14 ca, ngưỡng tổng cần ít nhất 12/14 câu qua; mỗi câu qua khi đáp ứng toàn bộ pass_criterion và các metric áp dụng. Danh sách ID và mẫu số cố định ở `eval/metric_spec.yaml`; không lấy trung bình ba metric thay ngưỡng tổng.

Giữ kín thông tin được kiểm trên `speech` và nội dung chat/whisper gửi ra; `reason` là giải thích riêng cho host/người chấm, có thể viện dữ kiện riêng đã có trong view và không được phát ra chat chung. Lý do có căn cứ áp dụng cả phiếu và thao tác/giải thích trạng thái được liệt kê theo ID trong metric spec. Các ngưỡng trên cần nhóm duyệt trước hạn CP2, không sửa sau khi chốt. Chưa có kết quả chấm NPC; CP2 dùng mock token 0, không coi là lượt đánh giá model thật. Kết quả lượt 1 và 2 sẽ ghi trong `eval/report.md` sau khi chạy thật.

## §8. Chi phí khi dùng thật *(guide 4.2)*
- Persona + giá: `cost/personas.yaml` · lượt mô phỏng: `cost/simulate-__.csv` (__ phiên)
- Chi phí / task thành công: __ (model __) · __ (model __)
- Chi phí / tháng ở quy mô thật: thấp __ · cơ sở __ · cao __ → chi tiết `cost/cost-estimate.md`
- So với impact / người / tháng (§2): đáng làm không, vì sao:

## §9. Rủi ro & an toàn
- Dữ liệu: đã ẩn danh gì, không thu gì, không đưa gì vào model gói miễn phí:
- AI **không được** làm gì kể cả khi người dùng yêu cầu:
- Ai có thể bị hại nếu AI sai, và nhóm chặn thế nào:

## §10. Phân công & changelog
- Phân công có tên (theo chặng, chia cặp — guide "Cách chia việc"): __
- Dùng AI vào việc gì (2–3 dòng; chi tiết `docs/ai-usage.md`):
- Nhật ký thay đổi — **mọi thay đổi sau CP2 19:30 Thứ Sáu 27/11 phải có dòng ở đây**:

**CP2 → CP4** (vd thu hẹp lát cắt, hỏi thêm người dùng, lần cải tiến trước lượt 2)

| Thời điểm | Đổi gì | Vì sao (trỏ về câu thử / lỗi / bằng chứng nào) |
|---|---|---|
|  |  |  |

**Sau CP4 (đến 23:59 Thứ Bảy 28/11)** (sửa theo góp ý — không sửa chuẩn "đạt", câu thử, số bằng chứng, kết quả các lượt đã chạy)

| Thời điểm | Đổi gì | Vì sao |
|---|---|---|
|  |  |  |
