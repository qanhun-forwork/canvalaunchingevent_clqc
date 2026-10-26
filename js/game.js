// Minigame runtime for the presenter screen: QR lobby, live buzzer, operator judging, sounds, results.
(() => {
"use strict";
const Q = window.QUESTIONS || [];
const SFX = window.SFX;
const body = document.body;
const slides = [...document.querySelectorAll("#stage .slide")];
const API = "api/game";
const ONLINE = /^https?:$/.test(location.protocol);
const params = new URLSearchParams(location.search);
let KEY = params.get("key") || "";
try { if (KEY) localStorage.setItem("cgKey", KEY); else KEY = localStorage.getItem("cgKey") || ""; } catch (e) {}

const panel = document.getElementById("gpanel");
const pst = panel.querySelector(".gp-st"), phint = panel.querySelector(".gp-hint");
const TROPHY = '<svg class="ic" width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#FFD400" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';

let st = null, offset = 0, bestRtt = 1e9;
let active = null;
let pollT = 0, frameT = 0, inflight = false, fails = 0, auth = true, judging = false, skip = null;
const snow = () => Date.now() + offset;
const $ = (sel, root) => (root || active.s).querySelector(sel);

// ───────── network ─────────
function sync(serverNow, t0, t1) {
  const rtt = t1 - t0;
  bestRtt = Math.min(bestRtt * 1.05 + 5, bestRtt + 50);
  if (rtt <= bestRtt) { bestRtt = rtt; offset = serverNow - (t0 + t1) / 2; }
}
async function post(op, extra = {}) {
  if (!ONLINE) return null;
  const t0 = Date.now();
  try {
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, key: KEY, ...extra }) });
    if (r.status === 401) { auth = false; conn(); return null; }
    const s = await r.json();
    if (s && s.g) { fails = 0; sync(s.now, t0, Date.now()); ingest(s, true); }
    return s;
  } catch (e) { fails++; conn(); return null; }
}
async function poll() {
  if (!active || !ONLINE || inflight) return;
  inflight = true;
  const t0 = Date.now();
  try {
    const u = `${API}?r=host${st && st.key ? "&k=" + encodeURIComponent(st.key) : ""}${KEY ? "&key=" + encodeURIComponent(KEY) : ""}`;
    const r = await fetch(u, { cache: "no-store" });
    const s = await r.json();
    if (s && s.g) { fails = 0; auth = s.auth !== false; sync(s.now, t0, Date.now()); ingest(s); }
    else fails++;
  } catch (e) { fails++; }
  inflight = false;
  conn();
}
function ingest(s, fromPost) {
  if (st && s.now < st.now && !fromPost) return; // stale response
  const prev = st;
  st = s;
  if (!active) return;
  if (active.type === "join") renderJoin(prev);
  else if (active.type === "q") frame();
  else if (active.type === "res") renderRes(false);
  conn();
}
function startLoop() {
  stopLoop();
  poll();
  pollT = setInterval(poll, active.type === "q" ? 400 : active.type === "join" ? 700 : 1500);
  if (active.type === "q") frameT = setInterval(frame, 100);
}
function stopLoop() { clearInterval(pollT); clearInterval(frameT); pollT = frameT = 0; }

function conn() {
  let cls = "ok", txt = "";
  const n = st && st.players ? st.players.length : 0;
  if (!ONLINE) { cls = "bad"; txt = "Ngoại tuyến: mở bằng link Vercel để chơi"; }
  else if (fails > 2) { cls = "bad"; txt = "Mất kết nối máy chủ"; }
  else if (!auth) { cls = "warn"; txt = "Thiếu mã điều khiển (?key=…)"; }
  else if (!st) { cls = ""; txt = "Đang kết nối…"; }
  else if (st.store === "memory" && !/^(localhost|127\.)/.test(location.hostname)) { cls = "warn"; txt = "Chưa kết nối Redis"; }
  else txt = `Đã kết nối · ${n} người chơi`;
  pst.className = "gp-st " + cls;
  pst.lastChild.textContent = txt;
}

// ───────── slide lifecycle ─────────
function onSlide(i) {
  const s = slides[i], type = s && s.dataset.game;
  stopLoop();
  if (active && active.s !== s) leave(active);
  if (!type) { active = null; body.classList.remove("g-on"); return; }
  active = { s, type, qi: +(s.dataset.qi || 0), mode: null, key: null };
  body.classList.add("g-on");
  if (type === "join") { renderQR(); renderJoin(null, true); if (auth) post("lobby"); }
  if (type === "q") {
    s.classList.remove("g-judge");
    $(".g-stamp").classList.remove("show");
    $(".g-fx").innerHTML = "";
    const g = st && st.g;
    const fresh = !(g && g.phase === "q" && g.q === active.qi);
    if (fresh && ONLINE) setTimeout(() => { if (active && active.s === s) SFX.start(); }, 250);
    frame();
    if (auth) post("q", { q: active.qi, n: Q.length, delay: 4400 });
  }
  if (type === "res") { renderRes(true); if (auth) post("end"); }
  hint();
  startLoop();
}
function leave(a) { if (a.type === "q") a.s.classList.remove("g-judge"); }
addEventListener("deck:slide", (e) => onSlide(e.detail.i));

