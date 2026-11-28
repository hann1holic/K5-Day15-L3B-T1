// Nền trang đầu, phòng chờ và kết quả: các cảnh trong backdrop-scenes.js đổi vòng tròn, chồng mờ vào nhau.
// Mỗi cảnh có tranh phóng chậm, quầng sáng, hạt bay, sương và có thể có chớp. Tranh là ảnh có sẵn
// (assets/backdrop/README.md); phần chuyển động do mã vẽ. Người bật "giảm chuyển động" chỉ thấy cảnh đầu, đứng yên.

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const between = (a, b) => a + Math.random() * (b - a);

// Đốm sáng vẽ sẵn một lần rồi dán nhiều lần.
function dot(color, soft) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  const fill = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  fill.addColorStop(0, `rgba(${color}, 1)`);
  fill.addColorStop(soft, `rgba(${color}, .55)`);
  fill.addColorStop(1, `rgba(${color}, 0)`);
  g.fillStyle = fill;
  g.fillRect(0, 0, 64, 64);
  return canvas;
}

// Mảng sương lặp được theo chiều ngang, từ nhiễu nhiều tầng.
function mist(color) {
  const w = 512;
  const h = 192;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  const pixels = g.createImageData(w, h);
  const layers = [[64, 0.55], [32, 0.3], [16, 0.15]].map(([cell, weight]) => {
    const cols = w / cell;
    const grid = Array.from({ length: cols * (h / cell + 2) }, Math.random);
    return { cell, weight, cols, grid };
  });
  const ease = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y += 1) {
    const band = Math.sin((Math.PI * (y + 0.5)) / h) ** 1.6;
    for (let x = 0; x < w; x += 1) {
      let value = 0;
      for (const { cell, weight, cols, grid } of layers) {
        const gx = x / cell;
        const gy = y / cell;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const tx = ease(gx - x0);
        const ty = ease(gy - y0);
        const at = (i, j) => grid[j * cols + (i % cols)];
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const low = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        value += weight * (top + (low - top) * ty);
      }
      const i = (y * w + x) * 4;
      pixels.data.set(color, i);
      pixels.data[i + 3] = 255 * band * Math.max(0, Math.min(1, (value - 0.28) * 2.1));
    }
  }
  g.putImageData(pixels, 0, 0);
  return canvas;
}

const KINDS = {
  // Tàn lửa bay lên, chao qua lại và nhấp nháy.
  ember: {
    colors: ["255, 150, 50", "255, 96, 32", "255, 205, 110"], soft: 0.22, blend: "lighter", flickers: true,
    born: (s) => ({ x: between(...s.x), y: between(...s.y), vx: between(-0.012, 0.022), vy: -between(0.03, 0.11),
      size: between(2, 7.5), life: between(3, 8), sway: between(0.004, 0.018) }),
  },
  // Tuyết rơi xiên theo gió.
  snow: {
    colors: ["255, 214, 206", "240, 190, 196"], soft: 0.45, blend: "source-over",
    born: (s) => ({ x: between(...s.x), y: between(...s.y), vx: -between(0.012, 0.04), vy: between(0.03, 0.09),
      size: between(1.1, 4.4), life: between(8, 16), sway: between(0.003, 0.012), dim: between(0.22, 0.72) }),
  },
  // Tro xám rơi chậm.
  ash: {
    colors: ["150, 135, 130", "110, 100, 98"], soft: 0.5, blend: "source-over",
    born: (s) => ({ x: between(...s.x), y: between(...s.y), vx: between(-0.02, 0.005), vy: between(0.012, 0.045),
      size: between(2.5, 6), life: between(7, 14), sway: between(0.006, 0.016), dim: between(0.25, 0.6) }),
  },
  // Bụi đỏ lơ lửng.
  dust: {
    colors: ["255, 90, 60", "255, 130, 90"], soft: 0.3, blend: "lighter",
    born: (s) => ({ x: between(...s.x), y: between(...s.y), vx: between(-0.008, 0.012), vy: -between(0.004, 0.022),
      size: between(1.6, 4.5), life: between(6, 13), sway: between(0.004, 0.012), dim: between(0.3, 0.8) }),
  },
};

function scatter(groups) {
  const area = Math.min(1.5, Math.max(0.45, (innerWidth * innerHeight) / (1462 * 775)));
  return groups.flatMap((group) => {
    const kind = KINDS[group.kind];
    const sprites = kind.colors.map((color) => dot(color, kind.soft));
    return Array.from({ length: Math.round(group.count * area) }, (_, i) => {
      const p = kind.born(group);
      p.age = Math.random() * p.life;
      p.x += p.vx * p.age;
      p.y += p.vy * p.age;
      return { ...p, group, kind, sprite: sprites[i % sprites.length], phase: Math.random() * 7 };
    });
  });
}

