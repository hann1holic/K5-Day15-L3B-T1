// Hình riêng của làng: nhà, hai dạng Sói, lửa, khiên và gươm. Nguồn ở assets/village/README.md.

import meta from "./assets/village/village.json";
import { imageStore } from "./images.js";
import { iso } from "./map.js";

const urls = import.meta.glob("./assets/village/*.webp", { eager: true, query: "?url", import: "default" });
const url = (name) => urls[`./assets/village/${name}.webp`];

const store = imageStore(url);
const image = store.get;

export function loadVillageArt() {
  const names = [...Object.keys(meta.art), "werewolf", "cub", "fire", "loot", "icon-shield"];
  return store.load(names);
}

const artOf = (house) => {
  const choices = meta.houses[house.kind];
  return choices[house.column % choices.length];
};

// Khung ảnh nhà trên mặt phẳng nhìn chéo: giữa theo thân nhà, đáy theo góc trước.
export function houseRect(house) {
  const { w, h, dx, dy } = meta.art[artOf(house)];
  const center = iso(house.x, house.y - 0.5);
  const bottom = iso(house.x + 1.5, house.y + 0.5).y + dy;
  return { x: center.x - w / 2 + dx, y: bottom - h, w, h };
}

export function drawHouse(g, house) {
  const box = houseRect(house);
  g.drawImage(image(artOf(house)), box.x, box.y, box.w, box.h);
}

const IDLE = [0, 1, 2, 3, 2, 1];

// direction giống nhân vật: 0 tây, 2 bắc, 4 đông, 6 nam. Viền cam cho nổi trong đêm.
export function drawWolf(g, role, direction, time, x, y) {
  const spec = meta.wolves[role] ?? meta.wolves.soi_thuong;
  const { cell, anchor } = meta.wolves;
  const frame = IDLE[Math.floor(time) % IDLE.length];
  g.save();
  g.shadowColor = "rgba(255, 150, 60, .95)";
  g.shadowBlur = 9;
  g.drawImage(image(spec.file), frame * cell, direction * cell, cell, cell,
    x - anchor[0] * spec.scale, y - anchor[1] * spec.scale, cell * spec.scale, cell * spec.scale);
  g.restore();
}

export function drawFire(g, x, y, now, size) {
  const { w, h, cols, count } = meta.fire;
  const frame = Math.floor(now / 60) % count;
  g.drawImage(image("fire"), (frame % cols) * w, Math.floor(frame / cols) * h, w, h,
    x - (w * size) / 2, y + 8 - h * size, w * size, h * size);
}

export function drawLoot(g, kind, x, y) {
  const spec = meta.items[kind];
  if (!spec) return;
  const [sx, sy, w, h, ox, oy] = spec;
  g.drawImage(image(meta.items.file), sx, sy, w, h, x - ox * 1.4, y - oy * 1.4, w * 1.4, h * 1.4);
}

export const iconUrl = (kind) => url(`icon-${kind}`);

// Cảnh Khiên Pridwen vỡ, t chạy 0..1: khiên hiện trên đầu rồi tách thành mảnh bay ra.
export function drawShieldBreak(g, x, y, t) {
  const icon = image("icon-shield");
  const size = 150;
  const cy = y - 150;
  const split = Math.max(0, (t - 0.38) / 0.62);
  g.save();
  g.translate(x, cy);
  const flash = Math.max(0, 1 - Math.abs(t - 0.42) / 0.16);
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, size * (1 + flash));
  halo.addColorStop(0, `rgba(255, 225, 150, ${0.45 + 0.5 * flash})`);
  halo.addColorStop(1, "rgba(255, 200, 90, 0)");
  g.globalAlpha = 1 - split;
  g.fillStyle = halo;
  g.fillRect(-size * 2, -size * 2, size * 4, size * 4);
  const grow = Math.min(1, 0.35 + t / 0.3);
  const pieces = 7;
  for (let i = 0; i < pieces; i += 1) {
    const from = (i / pieces) * 2 * Math.PI - 0.4;
    const to = ((i + 1) / pieces) * 2 * Math.PI - 0.4;
    const middle = (from + to) / 2;
    g.save();
    g.globalAlpha = Math.max(0, 1 - split * split);
    // Mảnh văng ra, rơi dần và xoay.
    g.translate(Math.cos(middle) * split * 150, Math.sin(middle) * split * 110 + split * split * 120);
    g.rotate(split * (i % 2 ? 2.4 : -2.1));
    g.scale(grow, grow);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(from) * size, Math.sin(from) * size);
    g.lineTo(Math.cos(to) * size, Math.sin(to) * size);
    g.closePath();
    g.clip();
    g.drawImage(icon, -size / 2, -size / 2, size, size);
    g.restore();
  }
  // Vết nứt loé lên ngay trước khi vỡ.
  if (t > 0.26 && t < 0.4) {
    g.globalAlpha = 1;
    g.strokeStyle = "#fff4cf";
    g.lineWidth = 3;
    for (let i = 0; i < pieces; i += 1) {
      const a = (i / pieces) * 2 * Math.PI - 0.4;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a + 0.12) * 28, Math.sin(a + 0.12) * 28);
      g.lineTo(Math.cos(a) * 58, Math.sin(a) * 58);
      g.stroke();
    }
  }
  g.restore();
}
