# Voice trong game Ma Sói

Voice dùng để thảo luận bằng giọng nói trong phòng chung và nhóm riêng tối đa 4 người. Chỉ bật khi đã bắt đầu ván và **phòng toàn người, không có bot**. Trong `day_discussion`, người còn sống được nói; người chết vẫn nghe. Hết ván (`finished`), mọi người được nói. Các pha còn lại tắt mic; nhóm riêng giải tán khi hết thảo luận. Hợp đồng chi tiết: [voice-protocol.md](voice-protocol.md).

Âm thanh đi trực tiếp giữa các trình duyệt bằng WebRTC mesh; server cổng 8000 chỉ chuyển tín hiệu. Mesh dự kiến ổn tới khoảng **8 người (tự ước tính, chưa benchmark)**, dù game cho phép nhiều ghế hơn. Luật tắt mic do client thực thi, server không thể cắt tiếng của client đã bị sửa.

## Thử trên một máy: localhost, không cần HTTPS

Từ gốc repo, dùng môi trường đã cài `requirements.txt` và các gói npm của web:

```bash
python -m codebase.server
```

Terminal khác:

```bash
cd codebase/web
npm run dev
```

Mở `http://localhost:5173` bằng nhiều tab/profile trình duyệt, mỗi tab một ghế; điền đủ người trước khi bắt đầu. Cho phép dùng mic và dùng tai nghe để tránh hú. `localhost` được phép xin mic qua HTTP; HTTP bằng IP LAN thì không.

Nếu đã có cert trong `certs/`, Vite sẽ tự bật HTTPS: để thử lại HTTP, chuyển tạm cả hai file cert/key ra ngoài thư mục đó rồi khởi động lại Vite. Gỡ giá trị `VITE_WS_URL` cũ nếu nó trỏ sang server khác.

## Nhiều máy cùng Wi-Fi: HTTPS + WSS

Trang HTTPS chỉ được nối WSS, nên server cũng phải chạy TLS (`--certfile`, `--keyfile`).

1. Tại gốc repo trên máy chủ, tạo cert:

   ```bash
   bash scripts/dev-cert.sh
   # Có thể truyền thêm IP/hostname, ví dụ:
   # bash scripts/dev-cert.sh 192.168.1.20 ma-soi.local
   ```

   Script luôn thêm `localhost`, `127.0.0.1`, tự dò IP LAN bằng `ipconfig getifaddr en0` trên macOS hoặc IP đầu tiên từ `hostname -I` trên Linux. Nếu chọn sai card mạng/VPN, truyền thêm IP Wi-Fi thực tế. Đổi IP thì tạo lại cert và khởi động lại cả hai tiến trình.

   Có `mkcert` thì script ưu tiên dùng nó. Chạy `mkcert -install` để tin CA trên máy chủ; các máy chơi khác cũng cần cài tin cậy **rootCA.pem của cùng CA** (thư mục xem bằng `mkcert -CAROOT`). Không chia sẻ `rootCA-key.pem`. Không có mkcert thì script dùng OpenSSL tạo cert tự ký 30 ngày. Cert/key nằm trong `certs/`, đã được gitignore.

2. Từ gốc repo, chạy server TLS:

   ```bash
   python -m codebase.server --host 0.0.0.0 --certfile certs/dev.crt --keyfile certs/dev.key
   ```

   Nếu máy chỉ có lệnh `python3`, dùng `python3` thay `python` như README gốc.

3. Terminal khác chạy Vite:

   ```bash
   cd codebase/web
   npm run dev
   ```

   Vite đọc `../../certs/dev.crt` và `../../certs/dev.key` tính từ file config; có đủ hai file sẽ bật HTTPS. Các máy phải truy cập được cổng TCP **5173 và 8000** trên máy chủ. Nếu 5173 bận, Vite có thể chọn cổng khác: dùng cổng in trong terminal hoặc giải phóng 5173.

4. Mỗi máy mở `https://<IP-máy-chủ>:5173`. Dùng đúng IP/hostname có trong SAN của cert. Trang tự nối `wss://<IP-máy-chủ>:8000/ws`.

   Với cert tự ký, trên **mỗi máy/trình duyệt**, chấp nhận cert của trang 5173, rồi mở `https://<IP-máy-chủ>:8000` một lần để chấp nhận cert cho WSS và quay lại tải lại trang game. Cổng 8000 chỉ phục vụ WebSocket nên sau bước tin cert có thể hiện lỗi HTTP/handshake; không cần có trang web ở đó. Nếu trình duyệt không cho bỏ qua cảnh báo hoặc vẫn chặn mic, cài tin cậy cert/CA trong hệ điều hành hoặc dùng mkcert với CA đã được máy đó tin.

## TURN khi ICE không nối được

Wi-Fi trường có thể chặn kết nối trực tiếp giữa các máy; 4G/NAT cũng có thể khiến WebRTC cần **TURN** để chuyển tiếp audio. STUN mặc định là `stun:stun.l.google.com:19302`, không thay thế TURN. TURN cũng không giúp nếu máy chơi không truy cập được trang Vite hoặc server WSS: cần giải quyết đường mạng tới máy chủ trước.

Ví dụ cấu hình cho **coturn đã được triển khai và truy cập được**; tên miền, cổng và tài khoản dưới đây chỉ là ví dụ, phải thay bằng thông tin TURN thật. Trong terminal ở `codebase/web/`:

```bash
VITE_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":["turn:turn.example.com:3478?transport=udp","turns:turn.example.com:5349?transport=tcp"],"username":"demo-user","credential":"demo-password"}]' npm run dev
```

Giá trị là JSON mảng `RTCIceServer`. Có thể đặt trong `codebase/web/.env.local` (được gitignore); khởi động lại Vite sau khi đổi, hoặc build lại nếu dùng bản build. Biến `VITE_*` được đưa tới trình duyệt: dùng tài khoản TURN dành cho dev hoặc thông tin xác thực ngắn hạn, không đặt bí mật quản trị coturn vào đây.

## Xử lý nhanh

- **Không xin được mic:** kiểm tra URL là `localhost` hoặc HTTPS được tin cậy, quyền Microphone của trang và hệ điều hành, thiết bị mic đang chọn. Thu hồi quyền đã chặn rồi tải lại. Kiểm tra phòng không có bot và đã bắt đầu ván; ngoài pha thảo luận mic sẽ bị tắt theo luật.
- **Đã nối nhưng không nghe:** bấm vào trang/nút bật âm thanh nếu trình duyệt hiện để vượt chặn autoplay; kiểm tra tab không bị mute, loa/tai nghe và volume. Kiểm tra người nói còn sống và đang ở pha được nói; nhóm riêng chỉ gửi tiếng cho thành viên nhóm.
- **ICE cứ `checking` hoặc `failed`:** trước hết kiểm tra WSS cổng 8000 và cert; xem `chrome://webrtc-internals` hoặc `about:webrtc` để kiểm tra ICE. Nếu không có cặp candidate nối được, thử mạng khác hoặc TURN; kiểm tra TURN truy cập được qua UDP/TCP, tài khoản còn hạn và JSON `VITE_ICE_SERVERS` hợp lệ.
