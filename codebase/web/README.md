# Chơi Ma Sói trên web

Chạy server từ thư mục gốc của repo:

~~~bash
python -m pip install -r requirements.txt
python -m codebase.server
~~~

Trong một terminal khác:

~~~bash
cd codebase/web
npm ci
npm run dev
~~~

Mở địa chỉ Vite in ra, mặc định là http://localhost:5173. Tạo phòng 4–20 ghế và gửi mã cho người chơi khác. Chủ phòng có thể bắt đầu với NPC vào các ghế trống.

Để thử trên nhiều máy cùng mạng, bật server bằng `python -m codebase.server --host 0.0.0.0` và mở trang Vite bằng IP của máy chủ. Giao diện dùng cùng hostname với trang, cổng 8000 và đường dẫn `/ws`. Đặt `VITE_WS_URL` trước khi chạy Vite nếu dùng endpoint khác.

Bản M1 có sảnh, phòng chờ, các pha ván, chat chữ chung và riêng, kết quả và chơi lại. Dữ liệu luật và quyền xem lấy từ server. Tải lại tab sẽ dùng token của tab đó để vào lại. Khi mở tab mới, người chơi có thể tự chọn vào lại phòng đã lưu. Mỗi ghế chỉ hoạt động ở một tab hoặc thiết bị. Khi vào lại ở nơi khác, tab cũ về sảnh và hiện thông báo. Nếu máy chủ báo ván gặp lỗi, cả phòng về phòng chờ để chủ phòng bắt đầu ván mới. Khi ván đã kết thúc, người mới vào bằng mã phòng cũng đưa cả phòng về phòng chờ.

## Thời gian và thao tác trong ván

Trong phòng chờ, chủ phòng có thể đổi thời gian thảo luận, bỏ phiếu và từng lượt đêm. Bấm **Lưu thời gian** trước khi bắt đầu. Mọi người nhìn thấy thời gian đã lưu. Mặc định là 90, 30 và 20 giây.

Ban ngày, bấm **Bỏ phiếu loại** sau pha thảo luận. Ban đêm, chỉ người thuộc phe Sói thấy **Vote cắn** trong lượt săn. Khi tới lượt kỹ năng, chọn mục tiêu và bấm nút của vai. Game xử lý kết quả cú cắn sau khi các vai đêm đã hành động.

Giao diện đọc các giá trị từ `lobby.timers`. Chủ phòng gửi `{"type":"set_timers","timers":{"discussion_seconds":90,"vote_seconds":30,"night_seconds":20}}`. Mỗi giá trị phải là số nguyên từ 1 đến 600 giây. Server xác thực quyền và gửi lại phòng chờ với thời gian đã lưu.

Kiểm tra bản build bằng `npm run build`.

## Hình và phong cách

Khung và nút dùng ảnh của [RPGUI](https://github.com/RonenNess/RPGUI) (Ronen Ness, giấy phép zlib, xem `src/assets/rpgui/`). Font pixel VT323 (có dấu tiếng Việt) cài qua `@fontsource/vt323`. Kiểu nằm trong `src/theme-rpg.css`; sân làng vẽ ở `src/stage.js`, hình nhân vật hiện là ô màu tạm.
