# Luật Ma Sói

Luồng này áp dụng cho bản chơi web. Phòng có **4–20 ghế**. Bản terminal CP2 (`python run.py`) vẫn dùng [ván mẫu sáu người](../data/cp2_sample_game.json) với một người thật và năm NPC mock. Bộ máy luật nhận ván từ 3 đến 20 người. Mỗi người có **vai gốc** để dùng kỹ năng và **phe hiện tại** để tính thắng. Sói thường và Dân có thể xuất hiện nhiều lần, còn mỗi vai đặc biệt có tối đa một người.

## 1. Vào phòng và chia vai

1. Người chơi nhập tên hiển thị rồi tạo phòng hoặc vào bằng mã phòng. Chủ phòng chọn số ghế và thời gian thảo luận, bỏ phiếu và hành động ban đêm.
2. Khi chủ phòng bắt đầu, NPC lấp các ghế trống. Server chia vai và gửi riêng cho từng người.
3. Nếu có **Cupid (Thần Tình Yêu)**, gọi Cupid trước lượt săn đầu tiên. Cupid ghép hai người. Họ biết vai gốc của nhau, giữ kỹ năng cá nhân và chuyển sang **phe Tình Nhân**. Nếu ván không có Cupid, gọi Sói đầu tiên.

Quyền vote cắn thuộc về phe Sói hiện tại. Một người có vai gốc là Sói nhưng đã chuyển sang Tình Nhân rời lượt săn của đàn. Tiên tri vẫn soi ra vai gốc của người đó là Sói.

## 2. Ban đêm

### Về nhà trong 15 giây

- Đêm đầu, người chơi có 15 giây để tới cửa một căn còn trống và bấm **F**. Server gán nhà cho yêu cầu hợp lệ đến trước. Ai chưa có nhà khi hết giờ được đưa ngẫu nhiên vào một căn còn trống.
- Mỗi người sống có tối đa một nhà. Những đêm sau, bấm **F** ở nhà của mình để vào. Nếu đang ở ngoài lúc hết giờ, server đưa người chơi về nhà đã gán.
- Khi chủ nhà chết, quyền sở hữu được thu hồi lúc mở lượt về nhà tiếp theo. Người khác có thể bấm **F** nhận căn này. Nhận nhà mới sẽ trả nhà cũ. Cửa của người vẫn còn sống chỉ chủ nhà được vào.
- Lâu đài, biệt thự, nhà cấp 4 và nhà tranh dùng chung luật. Khi mọi người đã được đưa về nhà, server bắt đầu gọi Cupid nếu là lượt ghép đôi, hoặc gọi Sói.

Cả làng đi ngủ. Server chỉ gọi riêng những người có quyền hành động. Trước lượt của một vai có kỹ năng, người có lượt nhận **5 giây chuẩn bị** với đếm ngược **5 → 4 → 3 → 2 → 1**, rồi mới được chọn mục tiêu. Người đang chờ chỉ nhận trạng thái **Cả làng đang ngủ**. Nhịp chờ công khai giữ nguyên kể cả khi một vai đã chết để người khác không suy ra vai nào còn sống từ tín hiệu gọi lượt.

### Phe Sói săn trước

- Các Sói còn sống được gọi riêng vào **phòng khách**. Mỗi Sói chọn mục tiêu bằng cách bấm tên treo trước phòng của một người còn sống ngoài phe mình.
- Khi khóa phiếu, người có nhiều phiếu nhất trở thành **mục tiêu cắn**. Nếu nhiều người bằng nhau ở mức cao nhất, server bốc ngẫu nhiên đúng một người trong nhóm đó. Nếu Sói bỏ lượt hết, lượt đó không chọn mục tiêu.
- Nếu Sói con chết, đêm kế tiếp phe Sói được chọn tối đa **hai mục tiêu khác nhau**. Người đã được chọn ở lượt đầu bị loại khỏi danh sách mục tiêu lượt hai.
- Phiếu chỉ chốt mục tiêu. Cú cắn được giải quyết cuối đêm sau khi các vai còn lượt thực hiện kỹ năng.

### Các vai khác hành động lần lượt