// ───────── lobby ─────────
function renderQR() {
  const box = $(".g-qr"), urlEl = $(".g-url");
  const url = params.get("play") || (ONLINE ? location.origin + "/play" : "");
  if (!url || typeof qrcode !== "function") { box.innerHTML = '<div class="off">Mở bài thuyết trình bằng<br>đường link Vercel<br>để hiện mã QR</div>'; urlEl.textContent = ""; return; }
  if (box.dataset.url === url) return;
  const qr = qrcode(0, "M"); qr.addData(url); qr.make();
  box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true }).replace(/fill="black"/g, 'fill="#17134A"').replace(/fill="#000000"/g, 'fill="#17134A"');
  box.dataset.url = url;
  urlEl.textContent = url.replace(/^https?:\/\//, "");
}
let joinSoundAt = 0;
function renderJoin(prev, snap) {
  const pl = (st && st.players) || [];
  const nEl = $(".g-n"), chips = $(".g-chips");
  const old = +nEl.textContent;
  if (old !== pl.length) {
    nEl.textContent = pl.length;
    if (!snap && pl.length > old) { nEl.classList.remove("bump"); void nEl.offsetWidth; nEl.classList.add("bump"); }
  }
  const show = pl.slice(-16), keep = new Set(show.map((p) => p.pid));
  [...chips.children].forEach((c) => { if (!keep.has(c.dataset.pid)) c.remove(); });
  const have = new Set([...chips.children].map((c) => c.dataset.pid));
  let added = 0;
  show.forEach((p) => {
    if (have.has(p.pid)) return;
    const c = document.createElement("div");
    c.className = "g-chip" + (snap || !prev ? "" : " new");
    c.dataset.pid = p.pid; c.textContent = p.name;
    if (!snap && prev) c.style.animationDelay = added * 90 + "ms";
    chips.appendChild(c); added++;
  });
  if (added && !snap && prev && Date.now() - joinSoundAt > 150) { joinSoundAt = Date.now(); SFX.join(); }
}

