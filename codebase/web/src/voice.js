// Audio-only mesh. Group membership is coordinated by the inviting player.
export function createVoice({ send, onChange }) {
  let state = null;
  let enabled = false;
  let wanted = false;
  let mic = null;
  let requesting = null;
  let generation = 0;
  let micError = "";
  let error = "";
  let context = null;
  let meterTimer = null;
  let group = null;
  let hosting = null;
  const invitations = new Map();
  const peers = new Map();
  const meters = new Map();
  const speaking = new Set();
  const blocked = new Set();
  let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
  try {
    const configured = JSON.parse(import.meta.env.VITE_ICE_SERVERS || "null");
    if (Array.isArray(configured)) iceServers = configured;
  } catch { /* Invalid optional configuration: use public STUN. */ }

  const me = () => state?.me;
  const canSpeak = () => enabled && Boolean(state?.voice?.can_speak);
  const connected = (id) => state?.voice?.peers?.includes(id);
  const alive = (id) => state?.view?.players?.some((p) => p.player_id === id && p.alive);
  const groupAllowed = () => enabled && state?.view?.phase === "day_discussion" && alive(me());
  const validMember = (id) => typeof id === "string" && alive(id) && (id === me() || connected(id));

  function emit() {
    onChange({ enabled, micOn: wanted, canSpeak: canSpeak(), hasMic: Boolean(mic),
      micPending: Boolean(requesting), micError, error, playbackBlocked: blocked.size > 0,
      speaking: [...speaking], peers: enabled ? [me(), ...(state?.voice?.peers || [])] : [],
      group: group ? { ...group, members: [...group.members] } : null,
      hosting: Boolean(hosting), invitations: [...invitations.values()], groupAllowed: groupAllowed() });
  }

  function signal(to, data) {
    if (!enabled || !connected(to)) return false;
    const message = { to, data };
    // Keep both the server's 6000-character data limit and the 8192-byte WS limit.
    if (JSON.stringify(data).length > 6000 || new TextEncoder().encode(JSON.stringify({ type: "rtc_signal", ...message })).length > 8192) {
      error = "Tín hiệu voice quá lớn. Hãy thử cấu hình ICE khác.";
      emit();
      return false;
    }
    return send("rtc_signal", message);
  }

  function unmeter(id) {
    const meter = meters.get(id);
    meter?.source.disconnect();
    meter?.analyser.disconnect();
    meters.delete(id);
    speaking.delete(id);
  }

  function meter(id, stream) {
    unmeter(id);
    if (!context || !stream.getAudioTracks().length) return;
    try {
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser); // Never connect the microphone to the speakers.
      meters.set(id, { source, analyser, samples: new Uint8Array(analyser.fftSize), until: 0 });
    } catch { /* Voice works even if level metering is unavailable. */ }
  }

  function startMeters() {
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      try { context = new AudioContext(); } catch { return; }
      if (mic) meter(me(), mic);
      for (const [id, peer] of peers) if (peer.audio.srcObject) meter(id, peer.audio.srcObject);
      meterTimer = setInterval(() => {
        let changed = false;
        for (const [id, item] of meters) {
          item.analyser.getByteTimeDomainData(item.samples);
          const rms = Math.sqrt(item.samples.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) / item.samples.length);
          if (rms > 0.025) item.until = Date.now() + 220;
          const active = item.until > Date.now() && (id !== me() || (wanted && canSpeak() && Boolean(mic)));
          if (active !== speaking.has(id)) {
            changed = true;
            if (active) speaking.add(id); else speaking.delete(id);
          }
        }
        if (changed) emit();
      }, 100);
    }
    context.resume().catch(() => {});
  }

  function play(id, peer) {
    const token = generation;
    peer.audio.play().then(() => {
      if (token !== generation || peers.get(id) !== peer) return;
      if (blocked.delete(id)) emit();
    }).catch(() => {
      if (token !== generation || peers.get(id) !== peer) return;
      if (!blocked.has(id)) { blocked.add(id); emit(); }
    });
  }

  function enableAudio() {
    startMeters();
    for (const [id, peer] of peers) if (peer.audio.srcObject) play(id, peer);
  }

  function drop(id) {
    const peer = peers.get(id);
    if (!peer) return;
    peers.delete(id);
    peer.pc.close();
    peer.audio.pause();
    peer.audio.srcObject = null;
    peer.audio.remove();
    blocked.delete(id);
    unmeter(id);
  }

  // Rebuild a dropped pair shortly; the lower id offers again, the other waits for it.
  function redial(id) {
    const token = generation;
    setTimeout(() => {
      if (token === generation && enabled && connected(id) && !peers.has(id)) { createPeer(id); route(); }
    }, 1000);
  }

  function fail(id, peer) {
    if (peers.get(id) !== peer) return;
    drop(id);
    signal(id, { kind: "hangup" }); // The other side must drop too, or it rejects the new offer.
    error = "Một kết nối voice bị gián đoạn; đang thử nối lại.";
    emit();
    redial(id);
  }

  function enqueue(id, peer, operation) {
    peer.queue = peer.queue.then(async () => {
      if (peers.get(id) === peer) await operation();
    }).catch(() => fail(id, peer));
    return peer.queue;
  }

  const micTrack = () => (wanted && canSpeak() ? mic?.getAudioTracks()[0] || null : null);
  const trackFor = (id) => (!group || group.members.includes(id) ? micTrack() : null);

  function route() {
    const track = micTrack();
    for (const t of mic?.getAudioTracks() || []) t.enabled = Boolean(track);
    for (const [id, peer] of peers) {
      peer.audio.volume = group && !group.members.includes(id) ? 0.3 : 1;
      // Read the track when the queued step runs, so it follows the latest mic/group state.
      enqueue(id, peer, () => peer.sender?.replaceTrack(trackFor(id)));
    }
    if (!track) speaking.delete(me());
  }

  function createPeer(id) {
    try {
      const pc = new RTCPeerConnection({ iceServers });
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.hidden = true;
      audio.setAttribute("playsinline", "");
      document.body.appendChild(audio);
      // Only the offerer adds the audio slot (sendrecv, so both hear even without a mic).
      // The answerer reuses the transceiver the offer creates: one it added itself would
      // never be matched to the offer's m-line and its voice would not be sent.
      const transceiver = me() < id ? pc.addTransceiver("audio", { direction: "sendrecv" }) : null;
      const peer = { pc, audio, sender: transceiver?.sender || null, queue: Promise.resolve(), ice: [] };
      peers.set(id, peer);
      pc.onicecandidate = ({ candidate }) => {
        if (peers.get(id) === peer) signal(id, { kind: "ice", candidate: candidate?.toJSON() || null });
      };
      pc.ontrack = ({ track, streams }) => {
        if (peers.get(id) !== peer) return;
        const stream = streams[0] || new MediaStream([track]);
        audio.srcObject = stream;
        audio.volume = group && !group.members.includes(id) ? 0.3 : 1;
        meter(id, stream);
        play(id, peer);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") fail(id, peer);
      };
      if (me() < id) enqueue(id, peer, async () => {
        await pc.setLocalDescription(await pc.createOffer());
        if (peers.get(id) === peer) signal(id, { kind: "offer", sdp: pc.localDescription.sdp });
      });
      return peer;
    } catch {
      error = "Trình duyệt không hỗ trợ kết nối voice.";
      return null;
    }
  }

  async function acquireMic() {
    if (mic || requesting || !wanted || !canSpeak()) return;
    const token = generation;
    const task = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (token !== generation || !enabled || !wanted) { stream.getTracks().forEach((t) => t.stop()); return; }
        mic = stream;
        micError = "";
        mic.getAudioTracks()[0].onended = () => {
          if (mic !== stream) return;
          mic = null;
          unmeter(me());
          micError = "Không có mic: thiết bị đã ngắt. Bấm mic để thử lại.";
          route(); emit();
        };
        meter(me(), mic);
        route();
      } catch {
        if (token === generation) micError = "Không có mic hoặc chưa được cấp quyền. Bạn vẫn nghe được; cần HTTPS hoặc localhost để bật mic.";
      } finally {
        if (token === generation) { requesting = null; emit(); }
      }
    })();
    requesting = task;
    emit();
    await task;
    // Also handles getUserMedia being absent and throwing synchronously above.
    if (requesting === task) { requesting = null; emit(); }
  }

  function publishGroup() {
    if (!group || group.owner !== me()) return;
    for (const id of group.members) if (id !== me()) signal(id, { kind: "group_invite", group_id: group.id, members: group.members });
  }

  function leaveGroup() {
    const current = group || (hosting && { id: hosting.id, owner: me(), members: hosting.invited });
    if (current) {
      const targets = current.owner === me() ? new Set([...current.members, ...(hosting?.invited || [])]) : [current.owner];
      for (const id of targets) if (id !== me()) signal(id, { kind: "group_leave", group_id: current.id });
    }
    group = hosting = null;
    route(); emit();
  }

  function inviteGroup(ids) {
    enableAudio();
    const invited = [...new Set(ids)].filter((id) => id !== me() && validMember(id));
    if (!groupAllowed() || group || hosting || invited.length < 1 || invited.length > 3) return;
    for (const invitation of invitations.values()) signal(invitation.owner, { kind: "group_decline", group_id: invitation.id });
    invitations.clear();
    const id = me() + "-" + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36));
    hosting = { id, invited };
    for (const target of invited) signal(target, { kind: "group_invite", group_id: id, members: [me(), ...invited] });
    emit();
  }

  function declineGroup(id) {
    const invitation = invitations.get(id);
    if (!invitation) return;
    signal(invitation.owner, { kind: "group_decline", group_id: id });
    invitations.delete(id); emit();
  }

  function acceptGroup(id) {
    enableAudio();
    const invitation = invitations.get(id);
    if (!invitation || !groupAllowed() || group || hosting || !invitation.members.every(validMember)) return;
    if (!signal(invitation.owner, { kind: "group_accept", group_id: id })) return;
    // The host and this player form the first pair; host confirms the full accepted list.
    group = { id, owner: invitation.owner, members: [invitation.owner, me()] };
    for (const other of [...invitations.keys()]) if (other !== id) declineGroup(other);
    invitations.clear();
    route(); emit();
  }

  function handleGroup(from, data) {
    const id = data.group_id;
    if (typeof id !== "string" || !id || id.length > 200) return;
    if (data.kind === "group_leave") {
      if (invitations.get(id)?.owner === from) invitations.delete(id);
      if (group?.id === id && group.members.includes(from)) {
        if (group.owner === from) { group = hosting = null; }
        else if (group.owner === me()) {
          group.members = group.members.filter((member) => member !== from);
          if (group.members.length < 2) group = null;
          else publishGroup();
        }
      }
      if (hosting?.id === id) {
        hosting.invited = hosting.invited.filter((member) => member !== from);
        if (!hosting.invited.length) hosting = null;
      }
    } else if (data.kind === "group_invite") {
      const members = data.members;
      if (!groupAllowed() || !Array.isArray(members) || members.length < 2 || members.length > 4 ||
          new Set(members).size !== members.length || members[0] !== from || !members.includes(me()) || !members.every(validMember)) return;
      if (group?.id === id && group.owner === from) group.members = [...members];
      else if (group || hosting) signal(from, { kind: "group_decline", group_id: id });
      else invitations.set(id, { id, owner: from, members: [...members] });
    } else if (data.kind === "group_accept") {
      if (!groupAllowed() || hosting?.id !== id || !hosting.invited.includes(from) || !validMember(from)) return;
      if (!group) group = { id, owner: me(), members: [me()] };
      if (group.id !== id || group.owner !== me()) return;
      if (!group.members.includes(from) && group.members.length < 4) group.members.push(from);
      publishGroup();
    } else if (data.kind === "group_decline" && hosting?.id === id) {
      hosting.invited = hosting.invited.filter((member) => member !== from);
      if (!hosting.invited.length) hosting = null;
    }
    route(); emit();
  }

  function handleSignal(msg) {
    const { from, data } = msg;
    if (!enabled || !connected(from) || !data || typeof data !== "object") return;
    if (data.kind?.startsWith("group_")) { handleGroup(from, data); return; }
    if (data.kind === "hangup") { if (peers.has(from)) { drop(from); emit(); redial(from); } return; }
    if (!["offer", "answer", "ice"].includes(data.kind)) return;
    const peer = peers.get(from) || createPeer(from);
    if (!peer) return;
    enqueue(from, peer, async () => {
      const pc = peer.pc;
      if (data.kind === "ice") {
        if (!data.candidate) return; // End-of-candidates: nothing to add.
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else peer.ice.push(data.candidate);
        return;
      }
      if (typeof data.sdp !== "string" || (data.kind === "offer" ? from >= me() : from <= me())) return;
      await pc.setRemoteDescription({ type: data.kind, sdp: data.sdp });
      for (const candidate of peer.ice.splice(0)) await pc.addIceCandidate(candidate);
      if (data.kind === "offer") {
        const transceiver = pc.getTransceivers()[0];
        if (transceiver) {
          transceiver.direction = "sendrecv";
          peer.sender = transceiver.sender;
          await peer.sender.replaceTrack(trackFor(from));
        }
        await pc.setLocalDescription(await pc.createAnswer());
        if (peers.get(from) === peer) signal(from, { kind: "answer", sdp: pc.localDescription.sdp });
      }
    });
    route();
  }

  function update(next) {
    if (state && state.me !== next.me) close();
    state = next;
    if (!next.voice?.enabled) { close(); return; }
    enabled = true;
    if ((group || hosting) && (!groupAllowed() || (group && !group.members.every(validMember)) || (hosting && !hosting.invited.every(validMember)))) leaveGroup();
    for (const [id, invitation] of invitations) {
      if (!groupAllowed() || !invitation.members.every(validMember)) invitations.delete(id);
    }
    for (const id of peers.keys()) if (!connected(id)) drop(id);
    for (const id of next.voice.peers || []) if (id !== me() && !peers.has(id)) createPeer(id);
    route();
    if (wanted && canSpeak() && !micError) acquireMic();
    emit();
  }

  function toggleMic() {
    if (!enabled) return;
    enableAudio();
    // After denial/device removal, the next click retries instead of only switching off.
    wanted = micError ? true : !wanted;
    micError = "";
    route();
    if (wanted) acquireMic();
    emit();
  }

  function close() {
    generation += 1;
    enabled = wanted = false;
    group = hosting = null;
    invitations.clear();
    for (const id of [...peers.keys()]) drop(id);
    for (const track of mic?.getTracks() || []) track.stop();
    mic = requesting = null;
    for (const id of [...meters.keys()]) unmeter(id);
    clearInterval(meterTimer);
    meterTimer = null;
    context?.close().catch(() => {});
    context = null;
    speaking.clear(); blocked.clear();
    micError = error = "";
    state = null;
    emit();
  }

  return { update, handleSignal, toggleMic, inviteGroup, acceptGroup, declineGroup, leaveGroup, close, enableAudio };
}
