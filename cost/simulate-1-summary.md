# Tóm tắt mô phỏng simulate-1@20261128-112814

Do `python run.py simulate` sinh ra — không sửa tay. Chép bảng sang `cost/cost-estimate.md`.

| Persona | Số phiên mô phỏng | Lượt hỏi / phiên | Token vào / phiên | Token ra / phiên | Gọi model / phiên | Gọi công cụ / phiên |
|---|---:|---:|---:|---:|---:|---:|
| thieu_nguoi_nhieu | 6 | 10 | 14572 | 1416 | 7.8 | 17.8 |
| thieu_nguoi_vua | 26 | 10 | 15049 | 1477 | 8.2 | 17.9 |
| thieu_nguoi_it | 18 | 10 | 14682 | 1466 | 7.9 | 17.3 |

Tỉ lệ đạt dùng để tính: 15/21 (71%) — lượt run-2@20261128-091212

- Tự chọn: lượt run-N mới nhất đã chấm xong, chạy bằng đúng model đang đo (run-2.csv). Muốn dùng lượt khác (vd lượt 2): thêm `--rate-from eval/run-2.csv`.

| Model (giá) | Chi phí / phiên | Chi phí / task thành công | Chi phí / câu hỏi đạt | Chi phí / tháng — thấp (233 người) | Chi phí / tháng — cơ sở (1.000 người) | Chi phí / tháng — cao (5.000 người) | Chi phí / người / tháng (cơ sở) |
|---|---:|---:|---:|---:|---:|---:|---:|
| claude-haiku-5-5 (vào 0.1 · ra 0.5 $/1M) | $0.0022 | $0.0031 | $0.00031 | $1.10 | $4.71 | $23.56 | $0.0047 |
| claude-sonnet-5-5 (vào 2.0 · ra 10.0 $/1M) | $0.0444 | $0.0621 | $0.0062 | $21.96 | $94.25 | $471.26 | $0.0943 |

- Chi phí / task thành công = chi phí / phiên ÷ tỉ lệ đạt. Chi phí / câu hỏi đạt = chi phí / phiên ÷ số lượt hỏi trung bình mỗi phiên (10.0) ÷ tỉ lệ đạt — tỉ lệ đạt đo theo từng câu thử.
- Token đo trên model: claude-haiku-5-5. Giá tính theo từng model trong bảng — model khác bộ tách token thì số token thật có thể lệch; ghi rõ "đo trên model X, tính giá model Y" trong cost/cost-estimate.md.
- Phiên lỗi (không tính vào trung bình): 0/50.
