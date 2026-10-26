// Buzzer minigame API: one endpoint, state in Upstash Redis (Vercel Marketplace).
//   GET  /api/game?r=host|player[&k=buzzKey][&pid=..][&c=1] -> current state
//   POST /api/game  {op, ...}  player: join, buzz | host: lobby, q, judge, reopen, reveal, end, reset
// Locally (node dev-server.js) it falls back to an in-memory store. On Vercel, Redis is required.
"use strict";

const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const R_TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const HOST_KEY = process.env.HOST_KEY || "";
const DEFAULT_CAP = Math.max(1, +process.env.MAX_PLAYERS || 50);
const NO_REDIS = !R_URL && !!process.env.VERCEL; // in-memory state cannot work across serverless instances
const P = "cg:";
const TTL = 8 * 3600;
const K = { game: P + "game", players: P + "players", slots: P + "slots" };

// ───────── store ─────────
async function pipe(cmds) {
  if (R_URL) {
    const r = await fetch(R_URL.replace(/\/$/, "") + "/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer " + R_TOK, "Content-Type": "application/json" },
      body: JSON.stringify(cmds),
    });
    if (!r.ok) throw new Error("redis " + r.status);
    const out = await r.json();
    return out.map((x) => { if (x.error) throw new Error(x.error); return x.result; });
  }
  return cmds.map(mem);
}
const one = async (...c) => (await pipe([c]))[0];

const M = (globalThis.__cgMem = globalThis.__cgMem || { kv: new Map(), h: new Map(), z: new Map() });
function zsorted(k) { const z = M.z.get(k) || new Map(); return [...z].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map((x) => x[0]); }
function mem([c, k, ...a]) {
  c = c.toUpperCase();
  if (c === "GET") return M.kv.has(k) ? M.kv.get(k) : null;
  if (c === "SET") { if (a.includes("NX") && M.kv.has(k)) return null; M.kv.set(k, a[0]); return "OK"; }
  if (c === "DEL") { M.kv.delete(k); M.h.delete(k); M.z.delete(k); return 1; }
  if (c === "HSET") { const h = M.h.get(k) || new Map(); M.h.set(k, h); h.set(a[0], a[1]); return 1; }
  if (c === "HGET") { const h = M.h.get(k); return h && h.has(a[0]) ? h.get(a[0]) : null; }
  if (c === "HGETALL") { const h = M.h.get(k); return h ? [...h].flat() : []; }
  if (c === "ZADD") { const z = M.z.get(k) || new Map(); M.z.set(k, z); const [score, m] = a.filter((x) => x !== "NX"); if (z.has(m)) return 0; z.set(m, +score); return 1; }
  if (c === "ZRANK") { const i = zsorted(k).indexOf(a[0]); return i < 0 ? null : i; }
  if (c === "ZREM") { const z = M.z.get(k); return z && z.delete(a[0]) ? 1 : 0; }
  if (c === "ZCARD") { const z = M.z.get(k); return z ? z.size : 0; }
  if (c === "EXPIRE") return 1;
  throw new Error("mem: " + c);
}

// ───────── game state ─────────
const fresh = () => ({ epoch: Math.random().toString(36).slice(2, 8), phase: "idle", q: -1, n: 3, cap: DEFAULT_CAP, att: 0, openAt: 0, solved: false, out: [], wrong: [], last: null, wins: {}, v: 0 });
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const buzzKey = (g) => `${P}buzz:${g.epoch}:${g.q}:${g.att}`;
const saveGame = (g) => { g.v = (g.v || 0) + 1; return ["SET", K.game, JSON.stringify(g), "EX", String(TTL)]; };
const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
const okPid = (p) => typeof p === "string" && /^[a-z0-9]{8,32}$/.test(p);
const nameOf = (v) => { v = String(v); return v.slice(v.indexOf("|") + 1); };

async function readState(role, q) {
  const hint = (q.get("k") || "").startsWith(P + "buzz:") ? q.get("k") : "";
  const pid = okPid(q.get("pid")) ? q.get("pid") : "";
  const cmds = [["GET", K.game]];
  const idx = {};
  if (hint) idx.hint = cmds.push(["GET", hint]) - 1;
  if (role === "host") idx.pl = cmds.push(["HGETALL", K.players]) - 1;
  if (pid) idx.me = cmds.push(["HGET", K.players, pid]) - 1;
  if (role === "host" || q.get("c")) idx.cnt = cmds.push(["ZCARD", K.slots]) - 1;
  const res = await pipe(cmds);
  const g = parse(res[0]) || fresh();
  const key = g.phase === "q" ? buzzKey(g) : null;
  let buzz = null;
  if (key) buzz = parse(hint === key ? res[idx.hint] : await one("GET", key));
  const out = { now: Date.now(), g, buzz, key, store: R_URL ? "redis" : "memory" };
  if (idx.me !== undefined) out.me = res[idx.me] !== null;
  if (idx.cnt !== undefined) out.count = +res[idx.cnt] || 0;
  if (role === "host") {
    const flat = res[idx.pl] || [], pl = [];
    for (let i = 0; i < flat.length; i += 2) { const v = String(flat[i + 1]); pl.push({ pid: flat[i], t: +v.slice(0, v.indexOf("|")), name: nameOf(v) }); }
    pl.sort((a, b) => a.t - b.t);
    out.players = pl.map(({ pid, name }) => ({ pid, name }));
  }
  return out;
}

