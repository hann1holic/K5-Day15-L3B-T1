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

Bản M1 có sảnh, phòng chờ, các pha ván, chat chữ chung và riêng, kết quả và chơi lại. Dữ liệu luật và quyền xem lấy từ server. Tải lại tab sẽ dùng token của tab đó để vào lại. Khi mở tab mới, người chơi có thể tự chọn vào lại phòng đã lưu.

Kiểm tra bản build bằng `npm run build`.
