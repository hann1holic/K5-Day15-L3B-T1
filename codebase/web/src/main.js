import "./styles.css";

const $ = (id) => document.getElementById(id);
const screens = ["home", "lobby", "game", "result"];
const endpoint = import.meta.env.VITE_WS_URL ||
  (location.protocol === "https:" ? "wss://" : "ws://") + location.hostname + ":8000/ws";
const sessionKey = "ma-soi:" + endpoint;
const roles = {
  dan: ["Dân", "Đọc lời khai và bỏ phiếu ban ngày."],
  soi_thuong: ["Sói thường", "Cùng phe Sói chọn mục tiêu vào ban đêm."],
  soi_con: ["Sói con", "Khi bạn bị loại, phe Sói có thêm một lượt cắn trong đêm kế tiếp."],
  bao_ve: ["Bảo vệ", "Chọn một người để chặn cú cắn của Sói."],
  tien_tri: ["Tiên tri", "Soi một người để biết vai gốc có phải Sói hay không."],
  tien_tri_tap_su: ["Tiên tri tập sự", "Tiếp quản lượt soi sau khi Tiên tri bị loại."],
  phu_thuy: ["Phù thủy", "Có một bình cứu và một bình độc cho cả ván."],
  tho_san: ["Thợ săn", "Ghim một người để người đó bị loại theo nếu bạn chết."],
  than_tinh_yeu: ["Thần Tình Yêu", "Ghép hai người thành phe Tình Nhân."],
};
const factions = { dan: "Dân", soi: "Sói", tinh_nhan: "Tình Nhân" };
const actionCopy = {
  pair: ["Ghép hai người", "Hai người được chọn biết vai của nhau và chuyển sang phe Tình Nhân."],
  protect: ["Bảo vệ người này", "Chặn cú cắn của Sói lên mục tiêu trong đêm nay. Bình độc vẫn có tác dụng."],
  inspect: ["Soi người này", "Kết quả soi chỉ hiện cho bạn sau khi chốt lượt."],
  save: ["Dùng bình cứu", "Cứu một người sắp bị loại vì cú cắn. Mỗi ván có một bình cứu."],
  poison: ["Dùng bình độc", "Loại mục tiêu khi chốt đêm, kể cả khi họ đang được Bảo vệ."],
  mark: ["Ghim mục tiêu", "Người bị ghim chỉ bị loại theo nếu Thợ săn chết."],
};
const timerFields = {
  discussion_seconds: "discussion-seconds",
  vote_seconds: "vote-seconds",
  night_seconds: "night-seconds",
};
const rejections = {
  action_not_allowed: "Lượt này đã đổi hoặc thao tác chưa được phép.",
  invalid_target: "Mục tiêu này không còn hợp lệ.",
  invalid_action: "Thao tác không hợp lệ.",
  invalid_text: "Tin nhắn cần từ 1 đến 200 ký tự.",
};

let socket;
let retry;
let room = null;
let display = "home";
let match = null;
let lobby = null;
let chatChannel = "public";
let actionSignature = "";
let chatSignature = "";
let awaitingAction = false;
let pendingActionText = "";
let timerSignature = "";
let savingTimers = false;
let session = loadSession(sessionStorage);
let rejoining = false;

function loadSession(storage) {
  try {
    const value = JSON.parse(storage.getItem(sessionKey));
    return typeof value?.code === "string" && typeof value?.token === "string" ? value : null;
  } catch {
    return null;
  }
}