function createLayer(scene) {
  const node = document.createElement("div");
  node.className = "backdrop-layer";
  node.hidden = true;
  const art = document.createElement("div");
  art.className = "backdrop-art";
  const picture = new Image();
  picture.className = "backdrop-image";
  picture.alt = "";
  const layer = { scene, node, art, picture, broken: false, zoom: null, appear: null,
    particles: scatter(scene.particles || []),
    fogs: (scene.fog || []).map((fog) => ({ ...fog })) };
  // Ảnh tải hỏng thì cảnh này bị bỏ qua, các cảnh còn lại vẫn đổi.
  picture.addEventListener("error", () => { layer.broken = true; });
  picture.src = scene.image;
  art.append(picture, ...(scene.lights || []).map((light) => {
    const glow = document.createElement("span");
    glow.className = "backdrop-light";
    glow.dataset.r = light.r;
    glow.style.left = `${light.x * 100}%`;
    glow.style.top = `${light.y * 100}%`;
    glow.style.background = `radial-gradient(circle, rgba(${light.color}, ${light.alpha}) 0, ` +
      `rgba(${light.color}, ${light.alpha * 0.45}) ${light.core * 100}%, transparent 70%)`;
    glow.style.animationDuration = `${light.beat}s`;
    return glow;
  }));
  node.append(art);
  return layer;
}

// Đặt tranh phủ kín khung quanh điểm nhấn. Màn dọc: chỉ lấy phần chính của tranh, đặt ở nửa trên
// (phía trên khung nhập tên), đáy chìm vào nền.
function place(layer, width, height) {
  const { scene, art } = layer;
  const [iw, ih] = scene.size;
  let [fx, fy] = scene.focus;
  let scale = Math.max(width / iw, height / ih);
  let left = (width - iw * scale) * fx;
  let top = (height - ih * scale) * fy;
  if (matchMedia("(max-width: 760px)").matches) {
    const [x, from, to] = scene.narrow;
    scale = Math.max(width / iw, (height * 0.5 - 84) / ((to - from) * ih));
    left = Math.min(0, Math.max(width - iw * scale, width / 2 - x * iw * scale));
    top = Math.min(0, 84 - from * ih * scale);
    [fx, fy] = [x, (from + to) / 2];
  }
  Object.assign(art.style, { width: `${iw * scale}px`, height: `${ih * scale}px`, left: `${left}px`,
    top: `${top}px`, transformOrigin: `${fx * 100}% ${fy * 100}%` });
  for (const glow of art.querySelectorAll(".backdrop-light")) {
    glow.style.width = glow.style.height = `${2 * Number(glow.dataset.r) * ih * scale}px`;
  }
}

