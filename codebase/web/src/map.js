// Hình học ngôi làng theo `view.village` của server: mỗi ô server vẽ thành một ô FLARE.
// Kích thước, quảng trường, nhà và ô bị chặn lấy từ server; bản mặc định (giống codebase/village.py)
// chỉ dùng khi server chưa gửi: lúc tập trung buổi sáng, hoặc phòng không bật làng.

// Toạ độ ô (có thể lẻ) sang điểm trên màn hình nhìn chéo và ngược lại.
export const iso = (u, v) => ({ x: (u - v) * 96, y: (u + v) * 48 });
export const unIso = (sx, sy) => ({ x: sx / 192 + sy / 96, y: sy / 96 - sx / 192 });

export const key = (x, y) => `${x},${y}`;
export const entrance = (house) => ({ x: house.x, y: house.y + 1 }); // ô duy nhất bấm F được

const KINDS = ["castle", "villa", "single_storey", "hut"];
const DEFAULT = {
  size: { width: 32, height: 26 },
  square: { x: 15, y: 12 },
  square_bounds: { min_x: 9, min_y: 8, max_x: 21, max_y: 16 },
  houses: [3, 6, 19, 23].flatMap((y, row) => [4, 10, 15, 21, 26].map((x, column) => ({
    id: `H${String(row * 5 + column + 1).padStart(2, "0")}`, x, y, kind: KINDS[row],
  }))),
};
// Chỗ ngồi họp quanh lửa, lệch so với tâm quảng trường.
const SEATS = [
  [-4, -3], [-2, -3], [0, -3], [2, -3], [4, -3], [5, -2], [5, -1], [5, 0], [5, 1], [5, 2],
  [4, 3], [2, 3], [0, 3], [-2, 3], [-4, 3], [-5, 2], [-5, 1], [-5, 0], [-5, -1], [-5, -2],
];

function assemble({ size, square, bounds, houses, blocked }) {
  const list = houses.map((h, index) => ({
    id: h.id, x: h.x, y: h.y, kind: h.kind,
    column: ((Number(String(h.id).slice(1)) || index + 1) - 1) % 5, // để xen kẽ hai mẫu nhà
  }));
  return {
    width: size.width,
    height: size.height,
    square,
    bounds,
    houses: list,
    houseById: new Map(list.map((h) => [h.id, h])),
    doors: new Map(list.map((h) => [key(h.x, h.y), h])), // đứng ở ô cửa là đang trong nhà
    // Thân nhà chiếm x-1..x+1, y-1..y.
    blocked: blocked ?? new Set(list.flatMap((h) =>
      [-1, 0, 1].flatMap((dx) => [-1, 0].map((dy) => key(h.x + dx, h.y + dy))))),
    grid: { u0: -12, u1: size.width + 12, v0: -12, v1: size.height + 12 }, // vùng có vẽ nền
    signature: JSON.stringify([size, square, bounds, list.map((h) => [h.id, h.x, h.y, h.kind])]),
  };
}

export const defaultLayout = () => assemble({ ...DEFAULT, bounds: DEFAULT.square_bounds });

// Làng theo dữ liệu mới nhất của server; không đổi gì thì trả lại đúng đối tượng cũ.
export function updateLayout(layout, village) {
  if (!village) return layout;
  const next = assemble({
    size: village.size ?? { width: layout.width, height: layout.height },
    square: village.square ?? layout.square,
    bounds: village.square_bounds ?? layout.bounds,
    houses: village.houses ?? layout.houses,
    blocked: village.blocked_tiles ? new Set(village.blocked_tiles.map((t) => key(t.x, t.y))) : undefined,
  });
  if (next.signature !== layout.signature) return next;
  layout.blocked = next.blocked;
  return layout;
}

export const walkable = (layout, x, y) =>
  x >= 0 && y >= 0 && x < layout.width && y < layout.height && !layout.blocked.has(key(x, y));

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Đường đi bốn hướng ngắn nhất (BFS). Đích không tới được thì đi tới ô gần đích nhất.
export function findPath(layout, from, to) {
  const start = key(from.x, from.y);
  const parent = new Map([[start, null]]);
  const queue = [from];
  let best = from;
  const score = (p) => Math.abs(p.x - to.x) + Math.abs(p.y - to.y);
  for (let head = 0; head < queue.length; head += 1) {
    const here = queue[head];
    if (score(here) < score(best)) best = here;
    if (here.x === to.x && here.y === to.y) break;
    for (const [dx, dy] of STEPS) {
      const next = { x: here.x + dx, y: here.y + dy };
      const id = key(next.x, next.y);
      if (parent.has(id) || !walkable(layout, next.x, next.y)) continue;
      parent.set(id, here);
      queue.push(next);
    }
  }
  const path = [];
  for (let p = best; p && key(p.x, p.y) !== start; p = parent.get(key(p.x, p.y))) path.unshift(p);
  return path;
}