function storeSession(value, { keepRecent = false } = {}) {
  const previous = session;
  session = value;
  try {
    if (value) {
      const serialized = JSON.stringify(value);
      sessionStorage.setItem(sessionKey, serialized);
      localStorage.setItem(sessionKey, serialized);
    } else {
      sessionStorage.removeItem(sessionKey);
      if (!keepRecent && loadSession(localStorage)?.token === previous?.token) localStorage.removeItem(sessionKey);
    }
  } catch {
    // The current connection still works if storage is blocked.
  }
  updateResume();
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function notice(text = "", tone = "info") {
  const box = $("notice");
  box.textContent = text;
  box.dataset.tone = tone;
  box.hidden = !text;
}

function showScreen(screen) {
  if (display === screen) return;
  for (const name of screens) $(name).hidden = name !== screen;
  display = screen;
  const title = $(screen).querySelector("h1");
  title.tabIndex = -1;
  title.focus({ preventScroll: true });
}

function updateResume() {
  const stored = loadSession(localStorage);
  $("resume").hidden = !stored || Boolean(session);
  $("resume").textContent = stored ? "Vào lại phòng " + stored.code : "";
}

function connection(status) {
  const indicator = $("connection");
  indicator.dataset.status = status;
  indicator.textContent = {
    waiting: "Đang kết nối",
    online: "Đã kết nối",
    offline: "Mất kết nối",
  }[status];
  for (const button of document.querySelectorAll("[data-connection]")) button.disabled = status !== "online";
  if (display === "game" && match) renderActionsAndChat();
  if (lobby && display === "lobby") {
    $("lobby-seats").disabled = status !== "online";
    updateTimerControls();
  }
}

function online() {
  return socket?.readyState === WebSocket.OPEN;
}

function send(type, fields = {}) {
  if (!online()) {
    notice("Mất kết nối với máy chủ. Hãy thử lại khi đã kết nối.", "error");
    connect();
    return false;
  }
  socket.send(JSON.stringify({ type, ...fields }));
  return true;
}

function connect({ preserveNotice = false } = {}) {
  if (socket && socket.readyState < WebSocket.CLOSING) return;
  clearTimeout(retry);
  connection("waiting");
  let ws;
  try {
    ws = new WebSocket(endpoint);
  } catch {
    connection("offline");
    notice("Địa chỉ máy chủ không hợp lệ. Kiểm tra VITE_WS_URL.", "error");
    return;
  }
  socket = ws;
  ws.addEventListener("open", () => {
    if (ws !== socket) return;
    if (!preserveNotice) notice();
    connection("online");
    if (session) {
      rejoining = true;
      send("rejoin", session);
    }
  });
  ws.addEventListener("close", () => {
    if (ws !== socket) return;
    awaitingAction = false;
    savingTimers = false;
    connection("offline");
    retry = setTimeout(connect, 1500);
  });
  ws.addEventListener("message", (event) => {
    if (ws === socket) receive(JSON.parse(event.data));
  });
}

function receive(message) {
  switch (message.type) {
    case "joined":
      room = message.code;
      storeSession({ code: message.code, token: message.token });
      rejoining = false;
      notice();
      break;
    case "lobby":
      lobby = message;
      renderLobby();
      break;
    case "state": {
      const phaseChanged = match?.phase_id !== message.phase_id;
      if (phaseChanged) awaitingAction = false;
      if (match?.view.round !== message.view.round || match?.view.phase === "finished") {
        $("action-status").textContent = "";
      }
      match = message;
      if (message.view.phase === "finished") {
        renderResult();
      } else {
        renderGame();
      }
      break;
    }
    case "action_result":
      awaitingAction = false;
      $("action-status").textContent = message.accepted
        ? pendingActionText || "Máy chủ đã ghi nhận thao tác."
        : rejections[message.reason] || "Máy chủ chưa ghi nhận thao tác.";
      renderActionsAndChat();
      break;
    case "error":
      if (message.code === "session_replaced") {
        const previous = socket;
        socket = null;
        resetRoom({ keepRecent: true });
        previous?.close();
        notice(message.message, "error");
        connect({ preserveNotice: true });
        break;
      }
      if (message.code === "game_error") {
        if (room && online()) send("leave");
        resetRoom();
        notice(message.message || "Ván đã dừng. Bạn đã trở về sảnh.", "error");
        break;
      }
      if (savingTimers) {
        savingTimers = false;
        updateTimerControls();
      }
      if (rejoining && ["bad_token", "room_not_found"].includes(message.code)) {
        resetRoom();
      }
      rejoining = false;
      notice(message.message || "Yêu cầu chưa được xử lý.", "error");
      break;
  }
}

function showEntryMode(join) {
  $("show-create").setAttribute("aria-pressed", String(!join));
  $("show-join").setAttribute("aria-pressed", String(join));
  $("create-form").hidden = join;
  $("join-form").hidden = !join;
}

function getName() {
  const name = $("player-name").value.trim();
  if (!name) {
    notice("Nhập tên hiển thị để vào phòng.", "error");
    $("player-name").focus();
  }
  return name;
}

function addSeatOptions(select) {
  for (let n = 4; n <= 20; n += 1) {
    const option = element("option", String(n));
    option.value = n;
    select.appendChild(option);
  }
}

function timerValues() {
  return Object.fromEntries(Object.entries(timerFields).map(([key, id]) => [key, $(id).valueAsNumber]));
}

function renderTimers() {
  const saved = lobby?.timers;
  const form = $("timer-settings");
  const summary = $("timer-summary");
  form.hidden = !saved || !lobby.can_start;
  summary.parentElement.hidden = !saved;
  if (!saved) return;
  const signature = JSON.stringify(saved);
  if (signature !== timerSignature) {
    timerSignature = signature;
    savingTimers = false;
    for (const [key, id] of Object.entries(timerFields)) $(id).value = saved[key];
  }
  summary.textContent = "Thảo luận " + saved.discussion_seconds + " giây · Bỏ phiếu " +
    saved.vote_seconds + " giây · Mỗi lượt đêm " + saved.night_seconds + " giây";
  updateTimerControls();
}

function updateTimerControls() {
  if (!lobby?.timers || !lobby.can_start) return;
  const current = timerValues();
  const dirty = Object.keys(timerFields).some((key) => current[key] !== lobby.timers[key]);
  const status = $("timer-status");
  $("save-timers").disabled = !online() || savingTimers || !dirty;
  $("start").disabled = !online() || savingTimers || dirty;
  for (const id of Object.values(timerFields)) $(id).disabled = !online() || savingTimers;
  status.hidden = !dirty && !savingTimers;
  status.textContent = savingTimers ? "Đang lưu…" : "Bấm Lưu thời gian trước khi bắt đầu.";
}

function renderLobby() {
  $("room-code").textContent = lobby.code;
  $("seat-count").textContent = "(" + lobby.members.length + "/" + lobby.seats + ")";
  $("members").replaceChildren(...lobby.members.map((person) => {
    const row = element("li");
    const status = [person.is_host ? "Chủ phòng" : "", person.connected ? "" : "Đã ngắt kết nối"]
      .filter(Boolean).join(" · ");
    row.append(element("strong", person.name), element("span", status, "small muted"));
    return row;
  }));
  $("lobby-seats").value = lobby.seats;
  $("lobby-seats").hidden = !lobby.can_start;
  $("lobby-seat-label").hidden = !lobby.can_start;
  $("lobby-seats").disabled = !online();
  $("bot-count").textContent = lobby.bots_on_start
    ? lobby.bots_on_start + " NPC sẽ vào khi bắt đầu."
    : "Phòng đã đủ người.";
  $("start").hidden = !lobby.can_start;
  renderTimers();
  showScreen("lobby");
}

function nameOf(playerId) {
  return match.names[playerId] || playerId;
}

function roleName(role) {
  return roles[role]?.[0] || role;
}

function playerCard(player, revealed = false) {
  const card = element("li", undefined, "player-card");
  card.dataset.alive = String(player.alive);
  card.dataset.self = String(player.player_id === match.me);
  card.append(element("strong", nameOf(player.player_id)));
  const parts = [player.player_id === match.me ? "Bạn" : "", player.alive ? "Còn trong ván" : "Đã bị loại"];
  if (revealed) parts.unshift(roleName(player.role), factions[player.faction] || player.faction);
  card.append(element("span", parts.filter(Boolean).join(" · "), "small muted"));
  return card;
}

function renderGame() {
  const view = match.view;
  const night = view.phase.startsWith("night");
  $("game").dataset.night = String(night);
  $("round-label").textContent = "Phòng " + match.code + " · Vòng " + view.round;
  $("phase-label").textContent = night ? "Đêm xuống" :
    { pair: "Chuẩn bị ván", day_discussion: "Thảo luận", day_vote: "Bỏ phiếu" }[view.phase] || "Đang chơi";
  $("round-news").textContent = view.phase.startsWith("day_")
    ? view.last_deaths.length
      ? "Đêm qua: " + view.last_deaths.map(nameOf).join(", ") + " bị loại."
      : "Đêm qua không ai bị loại."
    : "";
  $("table-players").replaceChildren(...view.players.map((player) => playerCard(player)));
  $("player-role").textContent = roleName(view.role);
  $("role-detail").textContent = "Phe " + (factions[view.faction] || view.faction) + ". " + (roles[view.role]?.[1] || "");
  const info = [];
  if (view.wolf_peers?.length) info.push("Đồng đội Sói: " + view.wolf_peers.map(nameOf).join(", "));
  if (view.phase === "night_wolf" && view.wolf_votes) {
    const votes = Object.entries(view.wolf_votes).map(([voter, target]) => nameOf(voter) + " → " + nameOf(target));
    info.push("Phiếu cắn: " + (votes.join(", ") || "chưa có phiếu"));
  }
  if (view.strikes_remaining > 1) info.push("Còn " + view.strikes_remaining + " lượt cắn đêm nay");
  if (view.partner) info.push("Tình Nhân: " + nameOf(view.partner.player_id) + " (" + roleName(view.partner.role) + ")");
  if (view.inspections?.length) {
    info.push("Đã soi: " + view.inspections.map((item) =>
      nameOf(item.target_id) + (item.is_wolf ? " là Sói" : " không phải Sói")).join(", "));
  }
  $("private-info").textContent = info.join(" · ");
  $("private-info").hidden = !info.length;
  showScreen("game");
  updateClock();
  renderActionsAndChat();
}

function updateClock() {
  if (display !== "game" || !match) return;
  const seconds = Math.max(0, Math.ceil((match.deadline - Date.now()) / 1000));
  $("timer").textContent = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}

function submitAction(action, confirmation = "Đã gửi tin nhắn.") {
  if (!match || awaitingAction) return false;
  if (!send("action", { phase_id: match.phase_id, action })) return false;
  pendingActionText = confirmation;
  $("action-status").textContent = "Đang gửi…";
  awaitingAction = true;
  renderActionsAndChat();
  return true;
}

function targetSelect(targets, id) {
  const select = element("select");
  select.id = id;
  select.required = true;
  const empty = element("option", "Chọn người chơi");
  empty.value = "";
  select.appendChild(empty);
  for (const target of targets) {
    const option = element("option", nameOf(target));
    option.value = target;
    select.appendChild(option);
  }
  return select;
}

function actionDescription(kind) {
  if (kind !== "vote") return actionCopy[kind];
  if (match.view.phase === "night_wolf") {
    return ["Vote cắn", "Chọn một người để cả đàn vote cắn. Khi hòa phiếu cao nhất, server chọn ngẫu nhiên trong nhóm hòa."];
  }
  return ["Bỏ phiếu loại", "Chọn người bạn muốn loại khỏi ván. Hòa phiếu cao nhất thì không ai bị loại."];
}

function actionGuide(view, actions) {
  const me = view.players.find((player) => player.player_id === match.me);
  if (!me?.alive) return "Bạn đã bị loại. Bạn vẫn có thể theo dõi đến hết ván.";
  if (actions.some((action) => action.type === "vote")) {
    return view.phase === "night_wolf"
      ? "Đến lượt phe Sói. Kết quả cú cắn sẽ được xử lý sau khi các vai khác hành động."
      : "Đã hết giờ bàn bạc. Chọn mục tiêu và xác nhận phiếu trước khi hết giờ.";
  }
  if (actions.length) return "Chọn mục tiêu bên dưới rồi bấm nút kỹ năng. Mỗi kỹ năng chỉ hiện ở đúng lượt.";
  if (view.phase === "day_discussion") return "Bàn bạc trong chat chung hoặc chat riêng. Lượt bỏ phiếu sẽ mở khi hết giờ.";
  return "Chưa đến lượt của bạn. Đồng hồ đang đếm đến sáng, trừ khi đến lượt kỹ năng của bạn.";
}

function actionForm(option) {
  const form = element("form");
  const [name, description] = actionDescription(option.type);
  form.appendChild(element("p", description, "muted small"));
  const count = option.target_count || 1;
  const targets = [];
  for (let index = 0; index < count; index += 1) {
    const id = "target-" + option.type + "-" + index;
    const label = element("label", count === 1 ? "Mục tiêu" : "Người thứ " + (index + 1));
    label.htmlFor = id;
    const select = targetSelect(option.target_ids, id);
    targets.push(select);
    form.append(label, select);
  }
  const button = element("button", name, "primary");
  button.type = "submit";
  form.appendChild(button);
  form.addEventListener("change", () => targets.at(-1).setCustomValidity(""));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const selected = targets.map((select) => select.value);
    if (new Set(selected).size !== selected.length) {
      targets.at(-1).setCustomValidity("Hãy chọn hai người khác nhau.");
      targets.at(-1).reportValidity();
      return;
    }
    const toSend = count === 1 ? { target_id: selected[0] } : { target_ids: selected };
    const names = selected.map(nameOf).join(" và ");
    submitAction({ type: option.type, ...toSend }, "Đã ghi nhận: " + name + " — " + names + ".");
  });
  return form;
}

