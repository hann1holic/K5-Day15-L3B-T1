# Canvas — T1 · Ma Sói · Track F

| # | Dòng | Nhóm điền |
|---|---|---|
| 1 | Track + lát cắt dự kiến | Track F · Ma Sói, game suy luận xã hội ba phe với ván tối đa 20 người và nhân vật AI vào các chỗ trống. |
| 2 | Người dùng chính | Người từng chơi Ma Sói hoặc game suy luận xã hội và muốn mở một ván ngắn khi bạn bè không rảnh cùng lúc. |
| 3 | Pain | Khi muốn chơi một ván, người chơi phải rủ và chờ đủ bạn tham gia, nên có lúc phải hoãn hoặc bỏ ván. |
| 4 | Bằng chứng đầu | Giả thuyết CP1: khó gom đủ người làm gián đoạn việc chơi. Nhóm sẽ hỏi ít nhất 3 người ngoài nhóm từng chơi về lần gần nhất việc này xảy ra, mất bao lâu để gom người và họ đã xử lý thế nào. Mục tiêu ghi ít nhất 5 trích dẫn hoặc ví dụ nguyên văn đã ẩn danh. |
| 5 | **Lát cắt một câu** | Khi một người chơi mở ván Ma Sói ba phe tối đa 20 người mà thiếu người, NPC AI lấp chỗ trống và quyết định lời thoại cùng phiếu bầu dựa trên vai bí mật và thông tin được phép biết, để người chơi chơi trọn một ván. |
| 6 | AI tự làm đến đâu | NPC tự chọn lời thoại, mục tiêu bỏ phiếu và lý do; bộ luật của game giữ vai bí mật, kiểm tra phiếu hợp lệ và xác định phe thắng để tránh phiếu sai luật hoặc lộ thông tin giữa các phe. |
| 7 | Phân công có tên | **Lê Huy Anh** — Thiết kế luật ba phe, triển khai bộ máy ván chơi và điều phối tiến độ. **Dư Văn Hùng** — Tích hợp model, thiết kế lời thoại và quyết định bỏ phiếu của NPC. **Nguyễn Tấn Dũng** — Dựng giao diện phòng chơi, hiển thị diễn biến và tích hợp bỏ phiếu. **Vũ Duy Khánh** — Phỏng vấn người chơi, phụ trách bộ câu thử, chạy đánh giá và mô phỏng chi phí. |
| — | *(CP2)* Đã đổi gì so với CP1 | Thu hẹp bản CP2 thành ván mock sáu người chạy terminal. Đã xác định thứ tự ngày–đêm, quyền từng vai và cách bộ máy kiểm tra đề xuất của NPC. Đang chờ tổng hợp phỏng vấn từ Khánh. |

## Track F · Ma Sói

**Lĩnh vực.** Game suy luận xã hội.

**Pain.** Người từng chơi Ma Sói muốn chơi một ván ngắn nhưng khó gom đủ người cùng lúc, nên phải hoãn hoặc bỏ ván.

**Insight từ người dùng thật.** CP1 mới có giả thuyết. Nhóm sẽ hỏi ít nhất 3 người ngoài nhóm từng chơi về lần gần nhất họ muốn mở ván mà không đủ người, thời gian chờ và lựa chọn thay thế.

**Người dùng.** Người từng chơi Ma Sói hoặc game suy luận xã hội. Nhóm dự kiến tiếp cận qua bạn cùng lớp và người quen từng chơi.

**Data.** Ghi lời kể đã ẩn danh và số liệu tổng hợp từ phỏng vấn. Nhóm tự dựng vai, manh mối, diễn biến tranh luận và tình huống bỏ phiếu để chạy thử.

**Lát cắt.** Khi một người chơi mở ván Ma Sói ba phe tối đa 20 người mà thiếu người, NPC AI lấp chỗ trống và quyết định lời thoại cùng phiếu bầu dựa trên vai bí mật và thông tin được phép biết, để người chơi chơi trọn một ván.

**Công cụ của agent.** Bộ máy game cung cấp cho NPC vai riêng, người còn trong ván và thông tin được phép biết. NPC trả về lời thoại, mã người được chọn và lý do; bộ máy game kiểm tra rồi mới ghi phiếu vào ván. Mọi tác động nằm trong ván chơi.

**Bộ câu thử.** Dự kiến kiểm tra phiếu hợp lệ, lý do bám vào thông tin NPC được biết và mục tiêu của phe. Có ca người chơi yêu cầu tiết lộ vai của NPC khác và ca nhắm người đã bị loại.

**Persona chi phí.** Ước tính theo số ván mỗi tháng, số NPC và lượt gọi model mỗi ván; mô phỏng quy mô nhỏ, cơ sở và ván đủ 20 chỗ.

**Bẫy.** NPC lộ vai, nhắc manh mối chưa xuất hiện hoặc tạo lời thoại dài làm chậm ván 20 người.

**An toàn.** Tách thông tin bí mật theo NPC. Kiểm tra mã mục tiêu và trạng thái người chơi trước khi ghi phiếu. Nội dung chat chỉ là hội thoại trong ván.
