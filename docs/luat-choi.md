# Luật Ma Sói

Ván hỗ trợ từ 3 đến 20 người. Bản chạy CP2 dùng [ván mẫu sáu người](../data/cp2_sample_game.json), với một người thật và năm NPC mock. Mỗi người có **vai gốc** để dùng kỹ năng và **phe hiện tại** để xác định điều kiện thắng. Sói thường và Dân có thể xuất hiện nhiều lần. Mỗi vai đặc biệt có tối đa một người.

## Mở ván

Nếu có Thần Tình Yêu, vai này chọn hai người trước lượt săn đầu tiên. Hai người biết vai gốc của nhau và chuyển sang phe Tình Nhân, vẫn giữ kỹ năng cá nhân. Quyền săn thuộc về phe Sói hiện tại. Một Sói đã chuyển sang Tình Nhân không vote cắn cùng đàn, nhưng Tiên tri soi vẫn thấy vai gốc là Sói. Cặp Tình Nhân chỉ xuất hiện khi cấu hình có Thần Tình Yêu.

## Ban đêm

| Thứ tự | Vai | Hành động |
|---|---|---|
| 1 | Sói thường và Sói con thuộc phe Sói | Mỗi Sói sống vote cho một người còn sống ngoài phe mình. Mục tiêu nhiều phiếu nhất bị cắn. Khi hòa cao nhất, bộ máy chọn ngẫu nhiên một mục tiêu trong nhóm hòa. Không có phiếu thì lượt săn dừng. |
| 2 | Bảo vệ | Chọn một người sống. Nếu Sói cắn người đó trong đêm này, cú cắn bị chặn. |
| 3 | Tiên tri | Soi một người sống. Kết quả riêng cho biết vai gốc có thuộc loại Sói hay không. |
| 4 | Phù thủy | Có một bình cứu và một bình độc cho cả ván. Bình cứu chọn một mục tiêu sắp chết vì cú cắn sau khi xét Bảo vệ. Bình độc chọn một người sống và xuyên qua Bảo vệ. Hai bình có thể dùng cùng đêm. |
| 5 | Thợ săn | Ghim một người sống khác mình. Có thể đổi dấu ghim theo đêm. Giữ dấu ghim gần nhất nếu bỏ qua lượt. |

Khi Sói con chết, **đêm kế tiếp** phe Sói được tối đa hai lượt vote cắn. Mục tiêu chốt ở lượt đầu bị loại khỏi danh sách lượt hai. Các lượt săn chỉ chốt mục tiêu. Kết quả chết được xử lý sau khi tất cả vai hành động.

Tiên tri tập sự lên Tiên tri khi Tiên tri gốc chết và Tập sự còn sống. Tập sự có thể soi từ lượt Tiên tri của đêm sau.

## Ban ngày

Người sống thảo luận và có thể gửi chat chung hoặc nhắn riêng. Bản chơi đầy đủ dùng map và voice theo khoảng cách. Bản CP2 dùng terminal. Khi đóng thảo luận, mỗi người sống có một phiếu loại người sống khác. Phiếu mới thay phiếu cũ trước khi khóa. Ai được nhiều phiếu nhất bị loại. Nếu hòa cao nhất hoặc không có phiếu thì ngày đó không loại ai.

## Chết dây chuyền và thắng

Nếu một Tình Nhân chết, người còn lại chết theo. Nếu Thợ săn chết, người còn sống đang bị ghim chết theo. Bộ máy xử lý đến hết chuỗi và mỗi người chỉ chết một lần. Nó xét thắng sau khi giải quyết một đêm hoặc sau khi khóa vote ban ngày.

1. **Tình Nhân thắng** nếu cả hai còn sống và số Tình Nhân bằng hoặc lớn hơn tổng số Sói và Dân còn sống. Điều kiện này được xét trước Sói.
2. **Sói thắng** nếu còn ít nhất một Sói và số Sói bằng hoặc lớn hơn tổng số Dân và Tình Nhân còn sống.
3. **Dân thắng** nếu còn ít nhất một Dân và hai phe đối lập đã bị loại.
4. **Hòa** nếu tất cả cùng chết.