function renderActionsAndChat() {
  if (display !== "game" || !match) return;
  const options = match.view.allowed_actions;
  const targetActions = options.filter((action) =>
    (action.type === "vote" || Object.hasOwn(actionCopy, action.type)) && action.target_ids?.length
  );
  $("turn-panel").dataset.active = String(Boolean(targetActions.length));
  $("turn-title").textContent = targetActions.length === 1 ? actionDescription(targetActions[0].type)[0]
    : targetActions.length > 1 ? "Chọn kỹ năng" : "Lượt của bạn";
  $("phase-guide").textContent = actionGuide(match.view, targetActions);
  const signature = JSON.stringify([match.phase_id, targetActions]);
  const container = $("action-list");
  if (signature !== actionSignature) {
    actionSignature = signature;
    container.replaceChildren(...targetActions.map(actionForm));
  }
  for (const button of container.querySelectorAll("button")) button.disabled = !online() || awaitingAction;
  renderChat();
}

function renderChat() {
  const view = match.view;
  const isPrivate = chatChannel === "private";
  const chatPeer = $("chat-peer");
  $("public-tab").setAttribute("aria-pressed", String(!isPrivate));
  $("private-tab").setAttribute("aria-pressed", String(isPrivate));
  $("peer-label").hidden = chatPeer.hidden = !isPrivate;
  const peerIds = view.players.map((p) => p.player_id).filter((playerId) => playerId !== match.me);
  const peerSignature = peerIds.join(",");
  if (chatPeer.dataset.ids !== peerSignature) {
    const previous = chatPeer.value;
    const choices = targetSelect(peerIds, "unused");
    choices.options[0].textContent = "Chọn người để nhắn";
    chatPeer.replaceChildren(...choices.options);
    if (peerIds.includes(previous)) chatPeer.value = previous;
    chatPeer.dataset.ids = peerSignature;
  }
  const peer = chatPeer.value;
  const messages = isPrivate
    ? view.private_chat.filter((entry) => peer && [entry.player_id, entry.target_id].includes(peer))
    : view.public_chat;
  const signature = JSON.stringify([chatChannel, peer, messages]);
  if (signature !== chatSignature) {
    chatSignature = signature;
    const log = $("chat-log");
    const rows = messages.map((entry) => {
      const row = element("li");
      row.append(element("strong", nameOf(entry.player_id)), document.createTextNode(": " + entry.text));
      return row;
    });
    if (!rows.length) rows.push(element("li", isPrivate && !peer ? "Chọn người để xem tin nhắn riêng." : "Chưa có tin nhắn.", "muted"));
    log.replaceChildren(...rows);
    log.scrollTop = log.scrollHeight;
  }
  const kind = isPrivate ? "whisper" : "chat";
  const option = view.allowed_actions.find((action) => action.type === kind);
  const enabled = Boolean(option && online() && (!isPrivate || option.target_ids.includes(peer)));
  $("chat-input").disabled = !enabled;
  $("chat-form").querySelector("button").disabled = !enabled || awaitingAction;
  $("chat-status").textContent = !option ? "Chat mở trong pha thảo luận."
    : isPrivate && !enabled ? "Chọn một người đang trong ván để nhắn." : "";
}

