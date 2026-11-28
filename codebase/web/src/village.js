// Làng Ma Sói nhìn chéo từ trên, theo bản đồ của server (`view.village`, docs/giao-dien-van.md).
// Giao diện không tự tính luật: đọc `state`, gửi move / enter_house / pick_up, vẽ hiệu ứng server báo.

import "./village.css";
import {
  BONFIRE, SEAT_SPAN, buildScene, defaultLayout, entrance, findPath, iso, key, seats, unIso, updateLayout, walkable,
} from "./map.js";
import { drawActor, drawTile, loadArt, outfitOf, tileRect } from "./sprites.js";
import { drawFire, drawHouse, drawLoot, drawShieldBreak, drawWolf, houseRect, iconUrl, loadVillageArt } from "./art.js";
import { ITEMS, NIGHT_SHIELD, itemName } from "./items.js";
import { compact } from "./screen.js";

const STEP_MS = 180; // docs/giao-dien-van.md: mỗi bước cách nhau 180 ms
const WALK = 1000 / STEP_MS; // ô mỗi giây
const SIGHT = { x: 620, y: 420 }; // vùng sương tan quanh mình
const FOG_SCALE = 12;
const SCENE_MS = 2000; // cảnh ném vào lửa, cảnh khiên vỡ
const NAME_FONT = '"Cormorant Garamond", Georgia, serif';
const TEXT_FONT = '"Be Vietnam Pro", system-ui, sans-serif';
const TURNS = {
  pair: "Thần Tình Yêu ghép đôi", night_wolf: "Sói đi săn", night_protect: "Bảo vệ canh gác",
  night_inspect: "Tiên tri soi", night_witch: "Phù thủy ra tay", night_hunter: "Thợ săn đặt dấu",
};
const REASONS = {
  house_taken: "Nhà này vừa có người nhận.",
  too_far: "Đứng đúng ô ngay trước cửa rồi bấm F.",
  item_unavailable: "Món đồ vừa bị người khác nhặt mất.",
  invalid_target: "Chỗ này không dùng được.",
};
// Hướng trên màn hình của từng phím.
const KEYS = {
  arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
  arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
};
// Lựa chọn không nhắm vào ai.
const UNTARGETED = new Set(["chat", "whisper", "wolf_chat", "move", "enter_house", "pick_up"]);

// Server đi bốn hướng theo ô; đi thẳng trên màn hình thì luân phiên hai bước ô.
function gridSteps(sx, sy) {
  if (!sx && !sy) return [];
  if (sx && sy) return [sx > 0 ? (sy < 0 ? [0, -1] : [1, 0]) : (sy < 0 ? [-1, 0] : [0, 1])];
  if (sy) return sy < 0 ? [[-1, 0], [0, -1]] : [[1, 0], [0, 1]];
  return sx > 0 ? [[1, 0], [0, -1]] : [[0, 1], [-1, 0]];
}

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Hướng nhìn (0..7) theo véc-tơ trên màn hình.
const heading = (dx, dy) => (Math.round((Math.atan2(dy, dx) * 180) / Math.PI / 45) + 12) % 8;
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function ellipsis(g, text, width) {
  if (g.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && g.measureText(cut + "…").width > width) cut = cut.slice(0, -1);
  return cut + "…";
}

function wrap(g, text, width, lines) {
  const rows = [""];
  for (const word of text.split(/\s+/)) {
    const next = rows.at(-1) ? `${rows.at(-1)} ${word}` : word;
    if (g.measureText(next).width <= width || !rows.at(-1)) rows[rows.length - 1] = next;
    else rows.push(word);
  }
  if (rows.length > lines) rows.splice(lines - 1, rows.length, rows.slice(lines - 1).join(" "));
  return rows.map((row) => ellipsis(g, row, width));
}