// Chỗ ngồi dự phòng khi server không gửi vị trí: cùng cách chia ghế với server.
export function seats(layout, count) {
  return Array.from({ length: count }, (_, i) => {
    const [dx, dy] = SEATS[Math.floor((i * SEATS.length) / count)];
    return { x: layout.square.x + dx, y: layout.square.y + dy };
  });
}

// Khoảng cách từ tâm tới ghế xa nhất trên màn hình, để canh khung vừa cả vòng họp.
export const SEAT_SPAN = {
  x: Math.max(...SEATS.map(([dx, dy]) => Math.abs(iso(dx, dy).x))),
  y: Math.max(...SEATS.map(([dx, dy]) => Math.abs(iso(dx, dy).y))),
};

const TREES = [248, 249, 250, 251, 252, 253, 254, 255];
const LIGHT_TREES = [240, 241, 242, 243, 252, 253, 254, 255];
const DEAD_TREES = [244, 245, 246, 247];
const PLANTS = [112, 117, 120, 121, 122, 124, 126, 124, 126];
export const BONFIRE = 102;

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Số ô ra ngoài quảng trường (0 là đang ở trong).
const outside = ({ bounds: b }, u, v) => Math.max(b.min_x - u, u - b.max_x, b.min_y - v, v - b.max_y, 0);

// Nền: cỏ, quảng trường lát đá, lối đá từ cửa mỗi nhà ra quảng trường.
function ground(layout) {
  const { grid } = layout;
  const random = seeded(7);
  const pick = (from, to) => from + Math.floor(random() * (to - from + 1));
  const columns = grid.v1 - grid.v0 + 1;
  const cells = new Uint8Array((grid.u1 - grid.u0 + 1) * columns);
  const at = (u, v) => (u - grid.u0) * columns + (v - grid.v0);
  for (let u = grid.u0; u <= grid.u1; u += 1) {
    for (let v = grid.v0; v <= grid.v1; v += 1) {
      const away = outside(layout, u, v);
      cells[at(u, v)] = away === 0 ? pick(32, 43) : away === 1 ? pick(44, 47) : pick(16, 31);
    }
  }
  for (const house of layout.houses) {
    for (const p of [entrance(house), ...findPath(layout, entrance(house), layout.square)]) {
      if (outside(layout, p.x, p.y) > 0) cells[at(p.x, p.y)] = [41, 44, 45, 46, 47][(p.x * 7 + p.y * 3) % 5];
    }
  }
  return (u, v) => cells[at(u, v)];
}

// Trong làng chỉ có cỏ thấp (server không biết vật cản khác); cây và bia mộ nằm ngoài rìa.
function scenery(layout) {
  const { grid, width, height } = layout;
  const random = seeded(1311);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const items = [];
  const put = (id, u, v) => items.push({ id, u, v });
  for (let u = grid.u0; u <= grid.u1; u += 1) {
    for (let v = grid.v0; v <= grid.v1; v += 1) {
      const [roll, extra] = [random(), random()];
      const behind = Math.max(-u, -v); // khoảng cách ra ngoài phía sau (trên màn hình)
      const front = Math.max(u - (width - 1), v - (height - 1)); // ra ngoài phía trước
      if (behind > 1 && front <= 0) {
        if (roll < 0.34) put(pick(TREES), u, v);
        else if (roll < 0.4) put(pick(DEAD_TREES), u, v);
      } else if (front > 2) {
        // Phía trước thưa hơn để tán không che người đứng sát rìa.
        if (roll < 0.14) put(pick(LIGHT_TREES), u, v);
        else if (roll < 0.17) put(136, u, v);
      } else if (extra < 0.07 && outside(layout, u, v) > 1 && !layout.blocked.has(key(u, v))) {
        put(pick(PLANTS), u, v);
      }
    }
  }
  for (let i = 0; i < 6; i += 1) put(140 + (i % 4), -4 + (i % 3) * 1.2, height - 5 + Math.floor(i / 3) * 1.5);
  for (const [id, u, v] of [[100, width + 1, 4], [137, width + 1.5, 15], [99, 7, height + 1.5], [76, -2.5, 10]]) put(id, u, v);
  return items;
}

export function buildScene(layout) {
  return { tileAt: ground(layout), objects: scenery(layout) };
}
