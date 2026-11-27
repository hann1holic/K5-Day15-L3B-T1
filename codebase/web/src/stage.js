// Sân làng: mọi người đứng quanh đống lửa, vẽ từ `state` của server.
// Hình nhân vật hiện là ô màu tạm. Khi chọn xong bộ hình, chỉ cần đổi phần .avatar.

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function renderStage(container, { view, names, me }) {
  const wolves = view.wolf_peers ?? [];
  const votes = Object.values(view.wolf_votes ?? {});
  const seats = view.players.map((player, index) => {
    // Xếp theo hình elip, ghế đầu ở trên cùng.
    const angle = (index / view.players.length) * 2 * Math.PI - Math.PI / 2;
    const seat = node("li", "seat");
    seat.dataset.alive = String(player.alive);
    seat.dataset.self = String(player.player_id === me);
    seat.style.left = 50 + 39 * Math.cos(angle) + "%";
    seat.style.top = 50 + 38 * Math.sin(angle) + "%";
    // Mọi người chung một kiểu nhân vật, chỉ khác màu.
    seat.style.setProperty("--hue", String(Math.round((index * 360) / view.players.length)));

    const name = names[player.player_id] ?? player.player_id;
    const voteCount = votes.filter((target) => target === player.player_id).length;
    const marks = [
      wolves.includes(player.player_id) ? "🐺" : "",
      view.partner?.player_id === player.player_id ? "💘" : "",
      voteCount ? "🎯" + voteCount : "",
    ].join("");

    const avatar = node("span", "avatar", player.alive ? "" : "🪦");
    avatar.setAttribute("aria-hidden", "true");
    seat.append(avatar, node("strong", "seat-name", name));
    if (player.player_id === me) seat.append(node("span", "seat-tag", "Bạn"));
    if (!player.alive) seat.append(node("span", "sr-only", "Đã bị loại"));
    if (marks) seat.append(node("span", "seat-marks", marks));
    return seat;
  });

  const circle = node("ul", "seats");
  // Phòng đông thì thu nhỏ ghế cho khỏi chồng nhau.
  circle.dataset.many = String(view.players.length > 12);
  circle.append(...seats);
  const fire = node("span", "fire", "🔥");
  fire.setAttribute("aria-hidden", "true");
  container.replaceChildren(fire, circle);
}
