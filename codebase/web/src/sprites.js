// Hình của game: ô cảnh, nhân vật ghép từ các lớp trang phục, chân dung.
// Ảnh lấy từ bộ FLARE (CC-BY-SA 3.0), xem assets/flare/README.md.

import meta from "./assets/flare/sprites.json";

const urls = import.meta.glob("./assets/flare/*.webp", { eager: true, query: "?url", import: "default" });
const url = (name) => urls[`./assets/flare/${name}.webp`];

// Thứ tự lớp: quần, giày, áo, tay, đầu. Trang phục không gắn với vai chơi.
const look = (gender, ...layers) => ({ gender, layers });
const OUTFITS = [
  look("female", "mage_skirt", "leather_boots", "cloth_shirt", "default_hands", "head_long"),
  look("male", "cloth_pants", "leather_boots", "cloth_shirt", "default_hands", "head_short"),
  look("male", "leather_pants", "leather_boots", "leather_chest", "default_hands", "leather_hood"),
  look("female", "cloth_pants", "cloth_sandals", "leather_chest", "default_hands", "head_long"),
  look("male", "mage_skirt", "cloth_sandals", "mage_vest", "mage_sleeves", "mage_hood"),
  look("female", "leather_pants", "leather_boots", "leather_chest", "default_hands", "leather_hood"),
  look("male", "leather_pants", "leather_boots", "leather_chest", "default_hands", "head_short"),
  look("female", "mage_skirt", "cloth_sandals", "mage_vest", "mage_sleeves", "head_long"),
  look("male", "cloth_pants", "cloth_sandals", "mage_vest", "default_hands", "head_short"),
  look("female", "cloth_pants", "leather_boots", "cloth_shirt", "default_hands", "mage_hood"),
  look("male", "cloth_pants", "leather_boots", "leather_chest", "default_hands", "mage_hood"),
  look("female", "leather_pants", "leather_boots", "cloth_shirt", "default_hands", "head_long"),
  look("male", "mage_skirt", "leather_boots", "cloth_shirt", "mage_sleeves", "head_short"),
  look("female", "mage_skirt", "leather_boots", "leather_chest", "default_hands", "mage_hood"),
  look("male", "leather_pants", "cloth_sandals", "cloth_shirt", "default_hands", "leather_hood"),
  look("female", "cloth_pants", "leather_boots", "mage_vest", "mage_sleeves", "leather_hood"),
  look("male", "cloth_pants", "leather_boots", "cloth_shirt", "default_hands", "leather_hood"),
  look("female", "leather_pants", "cloth_sandals", "mage_vest", "default_hands", "head_long"),
  look("male", "leather_pants", "leather_boots", "mage_vest", "mage_sleeves", "leather_hood"),
  look("female", "mage_skirt", "cloth_sandals", "cloth_shirt", "mage_sleeves", "mage_hood"),
];

export const outfitOf = (index) => OUTFITS[index % OUTFITS.length];
export const portraitUrl = (index) => url(`portrait-${outfitOf(index).gender}-${Math.floor(index / 2) % 6}`);

const images = new Map();
function image(name) {
  if (!images.has(name)) {
    const picture = new Image();
    picture.src = url(name);
    images.set(name, picture);
  }
  return images.get(name);
}

// Tải ảnh cảnh và các lớp trang phục đang dùng.
export function loadArt(count) {
  const names = new Set(["tiles"]);
  for (let i = 0; i < count; i += 1) {
    const outfit = outfitOf(i);
    for (const layer of outfit.layers) names.add(`${outfit.gender}-${layer}`);
  }
  return Promise.all([...names].map((name) => image(name).decode().catch(() => {})));
}

export function drawTile(g, id, x, y) {
  const [sx, sy, w, h, ox, oy] = meta.tiles[id];
  g.drawImage(image("tiles"), sx, sy, w, h, x - ox, y - oy, w + 1, h + 1);
}

// Khung của ô so với điểm đặt, để biết nó có che ai không.
export function tileRect(id) {
  const [, , w, h, ox, oy] = meta.tiles[id];
  return { x: -ox, y: -oy, w, h };
}

const IDLE = [0, 1, 2, 3, 2, 1];

// direction: 0 tây, 1 tây bắc, 2 bắc ... 6 nam, 7 tây nam (theo màn hình).
export function drawActor(g, outfit, { moving, direction, step, time }, x, y) {
  for (const layer of outfit.layers) {
    const name = `${outfit.gender}-${layer}`;
    const entry = meta.layers[name];
    if (!entry) continue;
    const frames = entry[moving ? "run" : "stance"][direction];
    const frame = frames[moving ? Math.floor(step) % frames.length : IDLE[Math.floor(time) % IDLE.length] % frames.length];
    const [sx, sy, w, h, ox, oy] = frame;
    g.drawImage(image(name), sx, sy, w, h, x - ox, y - oy, w, h);
  }
}
