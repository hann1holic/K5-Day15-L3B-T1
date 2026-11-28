// Bốn cảnh nền, đổi theo thứ tự này. Toạ độ x, y là tỉ lệ trên tranh 2560×1440.
// focus: điểm giữ trong tầm nhìn trên màn ngang. narrow: [giữa theo x, đỉnh, đáy] của phần tranh dùng cho màn dọc.
// floor: độ tối của dải dưới đáy. Nguồn tranh: assets/backdrop/README.md.
import wolfMoon from "./assets/backdrop/wolf-moon.webp";
import abbeyMoon from "./assets/backdrop/abbey-moon.webp";
import pandemonium from "./assets/backdrop/pandemonium.webp";
import wrath from "./assets/backdrop/wrath.webp";

const size = [2560, 1440];

export const SCENES = [
  // Sói dưới trăng máu: quầng trăng, mắt sói sáng, tuyết rơi.
  {
    key: "wolf", image: wolfMoon, size, focus: [0.48, 0.45], narrow: [0.48, 0.13, 0.88], floor: 0.7,
    lights: [
      { x: 0.498, y: 0.315, r: 0.38, color: "255, 48, 24", alpha: 0.3, core: 0.3, beat: 5.5 },
      { x: 0.4382, y: 0.4295, r: 0.022, color: "255, 150, 30", alpha: 0.6, core: 0.2, beat: 2.4 },
      { x: 0.4382, y: 0.4295, r: 0.0055, color: "255, 226, 130", alpha: 1, core: 0.45, beat: 2.4 },
    ],
    particles: [{ kind: "snow", count: 230, x: [-0.05, 1.3], y: [-0.15, 0.95] }],
    fog: [
      { y: 0.76, height: 0.28, color: [120, 52, 68], alpha: 0.3, speed: 16 },
      { y: 0.93, height: 0.3, color: [60, 24, 40], alpha: 0.42, speed: -9 },
    ],
  },
  // Phế tích dưới trăng máu: sương đỏ và bụi lơ lửng.
  {
    key: "abbey", image: abbeyMoon, size, focus: [0.5, 0.45], narrow: [0.5, 0.15, 0.85],
    lights: [
      { x: 0.502, y: 0.37, r: 0.42, color: "255, 40, 18", alpha: 0.32, core: 0.32, beat: 6.5 },
      { x: 0.502, y: 0.55, r: 0.09, color: "255, 120, 60", alpha: 0.28, core: 0.2, beat: 3.8 },
    ],
    particles: [{ kind: "dust", count: 110, x: [0, 1], y: [0.35, 1.05] }],
    fog: [
      { y: 0.7, height: 0.26, color: [112, 30, 28], alpha: 0.42, speed: 13 },
      { y: 0.84, height: 0.34, color: [58, 14, 18], alpha: 0.62, speed: -10 },
      { y: 0.98, height: 0.3, color: [90, 26, 24], alpha: 0.4, speed: 22 },
    ],
  },
  // Thành lửa: tàn lửa bay lên, chớp ấm.
  {
    key: "fire", image: pandemonium, size, focus: [0.42, 0.55], narrow: [0.41, 0.24, 0.86], floor: 0.55,
    lights: [
      { x: 0.2, y: 0.87, r: 0.34, color: "255, 96, 24", alpha: 0.34, core: 0.25, beat: 3.1 },
      { x: 0.4, y: 0.8, r: 0.22, color: "255, 140, 40", alpha: 0.3, core: 0.2, beat: 2.3 },
      { x: 0.06, y: 0.5, r: 0.06, color: "255, 170, 70", alpha: 0.55, core: 0.2, beat: 1.4 },
    ],
    particles: [{ kind: "ember", count: 150, x: [-0.02, 0.74], y: [0.66, 1.08] }],
    fog: [{ y: 0.74, height: 0.36, color: [74, 34, 22], alpha: 0.34, speed: 14 }],
    flash: { at: [[0.66, 0.02], [0.3, 0.05]], color: "255, 176, 130" },
  },
  // Ngày thịnh nộ: tro, tàn lửa và sét trắng.
  {
    key: "wrath", image: wrath, size, focus: [0.45, 0.35], narrow: [0.5, 0.08, 0.82],
    lights: [
      { x: 0.451, y: 0.485, r: 0.2, color: "255, 72, 18", alpha: 0.55, core: 0.14, beat: 3.6 },
      { x: 0.7, y: 0.66, r: 0.24, color: "255, 110, 30", alpha: 0.3, core: 0.25, beat: 2.6 },
    ],
    particles: [
      { kind: "ember", count: 105, x: [0.32, 0.86], y: [0.56, 0.86] },
      { kind: "ash", count: 60, x: [0, 1.15], y: [-0.1, 0.55] },
    ],
    fog: [{ y: 0.84, height: 0.34, color: [16, 22, 28], alpha: 0.5, speed: 11 }],
    flash: { at: [[0.04, 0.08], [0.37, 0.22], [0.55, 0.05]], color: "226, 232, 255" },
  },
];
