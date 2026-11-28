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

Ban ngày, sau pha thảo luận, chọn mục tiêu rồi bấm **Bỏ phiếu loại**, hoặc bấm thẳng vào người đó trên bản đồ (gửi ngay). Ban đêm, chỉ người thuộc phe Sói thấy **Vote cắn** trong lượt săn. Khi tới lượt kỹ năng, chọn mục tiêu và bấm nút của vai. Game xử lý kết quả cú cắn sau khi các vai đêm đã hành động.

Giao diện đọc các giá trị từ `lobby.timers`. Chủ phòng gửi `{"type":"set_timers","timers":{"discussion_seconds":90,"vote_seconds":30,"night_seconds":20}}`. Mỗi giá trị phải là số nguyên từ 1 đến 600 giây. Server xác thực quyền và gửi lại phòng chờ với thời gian đã lưu.

Kiểm tra bản build bằng `npm run build`.

## Làng, đi lại và vật phẩm

Giao diện luôn tạo phòng với `village: true`. Luật ở [docs/luat-choi.md](../../docs/luat-choi.md), giao thức ở
[docs/giao-dien-van.md](../../docs/giao-dien-van.md). Làng vẽ chéo trên canvas theo dữ liệu `view.village`
(kích thước, quảng trường, nhà, ô bị chặn, ghế lúc họp): `src/map.js` giữ hình học và tìm đường, `src/village.js`
vẽ và điều khiển, `src/art.js` vẽ nhà, Sói, lửa, cổ vật; tên và công dụng cổ vật ở `src/items.js`.

| Thao tác | Máy tính | Điện thoại |
|---|---|---|
| Đi | Phím mũi tên / WASD, hoặc bấm lên mặt đất | Chạm lên mặt đất |
| Vào nhà, nhặt đồ | **F** hoặc nút trên bản đồ | Nút trên bản đồ |
| Bỏ phiếu ban ngày, vote cắn | Bấm người hoặc tên cửa nhà (**gửi ngay**), hay dùng ô chọn rồi bấm nút | Như máy tính |
| Dùng kỹ năng ban đêm | Bấm tên cửa nhà hoặc dùng ô chọn, rồi **bấm nút kỹ năng** | Như máy tính |
| Xem quanh làng khi không được đi | Kéo bản đồ | Kéo bản đồ |

- Mỗi bước gửi `{"type":"action","phase_id":n,"action":{"type":"move","dx":..,"dy":..}}` cách nhau 180 ms.
  Giao diện đoán trước vị trí; server từ chối bước nào thì nhân vật về chỗ server báo.
- Người đứng ở toạ độ cửa là đã vào nhà nên không được vẽ. Nhà của người khác thì chữ **F** mờ đi.
- Đàn Sói đang săn thấy nhau bên đống lửa (Sói thường và Sói con khác hình) và có thêm kênh **Chat Sói**.
- `view.effect` phát một lần theo `id`: nhát chém cho người bị cắn, cảnh ném vào đống lửa hoặc khiên vỡ cho cả
  phòng, màn thắng / thua / hòa khi hết ván.
- Chủ Khiên Pridwen còn hiệu lực qua đêm (`view.night_shield`) thấy huy hiệu khiên; người khác không thấy.
- Phòng không bật làng (tạo từ máy khách khác) vẫn xem được: mọi người đứng ở quảng trường, không đi lại.

## Hình và phong cách

- Nền, cây cỏ, trang phục nhân vật, chân dung: bộ [FLARE](https://github.com/flareteam/flare-game),
  **CC-BY-SA 3.0**, phải ghi công; xem `src/assets/flare/README.md`.
- Nhà, Sói, lửa, khiên và gươm: nhiều tác giả, mỗi nguồn một giấy phép (CC0, CC-BY, CC-BY-SA);
  xem `src/assets/village/README.md`.
- Font Be Vietnam Pro và Cormorant Garamond cài qua `@fontsource`. Kiểu nằm trong `src/theme.css` và `src/village.css`.