export function createVillage(container, { onAction, onPick, insets = () => ({ right: 0, bottom: 0 }) }) {
  const canvas = node("canvas", "scene");
  const hint = node("p", "village-hint");
  const compass = node("div", "compass");
  const compassText = node("span", "", "Quảng trường");
  compass.append(node("span", "compass-arrow", "➤"), compassText);
  const countdown = node("div", "countdown");
  const countTitle = node("span");
  const countNumber = node("strong");
  countdown.append(node("small", "", "Sắp đến lượt bạn"), countTitle, countNumber);
  const death = node("div", "death");
  death.append(node("strong", "", "Bạn đã bị loại"), node("span", "", "Linh hồn bạn ở lại theo dõi đến hết ván."));
  const loading = node("div", "loading");
  const loadingText = node("p");
  const retry = node("button", "", "Thử tải lại");
  retry.type = "button";
  loading.append(loadingText, retry);
  const interact = node("button", "interact");
  interact.type = "button";
  const interactText = node("span");
  interact.append(node("kbd", "", "F"), interactText);
  const badge = node("div", "held");
  const badgeIcon = node("img");
  badgeIcon.alt = "";
  const badgeTitle = node("strong");
  const badgeText = node("span");
  const badgeCopy = node("div");
  badgeCopy.append(badgeTitle, badgeText);
  badge.append(badgeIcon, badgeCopy);
  const toast = node("p", "village-toast");
  toast.setAttribute("role", "status");
  countdown.hidden = death.hidden = compass.hidden = interact.hidden = badge.hidden = toast.hidden = true;
  container.replaceChildren(canvas, compass, badge, hint, toast, interact, countdown, death, loading);

  const g = canvas.getContext("2d");
  const fog = document.createElement("canvas");
  const mist = fog.getContext("2d");
  let layout = defaultLayout(); // làng theo dữ liệu mới nhất của server
  let scene = buildScene(layout);
  let veil = null; // khung của lớp sương trên mặt phẳng nhìn chéo

  let match = null;
  let actors = new Map();
  let gameKey = ""; // đổi khi sang ván mới
  let round = 1;
  let ready = false;
  let broken = false; // có ảnh tải lỗi
  let owners = new Map(); // mã nhà → người nhận
  let homeId = null;
  let explored = new Set();
  let revealedAt = null;
  let pending = []; // bước đã gửi, chưa có trong `state`
  let sent = []; // thao tác chờ `action_result`, theo thứ tự gửi
  let path = []; // đường đi tới chỗ vừa bấm
  let lastStep = 0;
  let zig = 0;
  let camera = null;
  let pan = { x: 0, y: 0 };
  let mode = "";
  let interaction = null;
  let execution = null;
  let breaking = null; // khiên đang vỡ
  let played = new Set(); // hiệu ứng đã phát
  let heard = 0;
  let wolfHeard = 0;
  let hits = []; // vùng bấm được của khung hình gần nhất
  let drawn = { labels: [], signs: [], bubbles: [], items: [] };
  let toastTimer;
  let deathTimer;
  const held = new Set();

  const view = () => match.view;
  const phase = () => match.view.phase;
  const map = () => match.view.village; // vắng lúc tập trung buổi sáng, hoặc phòng không bật làng
  const isNight = () => phase() === "pair" || phase().startsWith("night");
  const dawn = () => phase() === "day_arrival";
  const gathered = () => ["day_discussion", "day_vote", "finished"].includes(phase());
  const allowed = (type) => view().allowed_actions.some((a) => a.type === type);
  const me = () => actors.get(match.me);
  const aliveOf = (actor) => view().players[actor.index].alive;
  const iAmDead = () => Boolean(view().you_died) || !aliveOf(me());
  const nameOf = (id) => match.names[id] ?? id;
  const targets = () => new Set(view().allowed_actions
    .filter((a) => !UNTARGETED.has(a.type)).flatMap((a) => a.target_ids ?? []));
  const houseOf = (id) => layout.houseById.get([...owners].find(([, owner]) => owner === id)?.[0]);
  const bonfire = () => iso(layout.square.x, layout.square.y);

  // Chỗ mình đứng: ô server báo cộng các bước đã gửi mà `state` chưa chứa.
  function predicted() {
    const at = map()?.positions?.[match.me];
    if (!at) return null;
    return pending.reduce((p, s) => ({ x: p.x + s.dx, y: p.y + s.dy }), { x: at.x, y: at.y });
  }

  // Nhiều người cùng một ô thì đứng lệch nhau cho dễ nhìn.
  function spread(actor, tile) {
    if (tile.x === layout.square.x && tile.y === layout.square.y) {
      // Ô quảng trường là đống lửa: đứng vòng quanh, mình đứng phía trước cho dễ thấy.
      const front = Math.PI / 4;
      const others = actors.size - 1;
      const order = actor.index > me().index ? actor.index - 1 : actor.index;
      const angle = actor.id === match.me ? front : front + ((order + 1) / (others + 1)) * 2 * Math.PI;
      const radius = actor.id === match.me ? 1.2 : actors.size > 12 ? 2.8 : actors.size > 8 ? 2.2 : 1.6;
      return { x: tile.x + radius * Math.cos(angle), y: tile.y + radius * Math.sin(angle) };
    }
    return { x: tile.x + (((actor.index * 37) % 7) - 3) * 0.04, y: tile.y + (((actor.index * 53) % 7) - 3) * 0.04 };
  }

  function place(actor, p) {
    Object.assign(actor, { x: p.x, y: p.y, vx: p.x, vy: p.y, goal: { x: p.x, y: p.y }, route: [] });
  }

  // Đi tới một chỗ: gần thì đi thẳng, xa thì đi vòng nhà.
  function walkTo(actor, p, speed = 9) {
    if (actor.goal && gap(actor.goal, p) < 0.01) return;
    actor.goal = { x: p.x, y: p.y };
    actor.route = [];
    if (gap(actor, p) > 2.5) {
      const from = { x: Math.round(actor.x), y: Math.round(actor.y) };
      actor.route = [...findPath(layout, from, { x: Math.round(p.x), y: Math.round(p.y) }), actor.goal];
      actor.speed = speed;
    }
  }

  function build() {
    const ids = view().players.map((p) => p.player_id);
    actors = new Map(ids.map((id, index) => [id, {
      id, index, x: layout.square.x, y: layout.square.y, vx: layout.square.x, vy: layout.square.y, goal: null, route: [], speed: 9,
      direction: 6, step: 0, moving: false, movedAt: -1000, hidden: true, inside: false, arrived: false, wolf: null, say: null,
    }]));
    owners = new Map();
    homeId = null;
    played = new Set();
    execution = breaking = null;
    camera = null;
    heard = wolfHeard = 0;
    resetFog();
    death.hidden = true;
    loadScene();
  }

  // Thiếu ảnh nào thì báo lỗi kèm nút tải lại; bảng bên vẫn chơi được.
  function loadScene() {
    const wanted = gameKey;
    ready = broken = false;
    Promise.all([loadArt(actors.size), loadVillageArt()]).then(
      () => {
        if (wanted === gameKey) ready = true;
      },
      () => {
        if (wanted === gameKey) broken = true;
      },
    );
  }
  retry.addEventListener("click", loadScene);

  // Phủ sương kín cả vùng vẽ của làng, chỉ chừa quảng trường.
  function resetFog() {
    const { u0, u1, v0, v1 } = layout.grid;
    const x = (u0 - v1) * 96 - 200;
    const y = (u0 + v0) * 48 - 500;
    veil = { x, y, w: (u1 - v0) * 96 + 200 - x, h: (u1 + v1) * 48 + 300 - y };
    fog.width = veil.w / FOG_SCALE;
    fog.height = veil.h / FOG_SCALE;
    mist.globalCompositeOperation = "source-over";
    mist.fillStyle = "#05060a";
    mist.fillRect(0, 0, fog.width, fog.height);
    explored = new Set();
    revealedAt = null;
    clearMist(layout.square.x, layout.square.y, 2.2);
  }

  function placeActors(fresh) {
    const wolves = new Map(phase() === "night_wolf" ? (view().wolf_pack ?? []).map((w) => [w.player_id, w.role]) : []);
    // Chỗ dự phòng khi server không gửi vị trí; người đã chết đứng ở góc quảng trường.
    const around = view().players.filter((p) => p.alive).map((p) => p.player_id).sort();
    const ring = seats(layout, Math.max(1, around.length));
    const seatOf = (id) => ring[around.indexOf(id)] ?? { x: layout.bounds.max_x, y: layout.bounds.max_y };
    for (const actor of actors.values()) {
      actor.wolf = wolves.get(actor.id) ?? null;
      const at = map()?.positions?.[actor.id];
      if (dawn()) {
        const here = Boolean(view().arrivals?.includes(actor.id));
        if (here && !actor.arrived) arrive(actor, seatOf(actor.id), fresh);
        actor.arrived = here;
        actor.inside = false;
        continue;
      }
      actor.arrived = false;
      if (gathered()) {
        const hidden = !aliveOf(actor) && actor.id !== match.me;
        // Lúc họp, server xếp mỗi người một ghế quanh lửa.
        const seat = at ?? seatOf(actor.id);
        if (fresh || actor.hidden || actor.inside) place(actor, seat);
        else walkTo(actor, seat);
        Object.assign(actor, { hidden, inside: false });
      } else if (at) {
        const inside = layout.doors.has(key(at.x, at.y));
        const center = layout.square;
        // Server xếp đàn Sói sát đống lửa; vẽ giãn ra để thấy rõ từng con.
        const spot = actor.wolf ? { x: center.x + (at.x - center.x) * 1.9, y: center.y + (at.y - center.y) * 1.9 }
          : inside ? at : spread(actor, at);
        if (fresh || inside || actor.hidden || actor.inside || gap(actor, spot) > 4) place(actor, spot);
        else if (actor.id !== match.me || !allowed("move")) Object.assign(actor, { goal: spot, route: [] });
        Object.assign(actor, { hidden: false, inside });
      } else {
        // Không có toạ độ: người đã chết, hoặc phòng không bật làng.
        const hidden = isNight() || (!aliveOf(actor) && actor.id !== match.me);
        if (!hidden) place(actor, seatOf(actor.id));
        Object.assign(actor, { hidden, inside: false });
      }
    }
  }

  // Server công bố ai vừa tới thì người đó đi từ cửa nhà mình ra quảng trường.
  function arrive(actor, seat, instant) {
    actor.hidden = false;
    const house = houseOf(actor.id);
    if (instant || !house) {
      place(actor, seat);
      return;
    }
    place(actor, entrance(house));
    walkTo(actor, seat, 11);
  }

  function visible(actor) {
    if (execution && actor.id === execution.victim) return false; // cảnh ném vào lửa tự vẽ
    if (dawn()) return actor.arrived;
    return !actor.hidden && !actor.inside;
  }

  function cameraMode() {
    if (execution || breaking || dawn() || gathered()) return "square";
    if (allowed("move")) return "walk";
    if (isNight() && targets().size) return "overview";
    if (!map() || iAmDead()) return "square";
    return isNight() ? "home" : "square";
  }

  function nextStep() {
    const here = predicted();
    if (!here) return null;
    let sx = 0;
    let sy = 0;
    for (const k of held) {
      sx += KEYS[k][0];
      sy += KEYS[k][1];
    }
    if (held.size) {
      path = [];
      const options = gridSteps(Math.sign(sx), Math.sign(sy));
      const order = options.length === 2 ? [options[zig % 2], options[(zig + 1) % 2]] : options;
      const free = order.find(([dx, dy]) => walkable(layout, here.x + dx, here.y + dy));
      if (!free) return null;
      zig += 1;
      return { dx: free[0], dy: free[1] };
    }
    while (path.length && path[0].x === here.x && path[0].y === here.y) path.shift();
    if (!path.length) return null;
    if (Math.abs(path[0].x - here.x) + Math.abs(path[0].y - here.y) !== 1) path = findPath(layout, here, path.at(-1));
    const next = path.shift();
    return next ? { dx: next.x - here.x, dy: next.y - here.y } : null;
  }

  function drive(now) {
    if (!allowed("move")) return;
    if (now - lastStep >= STEP_MS) {
      const move = nextStep();
      if (move && onAction({ type: "move", ...move })) {
        const step = { ...move, acked: false };
        pending.push(step);
        sent.push({ type: "move", step });
        lastStep = now;
        updateInteraction();
      }
    }
    const here = predicted();
    if (here) Object.assign(me(), { goal: spread(me(), here), route: [] });
  }

  function advance(actor, seconds, now) {
    const target = actor.route[0] ?? actor.goal;
    if (target) {
      const far = gap(actor, target);
      const speed = actor.route.length ? actor.speed : Math.max(WALK * 1.05, far / 0.2);
      const part = far ? Math.min(1, (speed * seconds) / far) : 1;
      actor.x += (target.x - actor.x) * part;
      actor.y += (target.y - actor.y) * part;
      if (part === 1 && actor.route.length) actor.route.shift();
    }
    const before = iso(actor.vx, actor.vy);
    const ease = 1 - Math.exp(-seconds / 0.07);
    actor.vx += (actor.x - actor.vx) * ease;
    actor.vy += (actor.y - actor.vy) * ease;
    const after = iso(actor.vx, actor.vy);
    const [dx, dy] = [after.x - before.x, after.y - before.y];
    const travelled = Math.hypot(dx, dy);
    if (travelled > 0.6) {
      actor.direction = heading(dx, dy);
      actor.step += travelled / 22;
      actor.movedAt = now;
    }
    actor.moving = now - actor.movedAt < 150;
    // Giữ phím thì nhìn theo phím, không lắc theo bước dích dắc.
    if (actor.id === match.me && held.size && allowed("move")) {
      const sum = [...held].reduce((s, k) => [s[0] + KEYS[k][0], s[1] + KEYS[k][1]], [0, 0]);
      if (sum[0] || sum[1]) actor.direction = heading(...sum);
    } else if (actor.wolf || (!actor.moving && (gathered() || dawn()))) {
      const at = iso(actor.vx, actor.vy);
      actor.direction = heading(bonfire().x - at.x, bonfire().y - at.y);
    }
  }

  function updateInteraction() {
    interaction = null;
    const here = match && predicted();
    if (here && phase() === "night_housing" && allowed("enter_house")) {
      const house = layout.houses.find((h) => entrance(h).x === here.x && entrance(h).y === here.y);
      if (house) {
        const owner = owners.get(house.id);
        interaction = owner && owner !== match.me
          ? { label: `Nhà của ${nameOf(owner)}`, enabled: false }
          : { label: owner ? "Vào nhà của bạn" : "Vào nhà này", enabled: true, action: { type: "enter_house", house_id: house.id } };
      }
    } else if (here && phase() === "lucky_day" && allowed("pick_up")) {
      const item = map().visible_items?.find((i) => Math.abs(i.x - here.x) + Math.abs(i.y - here.y) <= 1);
      if (item) interaction = { label: `Nhặt ${itemName(item.kind)}`, enabled: true, action: { type: "pick_up", item_id: item.id } };
    }
    interact.hidden = !interaction;
    if (!interaction) return;
    if (interactText.textContent !== interaction.label) interactText.textContent = interaction.label;
    interact.disabled = !interaction.enabled;
  }

  function useInteraction() {
    if (!match || !interaction?.enabled || !onAction(interaction.action)) return;
    sent.push({ type: interaction.action.type, item: interaction.action.item_id });
    path = [];
  }
  interact.addEventListener("click", useInteraction);

  function say(text, duration = 2600) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), duration);
  }

  function playEffect(effect, fresh) {
    if (!effect) {
      execution = breaking = null;
      return;
    }
    if (played.has(effect.id)) return;
    played.add(effect.id);
    if (effect.type === "night_slash" && effect.player_id === match.me) {
      death.hidden = false;
      clearTimeout(deathTimer);
      deathTimer = setTimeout(() => (death.hidden = true), 3500);
    } else if (effect.type === "vote_execution") {
      const victim = actors.get(effect.player_id);
      if (!victim) return;
      const from = fresh || victim.hidden
        ? map()?.positions?.[victim.id] ?? seats(layout, actors.size)[victim.index]
        : { x: victim.vx, y: victim.vy };
      execution = { victim: victim.id, from, start: performance.now() };
    } else if (effect.type === "shield_break" && actors.has(effect.player_id)) {
      breaking = { saved: effect.player_id, start: performance.now() };
    }
  }

  // Xoá sương quanh một chỗ; chỗ đã thấy giữ sáng đến hết ván.
  function clearMist(u, v, zoom = 1) {
    const at = iso(u, v);
    const radius = (SIGHT.x * zoom) / FOG_SCALE;
    mist.save();
    mist.translate((at.x - veil.x) / FOG_SCALE, (at.y - 60 - veil.y) / FOG_SCALE);
    mist.scale(1, SIGHT.y / SIGHT.x);
    const soft = mist.createRadialGradient(0, 0, radius * 0.5, 0, 0, radius);
    soft.addColorStop(0, "rgba(0,0,0,1)");
    soft.addColorStop(1, "rgba(0,0,0,0)");
    mist.globalCompositeOperation = "destination-out";
    mist.fillStyle = soft;
    mist.beginPath();
    mist.arc(0, 0, radius, 0, Math.PI * 2);
    mist.fill();
    mist.restore();
    const reach = Math.ceil(7 * zoom);
    for (let a = Math.round(u) - reach; a <= Math.round(u) + reach; a += 1) {
      for (let b = Math.round(v) - reach; b <= Math.round(v) + reach; b += 1) {
        const p = iso(a, b);
        if (((p.x - at.x) / SIGHT.x) ** 2 + ((p.y - at.y) / SIGHT.y) ** 2 < 0.65 * zoom * zoom) explored.add(key(a, b));
      }
    }
  }
  const seen = (u, v) => explored.has(key(Math.round(u), Math.round(v)));

  function reveal(actor) {
    if (revealedAt && gap(actor, revealedAt) < 0.15) return;
    revealedAt = { x: actor.x, y: actor.y };
    clearMist(actor.x, actor.y);
  }

  function cameraTarget(width, height) {
    const { right, bottom } = insets();
    const small = compact();
    const base = small ? 0.56 : 0.86;
    const focus = { x: (width - right) / 2, y: (height - bottom) / 2 };
    // Quảng trường: vừa đủ khung để thấy cả vòng người họp.
    let cam = { x: bonfire().x, y: bonfire().y - 40 };
    const clear = small ? 150 : 90;
    const room = Math.min((width - right - 24) / (2 * SEAT_SPAN.x + 170), (height - bottom - clear) / (2 * SEAT_SPAN.y + 220));
    let scale = Math.max(small ? 0.26 : 0.4, Math.min(base, room));
    if (mode === "square") focus.y += small ? 50 : 20;
    if (mode === "walk") {
      const at = iso(me().vx, me().vy);
      cam = { x: at.x, y: at.y - 50 };
      scale = base;
    } else if (mode === "home" && homeId) {
      const house = layout.houseById.get(homeId);
      const at = iso(house.x, house.y);
      cam = { x: at.x, y: at.y - 110 };
      scale = base * 0.9;
    } else if (mode === "overview" && phase() === "night_wolf") {
      // Đủ gần để thấy rõ đàn Sói; tên cửa ở xa được ghim vào mép khung.
      scale = small ? 0.45 : 0.72;
      focus.y += small ? 40 : 20;
    } else if (mode === "overview") {
      // Cả làng vừa khung để bấm tên trên cửa; điện thoại thì kéo để xem thêm.
      const boxes = layout.houses.map(houseRect);
      const [x0, x1] = [Math.min(...boxes.map((b) => b.x)), Math.max(...boxes.map((b) => b.x + b.w))];
      const [y0, y1] = [Math.min(...boxes.map((b) => b.y)), Math.max(...boxes.map((b) => b.y + b.h))];
      const top = small ? 130 : 110;
      const fit = Math.min((width - right - 24) / (x1 - x0), (height - bottom - top) / (y1 - y0));
      scale = Math.max(small ? 0.24 : 0.2, Math.min(base, fit));
      cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      focus.y += top / 2;
    }
    if (mode !== "walk") cam = { x: cam.x + pan.x, y: cam.y + pan.y };
    return { cam, scale, focus };
  }

  const screen = (p) => ({ x: camera.focus.x + (p.x - camera.cam.x) * camera.scale, y: camera.focus.y + (p.y - camera.cam.y) * camera.scale });
  const world = (p) => ({ x: camera.cam.x + (p.x - camera.focus.x) / camera.scale, y: camera.cam.y + (p.y - camera.focus.y) / camera.scale });
  const worldTransform = (ratio) => {
    const { scale, focus, cam } = camera;
    g.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * (focus.x - cam.x * scale), ratio * (focus.y - cam.y * scale));
  };

  function glow(x, y, radius, color) {
    const light = g.createRadialGradient(x, y, 0, x, y, radius);
    light.addColorStop(0, color);
    light.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = light;
    g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function drawPerson(actor, now) {
    const at = iso(actor.vx, actor.vy);
    const self = actor.id === match.me;
    g.fillStyle = "rgba(0,0,0,.38)";
    g.beginPath();
    g.ellipse(at.x, at.y + 2, actor.wolf ? 42 : 30, actor.wolf ? 18 : 13, 0, 0, Math.PI * 2);
    g.fill();
    if (self || actor.pickable) {
      g.strokeStyle = actor.pickable ? `rgba(226, 70, 50, ${0.75 + 0.25 * Math.sin(now / 180)})` : "#d9a441";
      g.lineWidth = actor.pickable ? 5 : 3;
      g.beginPath();
      g.ellipse(at.x, at.y + 2, actor.wolf ? 48 : 34, actor.wolf ? 21 : 16, 0, 0, Math.PI * 2);
      g.stroke();
    }
    const time = now / 260 + actor.index;
    if (actor.wolf) {
      drawWolf(g, actor.wolf, actor.direction, time, at.x, at.y);
      return;
    }
    g.save();
    if (self && iAmDead()) {
      g.globalAlpha = 0.42;
      g.filter = "grayscale(1) brightness(1.35)";
    }
    drawActor(g, outfitOf(actor.index), { moving: actor.moving, direction: actor.direction, step: actor.step, time }, at.x, at.y);
    g.restore();
  }

  // Người bị treo: bay vòng cung vào đống lửa rồi chìm trong lửa.
  function victimPose(now) {
    const t = Math.min(1, (now - execution.start) / SCENE_MS);
    const fly = Math.min(1, t / 0.6);
    return {
      t, fly,
      u: execution.from.x + (layout.square.x - execution.from.x) * fly,
      v: execution.from.y + (layout.square.y - execution.from.y) * fly,
    };
  }

  function drawVictim(now) {
    const { t, fly, u, v } = victimPose(now);
    const actor = actors.get(execution.victim);
    const at = iso(u, v);
    g.save();
    g.globalAlpha = Math.max(0, Math.min(1, (0.92 - t) / 0.28));
    g.translate(at.x, at.y - 45 - Math.sin(Math.PI * fly) * 150);
    g.rotate(fly * Math.PI * 1.4);
    drawActor(g, outfitOf(actor.index), { moving: true, direction: actor.direction, step: now / 70, time: 0 }, 0, 45);
    g.restore();
  }

  // Thứ tự vẽ: nhà theo thân, người và cây theo chân; vật đứng cạnh nhà xét theo góc trước của nhà.
  function drawList(now, bounds) {
    const near = (x, y, pad = 700) => x > bounds.left - pad && x < bounds.right + pad && y > bounds.top - 250 && y < bounds.bottom + pad;
    const houses = layout.houses.map((house) => ({ house, rect: houseRect(house), depth: house.x + house.y - 0.5 }))
      .filter(({ rect }) => near(rect.x + rect.w / 2, rect.y + rect.h, 500));
    const points = [];
    for (const object of scene.objects) {
      const at = iso(object.u, object.v);
      if (near(at.x, at.y)) points.push({ object, u: object.u, v: object.v });
    }
    points.push({ fire: true, u: layout.square.x, v: layout.square.y });
    for (const actor of actors.values()) if (visible(actor)) points.push({ actor, u: actor.vx, v: actor.vy });
    for (const item of (phase() === "lucky_day" && map()?.visible_items) || []) points.push({ item, u: item.x, v: item.y });
    if (execution) {
      const pose = victimPose(now);
      points.push({ victim: true, u: pose.u, v: pose.v, front: pose.fly > 0.5 });
    }
    if (breaking) {
      const saved = actors.get(breaking.saved);
      points.push({ shield: true, u: saved.vx, v: saved.vy, front: true });
    }
    for (const p of points) {
      p.depth = p.u + p.v + (p.front ? 1.5 : 0);
      const at = iso(p.u, p.v);
      const body = { x: at.x - 40, y: at.y - 110, w: 80, h: 125 };
      for (const { house, rect, depth } of houses) {
        if (!overlaps(rect, body)) continue;
        const inFront = p.u > house.x + 1.49 || p.v > house.y + 0.49;
        p.depth = inFront ? Math.max(p.depth, depth + 0.01) : Math.min(p.depth, depth - 0.01);
      }
    }
    return [...houses, ...points].sort((a, b) => a.depth - b.depth);
  }

  function drawWorld(now, width, height, ratio) {
    worldTransform(ratio);
    const a = world({ x: 0, y: 0 });
    const b = world({ x: width, y: height });
    const bounds = { left: a.x, top: a.y, right: b.x, bottom: b.y };

    // Nền, chỉ vẽ ô nằm trong khung nhìn.
    const corners = [unIso(a.x, a.y), unIso(b.x, a.y), unIso(a.x, b.y), unIso(b.x, b.y)];
    const range = (axis, low, high) => [
      Math.max(low, Math.floor(Math.min(...corners.map((c) => c[axis]))) - 1),
      Math.min(high, Math.ceil(Math.max(...corners.map((c) => c[axis]))) + 1),
    ];
    const [u0, u1] = range("x", layout.grid.u0, layout.grid.u1);
    const [v0, v1] = range("y", layout.grid.v0, layout.grid.v1);
    for (let sum = u0 + v0; sum <= u1 + v1; sum += 1) {
      for (let u = Math.max(u0, sum - v1); u <= Math.min(u1, sum - v0); u += 1) {
        const { x, y } = iso(u, sum - u);
        if (x > a.x - 100 && x < b.x + 100 && y > a.y - 60 && y < b.y + 60) drawTile(g, scene.tileAt(u, sum - u), x, y);
      }
    }

    const list = drawList(now, bounds);
    // Nhà, cây đứng trước che mất người thì làm mờ.
    const bodies = list.filter((e) => e.actor).map((e) => {
      const feet = iso(e.u, e.v);
      return { depth: e.depth, x: feet.x - 20, y: feet.y - 95, w: 40, h: 75 };
    });
    const hides = (rect, depth) => bodies.some((p) => p.depth < depth &&
      overlaps({ x: rect.x + rect.w * 0.15, y: rect.y + rect.h * 0.1, w: rect.w * 0.7, h: rect.h * 0.8 }, p));
    const fade = (holder, covering) => {
      holder.alpha = (holder.alpha ?? 1) + ((covering ? 0.22 : 1) - (holder.alpha ?? 1)) * 0.2;
      g.globalAlpha = Math.min(1, holder.alpha);
    };
    for (const entry of list) {
      if (entry.house) {
        fade(entry.house, hides(entry.rect, entry.depth));
        drawHouse(g, entry.house);
      } else if (entry.object) {
        const { id, u, v } = entry.object;
        const at = iso(u, v);
        const box = tileRect(id);
        fade(entry.object, box.h >= 100 && hides({ x: at.x + box.x, y: at.y + box.y, w: box.w, h: box.h }, entry.depth));
        drawTile(g, id, at.x, at.y);
      } else if (entry.fire) {
        const center = bonfire();
        drawTile(g, BONFIRE, center.x, center.y);
        const size = execution ? 2.3 + 0.35 * Math.sin(Math.PI * victimPose(now).t) : isNight() ? 1.5 : 1.2;
        drawFire(g, center.x, center.y, now, size);
      } else if (entry.actor) {
        drawPerson(entry.actor, now);
      } else if (entry.item) {
        const at = iso(entry.u, entry.v);
        glow(at.x, at.y, 74 + 8 * Math.sin(now / 220), "rgba(255,200,90,.55)");
        drawLoot(g, entry.item.kind, at.x, at.y);
      } else if (entry.victim) {
        drawVictim(now);
      } else if (entry.shield) {
        const at = iso(entry.u, entry.v);
        drawShieldBreak(g, at.x, at.y, Math.min(1, (now - breaking.start) / SCENE_MS));
      }
      g.globalAlpha = 1;
    }
  }

  function drawLight(now, width, height, ratio) {
    const night = isNight();
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.globalCompositeOperation = "multiply";
    // Màn chọn mục tiêu sáng hơn một chút để thấy rõ cửa nhà và đàn Sói.
    g.fillStyle = night ? (mode === "overview" ? "#929ac4" : "#6474a8")
      : execution ? "#d9b49a" : dawn() ? "#e6cdb8" : phase() === "lucky_day" || breaking ? "#f3e4c2" : "#ece4d4";
    g.fillRect(0, 0, width, height);
    g.globalCompositeOperation = "lighter";
    const flicker = 1 + Math.sin(now / 90) * 0.03 + Math.sin(now / 230) * 0.04;
    const fire = screen({ x: bonfire().x, y: bonfire().y - 24 });
    const k = camera.scale;
    glow(fire.x, fire.y, (execution ? 700 : night ? 460 : 240) * k * flicker,
      night ? "rgba(255,130,40,.46)" : execution ? "rgba(255,110,30,.4)" : "rgba(255,140,50,.16)");
    if (night) {
      // Đàn Sói được rọi thêm để nhìn rõ từng con.
      for (const actor of actors.values()) {
        if (!actor.wolf || !visible(actor)) continue;
        const at = screen(iso(actor.vx, actor.vy));
        glow(at.x, at.y, 105 * k, "rgba(255,170,90,.2)");
      }
      if (visible(me())) {
        const mine = screen(iso(me().vx, me().vy));
        glow(mine.x, mine.y - 50 * k, 280 * k, "rgba(150,180,235,.26)");
      }
      for (const house of layout.houses) {
        const inside = [...actors.values()].some((p) => p.inside && p.goal && p.goal.x === house.x && p.goal.y === house.y);
        if (!inside) continue;
        const at = screen(iso(house.x, house.y));
        glow(at.x, at.y - 80 * k, 190 * k * flicker, "rgba(255,176,80,.34)");
      }
    }
    g.globalCompositeOperation = "source-over";
  }

  function drawFog(width, height, ratio) {
    worldTransform(ratio);
    // Lúc phải chọn mục tiêu, sương mỏng đi để thấy hết cửa nhà.
    g.globalAlpha = mode === "overview" ? 0.3 : 1;
    g.drawImage(fog, veil.x, veil.y, veil.w, veil.h);
    g.globalAlpha = 1;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    const night = isNight();
    const reach = Math.max(width, height);
    const { focus } = camera;
    const edge = g.createRadialGradient(focus.x, focus.y, reach * (night ? 0.2 : 0.3), focus.x, focus.y, reach * (night ? 0.7 : 0.78));
    edge.addColorStop(0, "rgba(3,4,8,0)");
    edge.addColorStop(1, mode === "overview" ? "rgba(3,4,8,.55)" : night ? "rgba(3,4,8,.8)" : "rgba(8,7,6,.6)");
    g.fillStyle = edge;
    g.fillRect(0, 0, width, height);
  }

  // Biển trên cửa: lúc về nhà có chữ F (mờ nếu nhà của người khác); lúc chọn mục tiêu bấm được.
  function houseSigns(chosen) {
    const housing = phase() === "night_housing" && allowed("enter_house");
    const choosing = mode === "overview";
    const votes = Object.values(view().wolf_votes ?? {});
    const allies = new Set(view().allowed_actions.flatMap((a) => a.ally_target_ids ?? []));
    return layout.houses.map((house) => {
      const owner = owners.get(house.id);
      const mine = house.id === homeId && (!owner || owner === match.me);
      if (!(housing || (choosing && owner) || (mine && !gathered() && !dawn()))) return null;
      if (!choosing && !seen(house.x, house.y + 1)) return null;
      let text = mine || owner === match.me ? "Nhà của bạn" : owner ? `Nhà ${nameOf(owner)}` : "Còn trống";
      const count = votes.filter((target) => target === owner).length;
      if (choosing && allies.has(owner)) text += " · đồng đội";
      if (count) text += ` · ${count} phiếu`;
      return { house, owner, text, mine, key: housing ? (owner && owner !== match.me ? "off" : "on") : null, pickable: chosen.has(owner) };
    }).filter(Boolean);
  }

  function drawNames(now, width, height) {
    const small = compact();
    const placed = [];
    hits = [];
    drawn = { labels: [], signs: [], bubbles: [], items: [] };
    const free = (box) => {
      // Chữ ở nửa dưới thì né lên trên, để không bị đẩy khỏi màn hình.
      const up = box.y > height * 0.65;
      for (let tries = 0; tries < 24; tries += 1) {
        const other = placed.find((o) => overlaps(o, box));
        if (!other) break;
        box.y = up ? other.y - box.h - 1 : other.y + other.h + 1;
      }
      placed.push(box);
      return box;
    };
    const plate = (box, colors) => {
      g.fillStyle = colors.fill;
      g.fillRect(box.x, box.y, box.w, box.h);
      g.strokeStyle = colors.line;
      g.lineWidth = colors.weight ?? 1;
      g.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
      g.fillStyle = colors.text;
    };
    g.textAlign = "center";
    g.textBaseline = "middle";
    const picked = { fill: "rgba(70,16,12,.94)", line: "#e2563f", text: "#ffe3d8", weight: 2 };
    const chosen = targets();
    // Biển ghim ở mép không được che dòng gợi ý.
    if (mode === "overview" && !hint.hidden) {
      placed.push({ x: hint.offsetLeft, y: hint.offsetTop, w: hint.offsetWidth, h: hint.offsetHeight });
    }
    // Biển tên cửa không được đè lên hình Sói.
    for (const actor of actors.values()) {
      if (!actor.wolf || !visible(actor)) continue;
      const feet = screen(iso(actor.vx, actor.vy));
      const k = camera.scale;
      placed.push({ x: feet.x - 45 * k, y: feet.y - 90 * k, w: 90 * k, h: 95 * k });
    }

    g.font = `700 ${small ? 13 : 17}px ${NAME_FONT}`;
    for (const sign of houseSigns(chosen)) {
      const rect = houseRect(sign.house);
      const at = screen({ x: rect.x + rect.w / 2, y: rect.y + rect.h * 0.12 });
      const text = ellipsis(g, sign.text, small ? 120 : 200);
      const h = small ? 20 : 26;
      const chip = sign.key ? h : 0;
      const w = g.measureText(text).width + 16 + chip;
      let box = { x: at.x - w / 2, y: at.y - h, w, h };
      if (sign.pickable && mode === "overview") {
        // Cửa ngoài khung vẫn bấm được: ghim tên vào mép phần bản đồ còn trống.
        const { right, bottom } = insets();
        box.x = Math.max(8, Math.min(width - right - w - 8, box.x));
        box.y = Math.max(small ? 176 : 96, Math.min(height - bottom - h - (small ? 8 : 56), box.y));
      } else if (box.x > width || box.x + box.w < 0 || box.y > height || box.y + box.h < 0) continue;
      box = free(box);
      plate(box, sign.pickable ? picked : { fill: "rgba(40,28,16,.9)", line: sign.mine ? "#d9a441" : "#8a7048", text: "#e8d9b5" });
      g.fillText(text, box.x + chip + (box.w - chip) / 2, box.y + box.h / 2 + 1);
      if (sign.key) {
        g.globalAlpha = sign.key === "off" ? 0.28 : 1;
        g.fillStyle = sign.key === "off" ? "#6d675e" : "#e8c36a";
        g.fillRect(box.x + 3, box.y + 3, h - 6, h - 6);
        g.fillStyle = "#1c130a";
        g.fillText("F", box.x + h / 2, box.y + box.h / 2 + 1);
        g.globalAlpha = 1;
      }
      drawn.signs.push({ id: sign.house.id, owner: sign.owner ?? null, text, key: sign.key, pickable: sign.pickable, ...box });
      if (sign.pickable) {
        hits.push({ id: sign.owner, ...box });
      }
    }

    g.font = `700 ${small ? 12 : 17}px ${NAME_FONT}`;
    const people = [...actors.values()].filter(visible).sort((a, b) => a.vx + a.vy - (b.vx + b.vy));
    for (const actor of people) {
      if (actor.id !== match.me && mode !== "overview" && !seen(actor.vx, actor.vy)) continue;
      const feet = screen(iso(actor.vx, actor.vy));
      const wolf = actor.wolf || view().wolf_peers?.includes(actor.id);
      const text = ellipsis(g, (wolf ? "🐺 " : "") + nameOf(actor.id), small ? 62 : 130);
      const w = g.measureText(text).width + (small ? 8 : 18);
      // Người đứng sát mép thì tên vẫn nằm trọn trong màn hình.
      const onScreen = feet.x > 0 && feet.x < width;
      const left = onScreen ? Math.max(2, Math.min(width - w - 2, feet.x - w / 2)) : feet.x - w / 2;
      const box = free({ x: left, y: feet.y + 12 * camera.scale, w, h: small ? 17 : 22 });
      const self = actor.id === match.me;
      plate(box, actor.pickable ? picked : { fill: "rgba(8,6,5,.82)", line: self ? "#d9a441" : "#4a3d29", text: self ? "#ffd987" : "#e3d8c0" });
      g.fillText(text, box.x + box.w / 2, box.y + box.h / 2 + 1);
      drawn.labels.push({ id: actor.id, ...box });
      if (actor.pickable) {
        const k = camera.scale;
        hits.push({ id: actor.id, ...box }, { id: actor.id, x: feet.x - 40 * k, y: feet.y - 120 * k, w: 80 * k, h: 130 * k });
      }
    }

    // Tên cổ vật dưới món đồ nhìn thấy.
    for (const item of (phase() === "lucky_day" && map()?.visible_items) || []) {
      const at = screen(iso(item.x, item.y));
      const text = itemName(item.kind);
      const w = g.measureText(text).width + 14;
      const box = free({ x: at.x - w / 2, y: at.y + 22 * camera.scale, w, h: small ? 18 : 22 });
      plate(box, { fill: "rgba(44,30,8,.92)", line: "#d9a441", text: "#ffe6a6" });
      g.fillText(text, box.x + box.w / 2, box.y + box.h / 2 + 1);
      drawn.items.push({ kind: item.kind, text, ...box });
    }

    // Đông người nói cùng lúc thì chỉ hiện vài câu mới nhất (đủ câu vẫn nằm trong khung chat).
    g.font = `400 ${small ? 12 : 14}px ${TEXT_FONT}`;
    const speaking = people
      .filter((a) => a.say?.until >= now && (a.id === match.me || mode === "overview" || seen(a.vx, a.vy)))
      .map((actor) => ({ actor, feet: screen(iso(actor.vx, actor.vy)) }))
      .filter(({ feet }) => feet.x > 0 && feet.x < width && feet.y > 0 && feet.y < height)
      .sort((a, b) => b.actor.say.until - a.actor.say.until);
    // Điện thoại có thanh đầu trang và dòng gợi ý phủ phía trên, đừng vẽ chữ xuống dưới đó.
    const ceiling = small ? 170 : 4;
    for (const { actor, feet } of speaking) {
      if (drawn.bubbles.length >= (small ? 2 : 4)) break;
      const rows = wrap(g, actor.say.text, small ? 150 : 220, 2);
      const w = Math.max(...rows.map((row) => g.measureText(row).width)) + 20;
      const h = rows.length * 18 + 10;
      const x = Math.max(4, Math.min(width - w - 4, feet.x - w / 2));
      const box = { x, y: feet.y - 132 * camera.scale - h, w, h };
      // Đụng bong bóng khác hoặc biển tên thì đẩy lên trên.
      const taken = [...drawn.bubbles, ...drawn.labels];
      for (let other; (other = taken.find((o) => overlaps(o, box))); ) box.y = other.y - h - 4;
      if (box.y < ceiling) continue;
      drawn.bubbles.push({ id: actor.id, ...box });
      g.fillStyle = actor.wolf ? "rgba(96,26,20,.96)" : "rgba(232,222,200,.96)";
      g.beginPath();
      g.roundRect(box.x, box.y, box.w, box.h, 8);
      g.fill();
      g.fillStyle = actor.wolf ? "#ffe3d8" : "#231a12";
      rows.forEach((row, i) => g.fillText(row, box.x + box.w / 2, box.y + 14 + i * 18));
    }
  }

  function drawOverlays(width, height) {
    const self = me();
    let goal = null;
    if (mode === "walk") {
      // Mũi tên chỉ đường khi chỗ cần tới nằm ngoài phần bản đồ nhìn thấy.
      const { right, bottom } = insets();
      const away = (tile) => {
        const p = screen(iso(tile.x, tile.y));
        return p.x < 30 || p.x > width - right - 30 || p.y < (compact() ? 170 : 90) || p.y > height - bottom - 30;
      };
      const home = layout.houseById.get(homeId);
      if (phase() === "night_housing" && home) {
        if (away(entrance(home))) goal = { ...entrance(home), label: "Nhà bạn" };
      } else if (away(layout.square)) goal = { ...layout.square, label: "Quảng trường" };
    }
    compass.hidden = !goal;
    if (goal) {
      const from = iso(self.vx, self.vy);
      const to = iso(goal.x, goal.y);
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const { focus } = camera;
      compass.style.left = focus.x + Math.cos(angle) * Math.max(50, Math.min(width / 3, 330)) + "px";
      compass.style.top = focus.y + Math.sin(angle) * Math.max(50, Math.min(focus.y - 90, 240)) + "px";
      compass.firstChild.style.transform = `rotate(${angle}rad)`;
      if (compassText.textContent !== goal.label) compassText.textContent = goal.label;
    }
    countdown.hidden = phase() !== "night_prepare";
    if (!countdown.hidden) {
      const seconds = Math.max(0, Math.ceil((match.deadline - Date.now()) / 1000));
      const title = TURNS[view().next_phase] ?? "Lượt của bạn";
      if (countNumber.textContent !== String(seconds)) countNumber.textContent = String(seconds);
      if (countTitle.textContent !== title) countTitle.textContent = title;
    }
  }

  let before = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const seconds = Math.min(0.05, (now - before) / 1000);
    before = now;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!match || !width) return;
    drive(now);
    for (const actor of actors.values()) advance(actor, seconds, now);
    if (mode === "walk") reveal(me());

    const target = cameraTarget(width, height);
    if (!camera) camera = target;
    else {
      const ease = 1 - Math.exp(-seconds * 7);
      camera.scale += (target.scale - camera.scale) * ease;
      camera.cam.x += (target.cam.x - camera.cam.x) * ease;
      camera.cam.y += (target.cam.y - camera.cam.y) * ease;
      camera.focus = target.focus;
    }
    loading.hidden = ready;
    if (!ready) {
      retry.hidden = !broken;
      const status = broken ? "Không tải được hình của làng. Bảng bên vẫn dùng được." : "Đang thắp lửa trại…";
      if (loadingText.textContent !== status) loadingText.textContent = status;
      return;
    }
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.fillStyle = "#05060a";
    g.fillRect(0, 0, width, height);
    drawWorld(now, width, height, ratio);
    drawLight(now, width, height, ratio);
    drawFog(width, height, ratio);
    drawNames(now, width, height);
    drawOverlays(width, height);
  }
  requestAnimationFrame(tick);

  // Bấm: chọn mục tiêu, hoặc đi tới đó. Ngoài lúc đi lại thì kéo để xem quanh làng.
  let press = null;
  canvas.addEventListener("pointerdown", (event) => {
    press = { x: event.clientX, y: event.clientY, panned: false };
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!press || !camera || mode === "walk") return;
    const [dx, dy] = [event.clientX - press.x, event.clientY - press.y];
    if (!press.panned && Math.hypot(dx, dy) < 8) return;
    pan = { x: pan.x - dx / camera.scale, y: pan.y - dy / camera.scale };
    camera.cam = { x: camera.cam.x - dx / camera.scale, y: camera.cam.y - dy / camera.scale };
    press = { x: event.clientX, y: event.clientY, panned: true };
  });
  canvas.addEventListener("pointercancel", () => (press = null));
  canvas.addEventListener("pointerup", (event) => {
    const tapped = press && !press.panned;
    press = null;
    if (!tapped || !match || !camera) return;
    const box = canvas.getBoundingClientRect();
    const point = { x: event.clientX - box.left, y: event.clientY - box.top };
    const hit = hits.findLast((h) => point.x >= h.x && point.x <= h.x + h.w && point.y >= h.y && point.y <= h.y + h.h);
    if (hit) {
      onPick(hit.id);
      return;
    }
    const here = allowed("move") && predicted();
    if (!here) return;
    const at = world(point);
    // Bấm vào một căn nhà thì đi tới ô trước cửa căn đó.
    const house = layout.houses.findLast((h) => {
      const r = houseRect(h);
      return at.x > r.x + r.w * 0.18 && at.x < r.x + r.w * 0.82 && at.y > r.y + r.h * 0.3 && at.y < r.y + r.h;
    });
    const tile = unIso(at.x, at.y);
    path = findPath(layout, here, house ? entrance(house) : { x: Math.round(tile.x), y: Math.round(tile.y) });
  });
  addEventListener("keydown", (event) => {
    const k = event.key.toLowerCase();
    if (!match || !container.clientWidth || event.target.closest?.("input, select, textarea")) return;
    if (k === "f" && !event.repeat) useInteraction();
    if (!(k in KEYS)) return;
    held.add(k);
    event.preventDefault();
  });
  addEventListener("keyup", (event) => held.delete(event.key.toLowerCase()));
  addEventListener("blur", () => held.clear());

  function hintText() {
    if (execution) return `Dân làng ném ${nameOf(execution.victim)} vào đống lửa.`;
    if (phase() === "night_housing") {
      if (!allowed("move")) return iAmDead() ? "Bạn đang theo dõi cả làng về nhà." : "Bạn đã vào nhà. Chờ đêm bắt đầu.";
      return owners.get(homeId) === match.me
        ? "Về nhà bạn, đứng ở ô trước cửa rồi bấm F."
        : "Chọn một căn còn trống: đứng ở ô trước cửa rồi bấm F. Nhà có chủ thì F mờ đi.";
    }
    if (phase() === "lucky_day") {
      return allowed("move")
        ? `Ngày may mắn: đi tìm ${ITEMS.sword.name} và ${ITEMS.shield.name}, tới gần mới thấy.`
        : "Người sống đang đi tìm cổ vật.";
    }
    if (phase() === "night_prepare") return "Chuẩn bị. Đếm hết thì bạn được hành động.";
    if (dawn()) return "Trời sáng. Mọi người lần lượt ra quảng trường, xem ai vắng mặt.";
    if (isNight() && targets().size) {
      return phase() === "night_wolf"
        ? "Đàn Sói họp bên đống lửa. Bàn ở Chat Sói, bấm tên trên cửa nhà để cắn."
        : "Đến lượt bạn: bấm tên trên cửa nhà để chọn, rồi bấm nút kỹ năng. Kéo để xem quanh làng.";
    }
    if (isNight()) return "Cả làng đang ngủ.";
    if (iAmDead()) return "Bạn đang theo dõi ván.";
    return phase() === "day_vote" ? "Cả làng ở quảng trường. Bấm vào người bạn muốn loại." : "Cả làng ở quảng trường để bàn bạc.";
  }

  // Cổ vật đang giữ; ban đêm là khiên còn hiệu lực (chỉ chủ khiên nhận `night_shield`).
  function updateBadge() {
    const held = map()?.held_item;
    const kind = held ?? (view().night_shield ? "shield" : null);
    badge.hidden = !kind;
    if (!kind) return;
    if (badgeIcon.getAttribute("src") !== iconUrl(kind)) badgeIcon.src = iconUrl(kind);
    badgeTitle.textContent = itemName(kind);
    badgeText.textContent = held ? ITEMS[kind]?.effect ?? "" : NIGHT_SHIELD;
  }

  const api = {
    update(next, { withNames = (text) => text } = {}) {
      const previous = match;
      match = next;
      const updated = updateLayout(layout, next.view.village);
      const redrawn = updated !== layout; // server đổi bản đồ: dựng lại cảnh
      if (redrawn) {
        layout = updated;
        scene = buildScene(layout);
      }
      const nextKey = [next.code, next.me, ...next.view.players.map((p) => p.player_id)].join("|");
      const fresh = nextKey !== gameKey || next.view.round < round;
      round = next.view.round;
      if (fresh) {
        gameKey = nextKey;
        build();
      } else if (redrawn) resetFog();
      // Sang lượt mới thì bỏ bước chưa được ghi nhận; còn lại giữ bước server chưa trả lời.
      if (fresh || previous?.phase_id !== next.phase_id) {
        pending = [];
        path = [];
        zig = 0;
      } else {
        pending = pending.filter((step) => !step.acked);
      }
      const village = next.view.village;
      if (village) {
        const firstHome = !homeId && village.home_id;
        homeId = village.home_id ?? homeId;
        const home = layout.houseById.get(homeId);
        if (firstHome && home) clearMist(home.x, home.y + 1, 0.8);
        if (village.houses) owners = new Map(village.houses.filter((h) => h.owner_id).map((h) => [h.id, h.owner_id]));
        // Lượt kỹ năng không gửi `houses` (vd vừa vào lại): ai đang ở toạ độ cửa là chủ căn đó.
        for (const [id, at] of Object.entries(village.positions ?? {})) {
          const door = layout.doors.get(key(at.x, at.y));
          if (door) owners.set(door.id, id);
        }
      }
      playEffect(next.view.effect, fresh);
      placeActors(fresh || redrawn);
      if (dawn() || gathered()) clearMist(layout.square.x, layout.square.y, 2.2);

      const chosen = targets();
      for (const actor of actors.values()) actor.pickable = chosen.has(actor.id);
      const speak = (list, from) => {
        for (const message of list.slice(from)) {
          const actor = actors.get(message.player_id);
          if (actor && !fresh) actor.say = { text: withNames(message.text).slice(0, 90), until: performance.now() + 4500 };
        }
        return list.length;
      };
      heard = speak(next.view.public_chat, heard);
      const wolfChat = next.view.wolf_chat ?? [];
      wolfHeard = speak(wolfChat, Math.min(wolfHeard, wolfChat.length));

      const wanted = cameraMode();
      if (wanted !== mode) {
        mode = wanted;
        pan = { x: 0, y: 0 };
      }
      updateInteraction();
      updateBadge();
      container.dataset.night = String(isNight());
      hint.textContent = hintText();
      hint.hidden = Boolean(execution || breaking); // đầu trang đã ghi chuyện gì đang diễn ra
    },
    // Trả lời của server cho thao tác trên bản đồ, theo đúng thứ tự đã gửi.
    result(message) {
      const action = sent.shift();
      if (!action) return;
      if (action.type === "move") {
        if (message.accepted) action.step.acked = true;
        else {
          pending = pending.filter((step) => step !== action.step);
          if (message.reason !== "move_too_fast") path = [];
        }
      } else if (!message.accepted) {
        say(REASONS[message.reason] ?? "Chưa làm được, thử lại.");
      } else if (action.type === "pick_up") {
        say(`Đã nhặt ${itemName(action.item)}. ${ITEMS[action.item]?.effect ?? ""}`, 5000);
      }
      if (match) updateInteraction();
    },
    disconnected() {
      pending = [];
      sent = [];
      path = [];
      held.clear();
    },
    reset() {
      api.disconnected();
      gameKey = "";
      match = null;
      round = 1;
      mode = "";
      camera = null;
      execution = breaking = null;
      layout = defaultLayout();
      scene = buildScene(layout);
      death.hidden = countdown.hidden = compass.hidden = interact.hidden = badge.hidden = toast.hidden = true;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
    },
    // Ảnh chụp trạng thái để kiểm thử tự động.
    inspect() {
      if (!match || !camera) return null;
      return {
        ready, mode, scale: camera.scale, focus: camera.focus,
        me: predicted(), pending: pending.length, path: path.length,
        actors: [...actors.values()].map((a) => ({
          id: a.id, x: a.vx, y: a.vy, visible: visible(a), inside: a.inside, wolf: a.wolf, direction: a.direction,
          screen: screen(iso(a.vx, a.vy)), pickable: Boolean(a.pickable), say: a.say?.until > performance.now() ? a.say.text : null,
        })),
        interaction: interaction && { label: interaction.label, enabled: interaction.enabled },
        execution: execution && { victim: execution.victim },
        breaking: breaking && { saved: breaking.saved },
        layout: { width: layout.width, height: layout.height, square: layout.square },
        signs: drawn.signs, labels: drawn.labels, bubbles: drawn.bubbles, items: drawn.items,
      };
    },
  };
  // Chỉ khi chạy `npm run dev`: cho kiểm thử trình duyệt đọc được trạng thái canvas.
  if (import.meta.env?.DEV) window.__village = api;
  return api;
}