// ───────── question ─────────
function view() {
  if (!ONLINE) return { m: "off" };
  if (!st) return { m: "conn" };
  const g = st.g;
  if (g.phase !== "q" || g.q !== active.qi) return { m: "conn" };
  if (g.solved) return g.last && g.last.reveal ? { m: "reveal" } : { m: "right", name: g.last && g.last.name, pick: (g.last && g.last.pick) || Q[active.qi].answer };
  if (st.buzz) return { m: "buzz", name: st.buzz.name };
  const now = snow();
  if (g.last && g.last.ok === false && now < g.openAt) return { m: "wrong", name: g.last.name, pick: g.last.pick };
  if (now < g.openAt) return { m: "wait", left: Math.ceil((g.openAt - now) / 1000) };
  return { m: "open", again: g.out.length > 0 };
}
function names(pids) {
  const map = new Map(((st && st.players) || []).map((p) => [p.pid, p.name]));
  return pids.map((p) => map.get(p) || "?");
}
function applyOpts() {
  const g = st && st.g && st.g.phase === "q" && st.g.q === active.qi ? st.g : null;
  const ans = Q[active.qi].answer;
  const wrong = new Set(g ? g.wrong : []);
  const pend = skip && Date.now() < skip.until ? skip : null;
  if (pend && !pend.ok) wrong.add(pend.pick);
  const solved = (g && g.solved) || (pend && pend.ok);
  active.s.querySelectorAll(".g-opt").forEach((o) => {
    const L = o.dataset.l, isR = !!solved && L === ans, isW = wrong.has(L) && !isR;
    o.classList.toggle("right", isR);
    o.classList.toggle("wrong", isW);
    o.classList.toggle("dim", !!solved && L !== ans);
    if ((isR || isW) && !o.classList.contains("mk")) requestAnimationFrame(() => o.classList.add("mk"));
    if (!isR && !isW) o.classList.remove("mk");
  });
}
const STATUS = { off: ["off", "Ngoại tuyến"], conn: ["off", "Đang kết nối"], wait: ["", "Chuẩn bị"], open: ["open", "Chuông đang mở"], buzz: ["buzz", "Đang trả lời"], wrong: ["wrong", "Trả lời sai"], right: ["right", "Đã có đáp án"], reveal: ["right", "Đã có đáp án"] };
function frame() {
  if (!active || active.type !== "q") return;
  const a = active, v = view();
  applyOpts();
  const key = [v.m, v.name || "", v.m === "wait" ? v.left : "", st ? st.g.att : "", st ? st.g.out.length : ""].join("|");
  if (key === a.key) return;
  const prevM = a.mode, first = prevM === null || prevM === "conn" || prevM === "off";
  a.key = key; a.mode = v.m;
  if (v.m !== "buzz") judging = false;
  a.s.classList.toggle("g-judge", v.m === "buzz" && !judging);
  const pill = $(".g-status");
  pill.dataset.s = STATUS[v.m][0]; pill.lastChild.textContent = STATUS[v.m][1];
  banner(v, prevM !== v.m);
  hint();
  // sound + effects on transitions
  if (v.m === "wait") { if (v.left <= 3 && v.left >= 1) SFX.tick(); return; }
  if (first || prevM === v.m) return;
  const mine = skip && Date.now() < skip.until && (v.m === "wrong" || v.m === "right") && skip.pick === v.pick;
  if (mine) { skip = null; return; }
  if (v.m === "open") SFX.open();
  else if (v.m === "buzz") SFX.bell();
  else if (v.m === "wrong") fxJudge(v.pick, false);
  else if (v.m === "right") fxJudge(v.pick, true);
  else if (v.m === "reveal") { SFX.reveal(); const o = opt(Q[a.qi].answer); o && pulse(o, "glow"); }
}
function banner(v, swap) {
  const b = $(".g-banner"), inn = $(".gb-in"), side = $(".gb-side");
  b.dataset.m = v.m;
  let k = "", val = "", cls = "";
  const ans = Q[active.qi].answer, ansT = (Q[active.qi].options || [])["ABCD".indexOf(ans)] || "";
  switch (v.m) {
    case "off": k = "Chế độ ngoại tuyến"; val = "Mở link Vercel để chơi"; break;
    case "conn": k = "Đang kết nối máy chủ"; val = "Chờ một chút…"; break;
    case "wait": k = "Chuẩn bị bấm chuông"; val = String(v.left); cls = "num"; break;
    case "open": k = v.again ? "Chuông đã mở lại cho người chơi khác" : "Chuông đang mở"; val = "Ai nhanh tay nhất?"; break;
    case "buzz": k = "Giành quyền trả lời"; val = v.name; break;
    case "wrong": k = `Trả lời sai: chọn ${v.pick}`; val = v.name; cls = "strike"; break;
    case "right": k = `Trả lời chính xác: đáp án ${v.pick}`; val = v.name || ansT; break;
    case "reveal": k = "Đáp án đúng"; val = `${ans}. ${ansT}`; break;
  }
  const kEl = inn.querySelector(".gb-k"), vEl = inn.querySelector(".gb-v");
  kEl.textContent = k; vEl.textContent = val; vEl.className = "gb-v " + cls;
  if (swap) { inn.classList.remove("swap"); void inn.offsetWidth; inn.classList.add("swap"); }
  else if (v.m === "wait") pulse(vEl, "tick");
  const out = st && st.g && st.g.phase === "q" && st.g.q === active.qi ? st.g.out : [];
  side.innerHTML = out.length ? "Đã trả lời sai:<br><b></b>" : "";
  if (out.length) side.querySelector("b").textContent = names(out).join(", ");
}
const opt = (L) => active.s.querySelector(`.g-opt[data-l="${L}"]`);
function pulse(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); el.addEventListener("animationend", () => el.classList.remove(cls), { once: true }); }
function fxJudge(L, ok) {
  const o = opt(L);
  if (ok) { SFX.correct(); stamp("right", "CHÍNH XÁC!"); confetti(); o && pulse(o, "glow"); }
  else { SFX.wrong(); stamp("wrong", "SAI RỒI!"); o && pulse(o, "shake"); }
}
function stamp(kind, text) {
  const el = $(".g-stamp");
  el.className = "g-stamp " + kind; el.firstElementChild.textContent = text;
  void el.offsetWidth; el.classList.add("show");
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2300);
}
function confetti() {
  const fx = $(".g-fx");
  if (!fx.animate) return;
  const cols = ["#00C4CC", "#5A32FA", "#9B6BFF", "#FFD400", "#3EE08F", "#FF8A5C", "#FFFFFF"];
  for (let i = 0; i < 110; i++) {
    const d = document.createElement("div");
    d.className = "g-cf"; d.style.background = cols[i % cols.length];
    if (i % 3 === 0) { d.style.width = d.style.height = "16px"; d.style.borderRadius = "50%"; }
    fx.appendChild(d);
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4, sp = 420 + Math.random() * 760;
    const x = Math.cos(ang) * sp * 1.25, y = Math.sin(ang) * sp, r = (Math.random() - 0.5) * 1440, dur = 1900 + Math.random() * 1100;
    const an = d.animate([
      { transform: "translate3d(0,0,0) rotate(0deg)", opacity: 1 },
      { transform: `translate3d(${x * 0.8}px,${y}px,0) rotate(${r * 0.5}deg)`, opacity: 1, offset: 0.38 },
      { transform: `translate3d(${x}px,${y + 900}px,0) rotate(${r}deg)`, opacity: 0 },
    ], { duration: dur, easing: "cubic-bezier(.12,.62,.38,1)", fill: "forwards" });
    an.onfinish = () => d.remove();
  }
}
function judge(L) {
  if (!active || active.type !== "q" || active.mode !== "buzz" || judging) return;
  const ok = L === Q[active.qi].answer;
  judging = true;
  active.s.classList.remove("g-judge");
  skip = { pick: L, ok, until: Date.now() + 6000 };
  fxJudge(L, ok);
  applyOpts();
  post("judge", { pick: L, ok }).then((r) => { if (!r || !r.g) { skip = null; judging = false; frame(); } });
}