async function hostOp(op, b) {
  const g = parse(await one("GET", K.game)) || fresh();
  const now = Date.now();
  if (op === "reset") {
    const n = fresh();
    n.cap = g.cap || DEFAULT_CAP;
    await pipe([["DEL", K.players], ["DEL", K.slots], saveGame(n)]);
    return;
  }
  if (op === "lobby") {
    const cap = Math.max(1, Math.min(500, +b.cap || g.cap || DEFAULT_CAP));
    if (g.phase === "lobby" && g.cap === cap) return;
    g.phase = "lobby"; g.cap = cap;
  } else if (op === "end") { if (g.phase === "end") return; g.phase = "end"; }
  else if (op === "q") {
    const q = +b.q;
    if (g.phase === "q" && g.q === q && !b.force) return; // idempotent when the presenter lands on the same slide again
    g.phase = "q"; g.q = q; g.n = +b.n || g.n || 3; g.att += 1; g.out = []; g.wrong = [];
    g.openAt = now + Math.max(0, Math.min(10000, +b.delay || 3000));
    const w = g.wins[q];
    g.solved = !!w; g.last = w ? { ...w, ok: true, t: 0 } : null;
  } else if (op === "judge") {
    if (g.phase !== "q" || g.solved) return { err: "not-judgeable" };
    const bz = parse(await one("GET", buzzKey(g)));
    if (!bz) return { err: "no-buzz" };
    const pick = String(b.pick || "").slice(0, 1);
    if (b.ok) {
      g.solved = true; g.last = { pid: bz.pid, name: bz.name, pick, ok: true, t: now };
      g.wins[g.q] = { pid: bz.pid, name: bz.name, pick };
    } else {
      g.out.push(bz.pid); if (pick && !g.wrong.includes(pick)) g.wrong.push(pick);
      g.last = { pid: bz.pid, name: bz.name, pick, ok: false, t: now };
      g.att += 1; g.openAt = now + Math.max(0, Math.min(10000, +b.delay || 2800));
    }
  } else if (op === "reopen") {
    if (g.phase !== "q") return { err: "no-question" };
    g.att += 1; g.solved = false; g.last = null; g.openAt = now + 1500;
  } else if (op === "reveal") {
    if (g.phase !== "q") return { err: "no-question" };
    g.solved = true; g.last = { reveal: true, t: now };
  } else return { err: "bad-op" };
  await pipe([saveGame(g)]);
}

async function playerOp(op, b) {
  if (op === "join") {
    const name = cleanName(b.name);
    if (!name) return { err: "name" };
    // the phone creates its own id once and keeps it, so re-joining or renaming never adds a duplicate player
    const pid = okPid(b.pid) ? b.pid : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
    const [gs, existing] = await pipe([["GET", K.game], ["HGET", K.players, pid]]);
    const g = parse(gs) || fresh();
    const extra = gs ? [] : [saveGame(g)];
    if (existing !== null) { // same device: just update the name
      const ts = String(existing).slice(0, String(existing).indexOf("|"));
      await pipe([["HSET", K.players, pid, ts + "|" + name], ...extra]);
      return { pid, name, epoch: g.epoch };
    }
    // claim a seat atomically: the earliest `cap` timestamps win, everyone else is turned away
    const ts = Date.now();
    const [, rank] = await pipe([["ZADD", K.slots, "NX", String(ts), pid], ["ZRANK", K.slots, pid], ["EXPIRE", K.slots, String(TTL)]]);
    const cap = g.cap || DEFAULT_CAP;
    if (rank === null || +rank >= cap) { await one("ZREM", K.slots, pid); return { err: "full", cap }; }
    await pipe([["HSET", K.players, pid, ts + "|" + name], ["EXPIRE", K.players, String(TTL)], ...extra]);
    return { pid, name, epoch: g.epoch };
  }
  if (op === "buzz") {
    if (!okPid(b.pid)) return { won: false, why: "rejoin" };
    const [gs, pname] = await pipe([["GET", K.game], ["HGET", K.players, b.pid]]);
    const g = parse(gs);
    const now = Date.now();
    if (!g || pname === null) return { won: false, why: "rejoin" };
    if (g.phase !== "q" || g.solved) return { won: false, why: "closed" };
    if (now < g.openAt - 150) return { won: false, why: "early" };
    if (g.out.includes(b.pid)) return { won: false, why: "out" };
    const rec = { pid: b.pid, name: nameOf(pname), t: now };
    const ok = await one("SET", buzzKey(g), JSON.stringify(rec), "NX", "EX", String(TTL));
    if (ok) return { won: true, name: rec.name };
    const cur = parse(await one("GET", buzzKey(g)));
    return { won: false, why: "late", by: cur ? cur.name : "" };
  }
  return { err: "bad-op" };
}

// ───────── handler ─────────
function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return parse(req.body) || {};
  return await new Promise((ok) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => ok(parse(d) || {})); req.on("error", () => ok({})); });
}

module.exports = async function handler(req, res) {
  try {
    if (NO_REDIS) return send(res, 503, { err: "no-redis" });
    const u = new URL(req.url, "http://x");
    if (req.method === "GET") {
      const role = u.searchParams.get("r") === "host" ? "host" : "player";
      const s = await readState(role, u.searchParams);
      if (role === "host") s.auth = !HOST_KEY || u.searchParams.get("key") === HOST_KEY;
      return send(res, 200, s);
    }
    if (req.method !== "POST") return send(res, 405, { err: "method" });
    const b = await readBody(req);
    const op = String(b.op || "");
    if (["join", "buzz"].includes(op)) return send(res, 200, await playerOp(op, b));
    if (HOST_KEY && b.key !== HOST_KEY) return send(res, 401, { err: "host-key" });
    const r = await hostOp(op, b);
    if (r && r.err) return send(res, 409, r);
    return send(res, 200, await readState("host", new URLSearchParams()));
  } catch (e) {
    return send(res, 500, { err: String(e.message || e) });
  }
};