| Thứ tự | Vai | Hành động |
|---|---|---|
| 1 | **Bảo vệ** | Chọn một người còn sống để chặn cú cắn của Sói trong đêm đó. Bình độc vẫn có tác dụng. |
| 2 | **Tiên tri** | Soi một người còn sống. Chỉ Tiên tri nhận kết quả vai gốc của mục tiêu có phải Sói hay không. Tiên tri tập sự chờ đến khi Tiên tri gốc chết, rồi có lượt soi từ đêm kế tiếp. |
| 3 | **Phù thủy** | Có một bình cứu và một bình độc cho cả ván. Bình cứu chọn một người sắp chết vì cú cắn sau khi xét Bảo vệ. Bình độc chọn một người còn sống và xuyên qua Bảo vệ. Có thể dùng cả hai bình trong cùng đêm. |
| 4 | **Thợ săn** | Ghim một người còn sống khác mình. Có thể đổi dấu ghim theo đêm. Nếu bỏ qua lượt, giữ dấu ghim gần nhất. |

Cuối đêm, server xử lý cú cắn sau Bảo vệ và bình cứu, áp dụng bình độc, rồi giải quyết hết các trường hợp chết theo.

## 3. Trời sáng và bỏ phiếu

1. **Báo riêng cho người bị loại.** Mỗi người chết trong đêm nhận tín hiệu riêng để chuyển sang trạng thái theo dõi. Nhát chém ngang màn hình chỉ dành cho chính người bị loại.
2. **Tập trung ở phòng khách.** Những người còn sống lần lượt xuất hiện ở phòng khách. Người chơi tự đối chiếu ai có mặt và ai vắng để suy ra người đã chết. Trong pha tập trung, server chỉ công bố người vừa xuất hiện. Danh sách người chết và trạng thái sống/chết của toàn bàn được giữ kín trong pha này.
3. **Lucky Day.** Vào ngày 2, 4, 6 và các ngày chẵn tiếp theo, sau khi mọi người đã tập trung và ván vẫn tiếp diễn, người sống có 30 giây để đi tìm vật phẩm. Mỗi lượt có một khiên và một gươm. Mỗi người giữ tối đa một món, có hiệu lực trong cuộc bỏ phiếu ngày đó. NPC cũng được tìm đồ.
4. **Thảo luận.** Sau khi tập trung, hoặc khi hết Lucky Day, server đưa người sống tới quảng trường. Mọi người ở nguyên quảng trường để nói chuyện chung, nhắn riêng và bỏ phiếu.
5. **Bỏ phiếu loại.** Hết giờ thảo luận, mỗi người còn sống bỏ một phiếu cho một người còn sống khác. Có thể đổi phiếu trước khi khóa. Phiếu khóa khi hết giờ, hoặc ngay khi mọi người còn sống đã bỏ phiếu. Người nhiều phiếu nhất bị treo cổ. Hòa ở vị trí cao nhất hoặc cả bàn bỏ lượt thì ngày đó không ai bị loại.
   - **Gươm:** Phiếu của người cầm gươm được tính 2.
   - **Khiên:** Nếu mục tiêu có điểm cao nhất duy nhất đang giữ khiên, không ai bị loại bằng phiếu trong ngày đó. Vật phẩm không chặn cú cắn, bình độc hay hiệu ứng chết theo. Server chỉ công bố vật phẩm đã phát huy tác dụng sau khi khóa phiếu.
6. **Chuyển vòng.** Sau khi xử lý việc loại người và tất cả hiệu ứng chết theo, server xét thắng. Nếu ván chưa kết thúc, đêm tiếp theo bắt đầu.

## 4. Chết dây chuyền và điều kiện thắng

Nếu một Tình Nhân chết, người còn lại chết theo. Nếu Thợ săn chết, người đang bị ghim cũng chết nếu còn sống. Server xử lý hết chuỗi và chỉ ghi mỗi người chết một lần. Xét thắng sau khi xử lý hết kết quả đêm hoặc lần treo cổ ban ngày.

1. **Tình Nhân thắng** nếu cả cặp còn sống và số Tình Nhân bằng hoặc lớn hơn tổng số Sói và Dân còn sống. Điều kiện này được xét trước Sói.
2. **Sói thắng** nếu còn ít nhất một Sói và số Sói bằng hoặc lớn hơn tổng số Dân và Tình Nhân còn sống.
3. **Dân thắng** nếu còn ít nhất một Dân và cả hai phe đối lập đã bị loại.
4. **Hòa** nếu tất cả cùng chết.
