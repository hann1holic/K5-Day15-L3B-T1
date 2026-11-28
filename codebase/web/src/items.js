// Cổ vật Ngày may mắn (docs/giao-dien-van.md): server giữ mã `sword`, `shield`; giao diện dùng chung một bảng.
export const ITEMS = {
  sword: {
    name: "Gươm Excalibur",
    effect: "Phiếu của bạn tính gấp đôi trong ngày hôm nay.",
  },
  shield: {
    name: "Khiên Pridwen",
    effect: "Cứu bạn nếu bị vote loại hôm nay. Nếu còn khiên sau lượt vote, nó chặn cú cắn và bình độc trong đêm kế tiếp.",
  },
};

export const NIGHT_SHIELD = "Khiên Pridwen đang che bạn đêm nay: chặn cú cắn và bình độc.";

export const itemName = (id) => ITEMS[id]?.name ?? "vật phẩm";