export function createBackdrop(root, scenes, { interval = 2000, fade = 700 } = {}) {
  root.className = "backdrop";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = '<div class="backdrop-stage"></div><canvas class="backdrop-fx"></canvas>' +
    '<div class="backdrop-flash"></div><div class="backdrop-shade"></div>';
  const [stage, canvas, flash] = [".backdrop-stage", ".backdrop-fx", ".backdrop-flash"]
    .map((name) => root.querySelector(name));
  const g = canvas.getContext("2d");
  const layers = scenes.map(createLayer);
  stage.append(...layers.map((layer) => layer.node));
  let current = null;
  let previous = null;
  let switchedAt = 0;
  let depth = 0;
  let frame = 0;
  let last = 0;
  let timer = 0;
  let strike = 0;
  let active = true;

  function layout() {
    const { clientWidth: width, clientHeight: height } = stage;
    if (!width || !height) return;
    for (const layer of layers) place(layer, width, height);
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientHeight * ratio);
  }

  // Cảnh mới nổi dần lên trên cảnh cũ; cảnh cũ được ẩn khi cảnh mới đã đủ rõ.
  function show(layer) {
    if (layer === current) return;
    previous = current;
    current = layer;
    switchedAt = performance.now();
    layer.node.hidden = false;
    layer.node.style.zIndex = ++depth;
    root.dataset.scene = layer.scene.key;
    root.style.setProperty("--floor", layer.scene.floor ?? 0.85);
    layer.appear?.cancel();
    layer.zoom?.cancel();
    clearTimeout(strike);
    const settle = () => {
      for (const other of layers) if (other !== current) other.node.hidden = true;
    };
    if (calm()) return settle();
    layer.appear = layer.node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade, easing: "ease-in-out" });
    layer.appear.finished.then(settle, () => {});
    layer.zoom = layer.art.animate([{ transform: "scale(1.015)" }, { transform: "scale(1.09)" }],
      { duration: interval + fade, easing: "linear", fill: "forwards" });
    if (layer.scene.flash) strike = setTimeout(() => lightning(layer), fade);
  }

  // Hai nhịp chớp ngắn.
  function lightning(layer) {
    const spec = layer.scene.flash;
    const [x, y] = spec.at[Math.floor(Math.random() * spec.at.length)];
    flash.style.background = `radial-gradient(ellipse 60% 55% at ${x * 100}% ${y * 100}%, ` +
      `rgba(${spec.color}, .95), rgba(${spec.color}, .28) 38%, transparent 72%)`;
    const timing = { duration: 850, easing: "ease-out" };
    flash.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.08 }, { opacity: 0.08, offset: 0.22 },
      { opacity: 0.6, offset: 0.34 }, { opacity: 0 }], timing);
    layer.picture.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.5)", offset: 0.08 },
      { filter: "brightness(1.05)", offset: 0.22 }, { filter: "brightness(1.3)", offset: 0.34 },
      { filter: "brightness(1)" }], timing);
  }

  const ready = (layer) => !layer.broken && layer.picture.complete && layer.picture.naturalWidth > 0;

  // Cảnh kế tiếp theo vòng tròn; ảnh chưa tải xong thì chờ thêm một chút.
  function advance() {
    const from = current ? layers.indexOf(current) : -1;
    const queue = layers.map((_, i) => layers[(from + 1 + i) % layers.length]).filter((layer) => !layer.broken);
    if (!queue.length) return;
    if (!ready(queue[0])) return schedule(150);
    show(queue[0]);
    schedule(interval);
  }

  function schedule(delay) {
    clearTimeout(timer);
    if (!active || document.hidden || (calm() && current)) return;
    timer = setTimeout(advance, delay);
  }

  function drawLayer(layer, weight, time, dt, w, h, unit) {
    g.globalCompositeOperation = "source-over";
    for (const fog of layer.fogs) {
      fog.image ||= mist(fog.color);
      const height = fog.height * h;
      const width = Math.max(w, height * (512 / 192));
      const offset = ((((time * fog.speed) / 1000) * unit) % width + width) % width;
      g.globalAlpha = weight * fog.alpha * (0.85 + 0.15 * Math.sin(time / 4100 + fog.y * 9));
      for (let x = offset - width; x < w; x += width) g.drawImage(fog.image, x, fog.y * h - height / 2, width + 1, height);
    }
    for (const p of layer.particles) {
      p.age += dt;
      if (p.age > p.life) Object.assign(p, p.kind.born(p.group), { age: 0 });
      else {
        p.x += (p.vx + Math.sin(time / 900 + p.phase) * p.sway) * dt;
        p.y += p.vy * dt;
      }
      const life = Math.min(1, p.age / 0.8, (p.life - p.age) / 1.2);
      const flicker = p.kind.flickers ? 0.65 + 0.35 * Math.sin(time / 90 + p.phase * 5) : 1;
      g.globalCompositeOperation = p.kind.blend;
      g.globalAlpha = Math.max(0, weight * life * flicker * (p.dim ?? 1));
      const size = p.size * unit;
      g.drawImage(p.sprite, p.x * w - size, p.y * h - size, size * 2, size * 2);
    }
  }

  function draw(time, dt) {
    const { width: w, height: h } = canvas;
    const unit = w / (canvas.clientWidth || 1);
    const mix = calm() ? 1 : Math.min(1, Math.max(0, (time - switchedAt) / fade));
    g.clearRect(0, 0, w, h);
    if (previous && mix < 1) drawLayer(previous, 1 - mix, time, dt, w, h, unit);
    if (current) drawLayer(current, mix, time, dt, w, h, unit);
    g.globalAlpha = 1;
  }

  function tick(time) {
    const dt = Math.min(0.05, Math.max(0, time - (last || time)) / 1000);
    last = time;
    draw(time, dt);
    frame = requestAnimationFrame(tick);
  }

  function run() {
    cancelAnimationFrame(frame);
    last = 0;
    if (!active) return;
    if (calm()) draw(0, 0);
    else frame = requestAnimationFrame(tick);
  }

  addEventListener("resize", () => {
    if (!active) return;
    layout();
    if (calm()) draw(0, 0);
  });
  addEventListener("pointermove", (event) => {
    if (!active || event.pointerType !== "mouse" || calm()) return;
    stage.style.transform = `translate(${(0.5 - event.clientX / innerWidth) * 22}px, ` +
      `${(0.5 - event.clientY / innerHeight) * 14}px)`;
  });
  document.addEventListener("visibilitychange", () => schedule(interval));

  layout();
  // Cảnh đầu hiện ngay khi tải xong, không đợi hết một lượt.
  const first = layers[0];
  first.picture.decode().then(() => {
    if (current) return;
    advance();
    if (calm()) draw(0, 0);
  }, () => schedule(0));
  run();

  return {
    // Ván đang chơi phủ kín màn hình: tắt hẳn nền để đỡ tốn máy.
    setScreen(screen) {
      root.dataset.screen = screen;
      const on = screen !== "game";
      if (on === active) return;
      active = on;
      root.hidden = !on;
      if (on) {
        layout();
        schedule(interval);
      } else {
        clearTimeout(timer);
        clearTimeout(strike);
      }
      run();
    },
  };
}