// ───────── results ─────────
function renderRes(snap) {
  const wins = (st && st.g && st.g.wins) || {};
  active.s.querySelectorAll(".g-rw").forEach((el, n) => {
    const i = +el.dataset.w, w = wins[i], name = w ? w.name : "";
    if (el._n === name) return;
    el._n = name;
    el.classList.toggle("won", !!w);
    el.innerHTML = w ? `${TROPHY}<span class="g-rwn"></span>` : '<span class="g-rwn">Chưa có người trả lời đúng</span>';
    if (w) el.querySelector(".g-rwn").textContent = name;
    if (!snap && w) { el.style.animationDelay = n * 120 + "ms"; pulse(el, "pop"); }
  });
}

// ───────── operator controls ─────────
function hint() {
  let t = "";
  if (!active) t = "";
  else if (active.type === "join") t = "Chờ người chơi vào phòng rồi nhấn → để sang câu 1";
  else if (active.type === "q") t = { buzz: "Bấm vào đáp án người chơi chọn (hoặc phím A, B, C, D)", open: "Đang chờ người chơi bấm chuông", wait: "Chuông sắp mở", right: "Nhấn → để sang slide tiếp theo", reveal: "Nhấn → để sang slide tiếp theo" }[active.mode] || "";
  phint.textContent = t;
}
let armT = 0;
panel.addEventListener("click", (e) => {
  const btn = e.target.closest("button"); if (!btn) return;
  e.stopPropagation();
  SFX.unlock();
  const act = btn.dataset.act;
  if (act === "mute") { btn.classList.toggle("muted", SFX.toggleMute()); return; }
  if (act === "reset") {
    if (!btn.classList.contains("arm")) { btn.classList.add("arm"); btn.lastChild.textContent = "Bấm lần nữa để xóa"; clearTimeout(armT); armT = setTimeout(() => { btn.classList.remove("arm"); btn.lastChild.textContent = "Reset game"; }, 3000); return; }
    clearTimeout(armT); btn.classList.remove("arm"); btn.lastChild.textContent = "Reset game";
    if (active && active.type === "join") $(".g-chips").innerHTML = "";
    st = null;
    post("reset").then(() => { if (active) onSlide(slides.indexOf(active.s)); });
    return;
  }
  if (!active || active.type !== "q") return;
  if (act === "reopen") post("reopen");
  if (act === "reveal") post("reveal");
});
let panelT = 0, overPanel = false;
const showPanel = () => { panel.classList.add("show"); clearTimeout(panelT); panelT = setTimeout(() => { if (!overPanel) panel.classList.remove("show"); }, 2600); };
addEventListener("mousemove", showPanel);
panel.addEventListener("mouseenter", () => { overPanel = true; panel.classList.add("show"); });
panel.addEventListener("mouseleave", () => { overPanel = false; showPanel(); });

document.addEventListener("click", (e) => {
  const o = e.target.closest(".g-opt");
  if (o && active && active.type === "q" && active.s.contains(o)) judge(o.dataset.l);
});
const unlock = () => SFX.unlock();
addEventListener("pointerdown", unlock, true);
addEventListener("keydown", (e) => {
  unlock();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = (e.key || "").toLowerCase();
  const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (k === "m" && active) { stop(); panel.querySelector('[data-act="mute"]').classList.toggle("muted", SFX.toggleMute()); return; }
  if (!active || active.type !== "q") return;
  if (["a", "b", "c", "d"].includes(k)) { stop(); if (!e.repeat) judge(k.toUpperCase()); }
  else if (k === "o") { stop(); if (!e.repeat) post("reopen"); }
  else if (k === "s") { stop(); if (!e.repeat) post("reveal"); }
}, true);

// in case the deck booted before this script loaded
if (window.__deck && window.__deck.cur >= 0) onSlide(window.__deck.cur);
conn();
})();
