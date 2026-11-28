// Thành phần vai theo số ghế, chép đúng deal_roles() trong codebase/game_engine.py (luật: docs/luat-choi.md mục 1).
// Server chỉ gửi cho mỗi người vai của chính họ. Cơ cấu vai chỉ phụ thuộc số ghế (xáo bài chỉ đổi ai giữ lá nào),
// nên giao diện tự tính được mà không lộ vai của ai. Sửa deal_roles() thì sửa cả hàm này.

// Thứ tự hiển thị: phe Sói, các vai chức năng, Dân.
export const ROLE_ORDER = ["soi_thuong", "soi_con", "tien_tri", "tien_tri_tap_su", "bao_ve", "phu_thuy",
  "tho_san", "than_tinh_yeu", "dan"];

export function lineup(seats) {
  const special = {
    tien_tri: 1,
    bao_ve: seats >= 5 ? 1 : 0,
    soi_con: seats >= 8 ? 1 : 0,
    phu_thuy: seats >= 8 ? 1 : 0,
    tho_san: seats >= 11 ? 1 : 0,
    than_tinh_yeu: seats >= 11 ? 1 : 0,
    tien_tri_tap_su: seats >= 12 ? 1 : 0,
  };
  // Sói con tính vào số Sói: cứ 4 ghế có 1 Sói.
  const counts = { ...special, soi_thuong: Math.floor(seats / 4) - special.soi_con };
  counts.dan = seats - Object.values(counts).reduce((sum, count) => sum + count, 0);
  return counts;
}