function renderResult() {
  $("winner").textContent = match.view.winner === "hoa" ? "Ván hòa" :
    "Phe " + (factions[match.view.winner] || match.view.winner) + " thắng";
  $("restart").hidden = !match.is_host;
  $("reveal").replaceChildren(...(match.reveal || []).map((player) => playerCard(player, true)));
  showScreen("result");
}

function resetRoom({ keepRecent = false } = {}) {
  storeSession(null, { keepRecent });
  match = room = lobby = null;
  awaitingAction = rejoining = false;
  chatChannel = "public";
  actionSignature = chatSignature = timerSignature = pendingActionText = "";
  savingTimers = false;
  $("notice").hidden = true;
  $("action-status").textContent = $("chat-input").value = "";
  showScreen("home");
}

addSeatOptions($("seats"));
addSeatOptions($("lobby-seats"));
$("seats").value = 6;
$("show-create").addEventListener("click", () => showEntryMode(false));
$("show-join").addEventListener("click", () => showEntryMode(true));
$("create-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = getName();
  if (name) send("create_room", { name, seats: Number($("seats").value) });
});
$("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = getName();
  const code = $("room-input").value.trim().toUpperCase();
  if (!name) return;
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    notice("Mã phòng cần đúng 4 ký tự.", "error");
    return;
  }
  send("join_room", { name, code });
});
$("resume").addEventListener("click", () => {
  const saved = loadSession(localStorage);
  if (!saved) return;
  storeSession(saved);
  rejoining = send("rejoin", saved);
});
$("lobby-seats").addEventListener("change", () => send("set_seats", { seats: Number($("lobby-seats").value) }));
$("timer-settings").addEventListener("input", updateTimerControls);
$("timer-settings").addEventListener("submit", (event) => {
  event.preventDefault();
  if (send("set_timers", { timers: timerValues() })) {
    savingTimers = true;
    updateTimerControls();
  }
});
$("start").addEventListener("click", () => send("start"));
$("restart").addEventListener("click", () => send("restart"));
$("copy-code").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(room);
    notice("Đã sao chép mã phòng " + room + ".");
  } catch {
    notice("Mã phòng của bạn: " + room + ".");
  }
});
for (const button of document.querySelectorAll(".leave")) {
  button.addEventListener("click", () => {
    if (online()) send("leave");
    resetRoom();
  });
}
$("public-tab").addEventListener("click", () => { chatChannel = "public"; renderChat(); });
$("private-tab").addEventListener("click", () => { chatChannel = "private"; renderChat(); });
$("chat-peer").addEventListener("change", renderChat);
$("chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("chat-input");
  const text = input.value.trim();
  if (!text) return;
  const action = chatChannel === "private"
    ? { type: "whisper", target_id: $("chat-peer").value, text }
    : { type: "chat", text };
  if (submitAction(action)) input.value = "";
});

updateResume();
connect();
setInterval(updateClock, 250);
