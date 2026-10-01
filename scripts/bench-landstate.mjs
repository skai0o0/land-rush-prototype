#!/usr/bin/env node
/**
 * Land-rush load benchmark: N concurrent bots across 10 schools sending
 * claim/fortify frames on the "land" protocol channel while sampling
 * server CPU/RAM.
 *
 * Protocol: room.send("land", { t: "claim" | "fortify", x, y })
 *           (matches shared/land/protocol.ts makeClaim / makeFortify)
 *
 * Usage (PowerShell):
 *   node scripts/bench-landstate.mjs
 *
 * Env:
 *   BOTS=500            total connections (evenly across 10 schools)
 *   DURATION_SEC=60     steady-state send window
 *   ACTIONS_PER_SEC=10  target actions/sec/bot (claim+fortify)
 *   RAMP_BATCH=50       connections per ramp batch
 *   RAMP_DELAY_MS=150   pause between ramp batches
 *   WS_URL=ws://localhost:2567
 *   ROOM=campus_room
 *   PROTOCOL=land       land | claim_tile | claim
 *   OUT_DIR=bench-results
 *   JOIN_POINTS=10000000  personalTroops granted on join
 */

import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Resolve colyseus.js from client/node_modules (worktree does not hoist it).
const require = createRequire(path.join(ROOT, "client", "package.json"));

// ---- bandwidth state (must exist before WebSocket instrumentation) ----
const bw = {
  socketsWrapped: 0,
  sentBytes: 0,
  recvBytes: 0,
  sentMsgs: 0,
  recvMsgs: 0,
  steadySentBytes: 0,
  steadyRecvBytes: 0,
  steadySentMsgs: 0,
  steadyRecvMsgs: 0,
  actionPayloadBytes: 0,
  ackPayloadBytes: 0,
  ownBatchPayloadBytes: 0,
  combatPayloadBytes: 0,
  snapPayloadBytes: 0,
  errorPayloadBytes: 0,
  otherPayloadBytes: 0,
  lastSentBytes: 0,
  lastRecvBytes: 0,
  lastSampleT: 0,
  peakSentBps: 0,
  peakRecvBps: 0,
  io: {
    start: null,
    end: null,
    last: null,
    peakReadBps: 0,
    peakWriteBps: 0,
    peakDataBps: 0,
    samples: 0,
  },
  os: {
    lastTcpSegSent: null,
    lastTcpSegRecv: null,
    note: "localhost WS traffic does not appear on physical NIC counters; TCPv4 Segments are system-wide (all processes)",
  },
};

let steadyActive = false;

function byteLen(data) {
  if (data == null) return 0;
  if (typeof data === "string") return Buffer.byteLength(data, "utf8");
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.size;
  if (Array.isArray(data)) return data.length;
  if (typeof data === "object" && typeof data.size === "number") return data.size;
  if (typeof data === "object" && typeof data.byteLength === "number") return data.byteLength;
  if (typeof data === "object" && typeof data.length === "number") return data.length;
  try {
    return Buffer.byteLength(JSON.stringify(data), "utf8");
  } catch {
    return 0;
  }
}

function payloadBytes(obj) {
  try {
    return Buffer.byteLength(JSON.stringify(obj), "utf8");
  } catch {
    return 0;
  }
}

/**
 * Wrap global WebSocket BEFORE requiring colyseus.js so every bot socket
 * counts wire bytes (Colyseus captures globalThis.WebSocket at module load).
 */
function instrumentGlobalWebSocket() {
  const OrigWS = globalThis.WebSocket;
  if (!OrigWS || OrigWS.__bwWrapped) return;
  class InstrumentedWebSocket extends OrigWS {
    constructor(...args) {
      super(...args);
      bw.socketsWrapped += 1;
      this.addEventListener("message", (ev) => {
        const n = byteLen(ev && ev.data);
        bw.recvBytes += n;
        bw.recvMsgs += 1;
        if (steadyActive) {
          bw.steadyRecvBytes += n;
          bw.steadyRecvMsgs += 1;
        }
      });
    }
    send(data) {
      const n = byteLen(data);
      bw.sentBytes += n;
      bw.sentMsgs += 1;
      if (steadyActive) {
        bw.steadySentBytes += n;
        bw.steadySentMsgs += 1;
      }
      return super.send(data);
    }
  }
  InstrumentedWebSocket.__bwWrapped = true;
  globalThis.WebSocket = InstrumentedWebSocket;
}
instrumentGlobalWebSocket();

const { Client } = require("colyseus.js");

// Silence colyseus.js unregistered-handler / onError spam (thousands of lines at 500 bots).
const _origLog = console.log.bind(console);
console.log = (...args) => {
  const s = args.map((a) => (typeof a === "string" ? a : "")).join(" ");
  if (s.includes("onError") || s.includes("not registered for type")) return;
  _origLog(...args);
};

// ---- config -----------------------------------------------------------------
const WS_URL = process.env.WS_URL || "ws://localhost:2567";
const ROOM_NAME = process.env.ROOM || "campus_room";
const TOTAL_BOTS = clampInt(process.env.BOTS, 500, 1, 2000);
const DURATION_SEC = clampInt(process.env.DURATION_SEC, 60, 1, 600);
const ACTIONS_PER_SEC = clampNumber(process.env.ACTIONS_PER_SEC, 10, 0.1, 100);
const RAMP_BATCH = clampInt(process.env.RAMP_BATCH, 25, 1, 200);
const RAMP_DELAY_MS = clampInt(process.env.RAMP_DELAY_MS, 250, 0, 5000);
const JOIN_RETRIES = clampInt(process.env.JOIN_RETRIES, 3, 0, 10);
const PROTOCOL = (process.env.PROTOCOL || "land").toLowerCase(); // land | claim_tile | claim
const OUT_DIR = path.resolve(ROOT, process.env.OUT_DIR || "bench-results");
const JOIN_POINTS = clampInt(process.env.JOIN_POINTS, 10_000_000, 0, 1e9);
const SAMPLE_MS = 1000;
const JOIN_TIMEOUT_MS = 20_000;

// Multi-process mode: N independent client processes (avoids one Node event
// loop choking on 500 schema streams). Parent aggregates summaries.
const WORKERS = clampInt(process.env.WORKERS, 1, 1, 16);
const WORKER_ID = process.env.BENCH_WORKER != null ? clampInt(process.env.BENCH_WORKER, 0, 0, 64) : null;
const NO_SAMPLE = process.env.NO_SAMPLE === "1";
const START_AT = process.env.START_AT ? clampInt(process.env.START_AT, 0, 0, Number.MAX_SAFE_INTEGER) : 0;

const SCHOOL_IDS = [
  "hcmut", "hcmus", "hcmussh", "uit", "uel",
  "iu", "uhs", "ubb", "uflis", "ulpa",
];

// ---- metrics ----------------------------------------------------------------
const stats = {
  joinsOk: 0,
  joinsFail: 0,
  joinErrors: {},
  msgsSent: 0,
  sentByOp: { claim: 0, fortify: 0 },
  acksOk: 0,
  acksErr: 0,
  ackErrReasons: {},
  errorMessages: 0,
  ownBatch: 0,
  combatFrames: 0,
  snapFrames: 0,
  landOther: 0,
  otherMessages: 0,
  disconnects: 0,
  roomErrors: 0,
  roomErrorCodes: {},
  sendErrors: 0,
  leaveOk: 0,
  firstJoinAt: 0,
  lastJoinAt: 0,
  rampMs: 0,
  steadyMs: 0,
};

const samples = []; // { t, cpuPct, wsMB, privMB, cpuSec, actionsTotal, joinsOk, acksOk, acksErr }

function bump(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function clampInt(v, dflt, min, max) {
  const n = parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
function clampNumber(v, dflt, min, max) {
  const n = parseFloat(v ?? "");
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

// ---- server process sampling ------------------------------------------------
function psCommand(cmd) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", cmd],
      { timeout: 8000, windowsHide: true },
      (err, stdout) => resolve(err ? "" : String(stdout).trim())
    );
  });
}

async function resolveServerPid() {
  const out = await psCommand(
    `$c = Get-NetTCPConnection -LocalPort 2567 -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -in @('0.0.0.0','127.0.0.1','::') } | Select-Object -First 1; if ($c) { $c.OwningProcess }`
  );
  const pid = parseInt(out, 10);
  return Number.isFinite(pid) ? pid : null;
}

async function sampleProcess(pid) {
  // Light sample only: process CPU/RAM + cumulative IO counters.
  // Heavy Get-Counter (TCP/NIC) is sampled separately and less often.
  const out = await psCommand(
    `$p = Get-Process -Id ${pid} -ErrorAction Stop; ` +
      `$io = Get-CimInstance Win32_PerfRawData_PerfProc_Process -Filter "IDProcess = ${pid}" -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
      `[pscustomobject]@{ CpuSec = $p.CPU; WS = $p.WorkingSet64; Priv = $p.PrivateMemorySize64; Threads = $p.Threads.Count; ` +
      `IORead = if ($io) { [int64]$io.IOReadBytesPersec } else { $null }; ` +
      `IOWrite = if ($io) { [int64]$io.IOWriteBytesPersec } else { $null }; ` +
      `IOOther = if ($io) { [int64]$io.IOOtherBytesPersec } else { $null }; ` +
      `IOData = if ($io) { [int64]$io.IODataBytesPersec } else { $null } } | ConvertTo-Json -Compress`
  );
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

// Heavy OS counters (system-wide; localhost WS does not hit physical NIC).
// Called occasionally — not on every 1s bandwidth sample.
async function sampleOsCounters() {
  const out = await psCommand(
    `$tcpS = $tcpR = $nicS = $nicR = $null; ` +
      `try { $c = Get-Counter '\\TCPv4\\Segments Sent/sec','\\TCPv4\\Segments Received/sec','\\Network Interface(*)\\Bytes Sent/sec','\\Network Interface(*)\\Bytes Received/sec' -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop; ` +
      `$tcpS = [double](($c.CounterSamples | Where-Object { $_.Path -match 'tcpv4\\\\segments sent' } | Select-Object -First 1).CookedValue); ` +
      `$tcpR = [double](($c.CounterSamples | Where-Object { $_.Path -match 'tcpv4\\\\segments received' } | Select-Object -First 1).CookedValue); ` +
      `$nicS = [double](($c.CounterSamples | Where-Object { $_.Path -match 'network interface.*bytes sent' } | Measure-Object -Property CookedValue -Sum).Sum); ` +
      `$nicR = [double](($c.CounterSamples | Where-Object { $_.Path -match 'network interface.*bytes received' } | Measure-Object -Property CookedValue -Sum).Sum); } catch {}; ` +
      `[pscustomobject]@{ TcpSegSent = $tcpS; TcpSegRecv = $tcpR; NicSentBps = $nicS; NicRecvBps = $nicR } | ConvertTo-Json -Compress`
  );
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

// ---- HQ scout ---------------------------------------------------------------
async function scoutHQs() {
  const client = new Client(WS_URL);
  const room = await client.joinOrCreate(ROOM_NAME, {
    schoolId: "hcmut",
    email: "bench-scout@bench.local",
    points: 1,
    mode: "dev",
  });
  // Suppress unregistered-message warnings on the scout connection.
  for (const t of ["land", "active_clusters_sync", "error", "bastion_formed", "mega_emblem_formed"]) {
    try {
      room.onMessage(t, () => {});
    } catch {
      /* ignore */
    }
  }
  // Allow state to arrive (hqs are set in onCreate, so present immediately).
  await sleep(300);
  const hqs = {};
  try {
    const state = room.state;
    for (const id of SCHOOL_IDS) {
      const hq = state?.hqs?.get?.(id);
      if (hq && Number.isFinite(hq.x) && Number.isFinite(hq.y)) {
        hqs[id] = { x: Math.floor(hq.x), y: Math.floor(hq.y) };
      }
    }
  } catch (e) {
    console.warn("[scout] state read failed:", e?.message || e);
  }
  try {
    await room.leave();
  } catch {
    /* ignore */
  }
  return hqs;
}

// ---- bot --------------------------------------------------------------------
function makeBot(index, schoolId, hqs) {
  const hq = hqs[schoolId] || { x: 100 + index, y: 100 + index };
  return {
    index,
    schoolId,
    email: `bot-${index}@bench.local`,
    hq,
    client: null,
    room: null,
    alive: false,
    acc: 0,
    sent: 0,
    sendErr: 0,
  };
}

function pickTarget(bot, fortify) {
  // HQ footprint is a hex of radius ~10 (center tier 3). Claim on the 10–18 ring
  // (adjacent to owned); fortify at radius 6–12 (lower tiers, more upgrades).
  const angle = Math.random() * Math.PI * 2;
  const r = fortify ? 6 + Math.random() * 6 : 10 + Math.random() * 8;
  const x = bot.hq.x + Math.round(Math.cos(angle) * r);
  const y = bot.hq.y + Math.round(Math.sin(angle) * r);
  return {
    x: Math.max(0, Math.min(999, x)),
    y: Math.max(0, Math.min(999, y)),
  };
}

function sendAction(bot) {
  if (!bot.room || !bot.alive) return;
  // 70% claim / 30% fortify
  const fortify = Math.random() < 0.3;
  const { x, y } = pickTarget(bot, fortify);
  try {
    let frame = null;
    if (PROTOCOL === "land") {
      frame = fortify ? { t: "fortify", x, y } : { t: "claim", x, y };
      bot.room.send("land", frame);
    } else if (PROTOCOL === "claim_tile") {
      frame = { x, y };
      bot.room.send(fortify ? "fortify_tile" : "claim_tile", frame);
    } else {
      frame = { t: fortify ? "fortify" : "claim", x, y };
      bot.room.send(fortify ? "fortify" : "claim", frame);
    }
    // App-payload estimate (wire bytes counted via WebSocket wrap).
    if (frame) bw.actionPayloadBytes += payloadBytes(frame) + 10; // +channel name approx
    stats.msgsSent += 1;
    bot.sent += 1;
    if (fortify) stats.sentByOp.fortify += 1;
    else stats.sentByOp.claim += 1;
  } catch (e) {
    stats.sendErrors += 1;
    bot.sendErr += 1;
  }
}

function attachHandlers(bot) {
  const room = bot.room;
  if (!room) return;

  room.onMessage("land", (payload) => {
    const sz = payloadBytes(payload) + 10; // +envelope estimate
    const t = payload && payload.t;
    if (t === "ack") {
      bw.ackPayloadBytes += sz;
      if (payload.ok) stats.acksOk += 1;
      else {
        stats.acksErr += 1;
        bump(stats.ackErrReasons, payload.reason || "unknown");
      }
    } else if (t === "own_batch") {
      stats.ownBatch += 1;
      bw.ownBatchPayloadBytes += sz;
    } else if (t === "combat") {
      stats.combatFrames += 1;
      bw.combatPayloadBytes += sz;
    } else if (t === "snap") {
      stats.snapFrames += 1;
      bw.snapPayloadBytes += sz;
    } else {
      stats.landOther += 1;
      bw.otherPayloadBytes += sz;
    }
  });

  // Server also sends legacy "error" on failed claim/fortify (parallel to acks).
  room.onMessage("error", (payload) => {
    stats.errorMessages += 1;
    bw.errorPayloadBytes += payloadBytes(payload) + 10;
  });

  // Silence / count remaining server pushes (avoid colyseus.js unregistered spam).
  const noopCount = (payload) => {
    stats.otherMessages += 1;
    bw.otherPayloadBytes += payloadBytes(payload) + 10;
  };
  for (const t of [
    "active_clusters_sync",
    "bastion_formed",
    "mega_emblem_formed",
    "bastion_broken",
    "mega_emblem_broken",
    "dev_breach_success",
  ]) {
    room.onMessage(t, noopCount);
  }

  room.onLeave(() => {
    // Only count unexpected drops; intentional leave() sets alive=false first.
    if (bot.alive) stats.disconnects += 1;
    bot.alive = false;
  });

  room.onError((code, message) => {
    stats.roomErrors += 1;
    bump(stats.roomErrorCodes, `${code ?? "undef"}:${message ?? ""}`);
  });
}

async function joinBot(bot, attempt = 0) {
  if (bot.everJoined) return; // never double-count a reconnect as a new join
  try {
    bot.client = new Client(WS_URL);
    bot.room = await bot.client.joinOrCreate(ROOM_NAME, {
      schoolId: bot.schoolId,
      email: bot.email,
      points: JOIN_POINTS,
      mode: "normal",
    });
    bot.alive = true;
    bot.everJoined = true;
    stats.joinsOk += 1;
    if (!stats.firstJoinAt) stats.firstJoinAt = Date.now();
    stats.lastJoinAt = Date.now();
    attachHandlers(bot);
  } catch (e) {
    stats.joinsFail += 1;
    bump(stats.joinErrors, (e && e.message) || String(e));
    bot.alive = false;
    if (attempt < JOIN_RETRIES) {
      await sleep(400 + attempt * 500 + Math.floor(Math.random() * 300));
      return joinBot(bot, attempt + 1);
    }
  }
}

// ---- main -------------------------------------------------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fmtMB(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i];
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = isWorker ? `-worker${WORKER_ID}` : "";
  const csvPath = path.join(OUT_DIR, `bench-landstate${suffix}-${stamp}.csv`);
  const jsonPath = path.join(OUT_DIR, `bench-landstate${suffix}-${stamp}.json`);
  const logPath = path.join(OUT_DIR, `bench-landstate${suffix}-${stamp}.log`);
  const log = createWriteStream(logPath, { flags: "a" });
  const say = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    if (!log.writableEnded) log.write(line + "\n");
  };

  say(
    `config bots=${TOTAL_BOTS} schools=${SCHOOL_IDS.length} duration=${DURATION_SEC}s ` +
      `aps=${ACTIONS_PER_SEC} protocol=${PROTOCOL} rampBatch=${RAMP_BATCH} joinPoints=${JOIN_POINTS} url=${WS_URL}`
  );

  const serverPid = await resolveServerPid();
  if (!serverPid) {
    say("FATAL: could not resolve PID for port 2567");
    process.exit(2);
  }
  say(`server pid=${serverPid}`);

  // Baseline sample
  const base = await sampleProcess(serverPid);
  if (base) say(`baseline cpuSec=${base.CpuSec} ws=${fmtMB(base.WS)}MB priv=${fmtMB(base.Priv)}MB`);

  // Scout HQs
  let hqs = {};
  try {
    hqs = await scoutHQs();
    say(`scout hqs: ${JSON.stringify(hqs)}`);
  } catch (e) {
    say(`scout failed (will use fallback targets): ${e?.message || e}`);
  }
  if (Object.keys(hqs).length < SCHOOL_IDS.length) {
    say(`WARNING: only ${Object.keys(hqs).length}/10 HQs resolved`);
  }

  // Build bots evenly across schools
  const bots = [];
  const perSchool = Math.ceil(TOTAL_BOTS / SCHOOL_IDS.length);
  for (let s = 0; s < SCHOOL_IDS.length; s++) {
    for (let k = 0; k < perSchool && bots.length < TOTAL_BOTS; k++) {
      bots.push(makeBot(bots.length, SCHOOL_IDS[s], hqs));
    }
  }

  // ---- ramp joins ----
  const rampStart = Date.now();
  say(`ramp start: ${TOTAL_BOTS} bots in batches of ${RAMP_BATCH} (retries=${JOIN_RETRIES})`);
  for (let i = 0; i < bots.length; i += RAMP_BATCH) {
    const batch = bots.slice(i, i + RAMP_BATCH);
    await Promise.all(batch.map((b) => joinBot(b)));
    const ok = stats.joinsOk;
    say(`ramp ${Math.min(i + RAMP_BATCH, bots.length)}/${bots.length} joinsOk=${ok} joinsFail=${stats.joinsFail}`);
    if (i + RAMP_BATCH < bots.length) await sleep(RAMP_DELAY_MS);
  }

  // Second pass: retry any bots that never connected (smaller batches).
  let dead = bots.filter((b) => !b.alive);
  if (dead.length > 0) {
    say(`retry pass: ${dead.length} bots still down`);
    for (let i = 0; i < dead.length; i += 10) {
      const batch = dead.slice(i, i + 10);
      await Promise.all(batch.map((b) => joinBot(b)));
      await sleep(150);
    }
    say(`after retries joinsOk=${stats.joinsOk} stillDown=${bots.filter((b) => !b.alive).length}`);
  }
  stats.rampMs = Date.now() - rampStart;
  say(`ramp done in ${stats.rampMs}ms joinsOk=${stats.joinsOk}/${TOTAL_BOTS} joinsFail=${stats.joinsFail}`);

  const liveBots = bots.filter((b) => b.alive);
  if (liveBots.length === 0) {
    say("FATAL: no bots connected");
    writeFileSync(jsonPath, JSON.stringify({ error: "no_bots", stats }, null, 2));
    process.exit(3);
  }

  // ---- 1s sampler (serialized; skip if previous sample still in flight) ----
  let prevCpuSec = base ? base.CpuSec : null;
  let prevT = Date.now();
  let sampling = false;
  const cores = Number(process.env.NUMBER_OF_PROCESSORS) || 16;
  if (base) {
    bw.io.start = { t: prevT, IORead: base.IORead ?? 0, IOWrite: base.IOWrite ?? 0, IOOther: base.IOOther ?? 0, IOData: base.IOData ?? 0 };
    bw.io.last = { ...bw.io.start };
  }
  bw.lastSampleT = prevT;
  bw.lastSentBytes = 0;
  bw.lastRecvBytes = 0;
  let osCounters = null;
  let osSampleTick = 0;
  const sampler = NO_SAMPLE
    ? null
    : setInterval(async () => {
    if (sampling) return;
    sampling = true;
    try {
      const now = Date.now();
      const s = await sampleProcess(serverPid);
      if (!s) return;
      let cpuPct = 0;
      if (prevCpuSec != null) {
        const dtSec = Math.max(0.001, (now - prevT) / 1000);
        cpuPct = ((s.CpuSec - prevCpuSec) / dtSec) * (100 / cores);
        // Guard against overlapping/out-of-order process counter reads.
        if (!Number.isFinite(cpuPct) || cpuPct < 0 || cpuPct > 100) {
          cpuPct = Math.min(100, Math.max(0, cpuPct));
          if (!Number.isFinite(cpuPct) || cpuPct < 0) cpuPct = 0;
        }
      }
      prevCpuSec = s.CpuSec;
      prevT = now;

      // Heavy OS counters every ~5 samples (they take ~1-2s themselves).
      osSampleTick += 1;
      if (osSampleTick === 1 || osSampleTick % 5 === 0) {
        const os = await sampleOsCounters();
        if (os) {
          osCounters = os;
          if (os.TcpSegSent != null) bw.os.lastTcpSegSent = os.TcpSegSent;
          if (os.TcpSegRecv != null) bw.os.lastTcpSegRecv = os.TcpSegRecv;
        }
      }

      // ---- bandwidth rates (client WS wrap + server process IO) ----
      const dtSec = Math.max(0.001, (now - (bw.lastSampleT || now)) / 1000);
      const sentDelta = bw.sentBytes - (bw.lastSentBytes || 0);
      const recvDelta = bw.recvBytes - (bw.lastRecvBytes || 0);
      const sentBps = sentDelta / dtSec;
      const recvBps = recvDelta / dtSec;
      bw.lastSentBytes = bw.sentBytes;
      bw.lastRecvBytes = bw.recvBytes;
      bw.lastSampleT = now;
      if (steadyActive) {
        if (sentBps > bw.peakSentBps) bw.peakSentBps = sentBps;
        if (recvBps > bw.peakRecvBps) bw.peakRecvBps = recvBps;
      }

      let ioReadDelta = 0, ioWriteDelta = 0, ioOtherDelta = 0, ioDataDelta = 0, ioReadBps = 0, ioWriteBps = 0, ioDataBps = 0;
      if (bw.io.last && s.IORead != null) {
        ioReadDelta = Math.max(0, (s.IORead || 0) - (bw.io.last.IORead || 0));
        ioWriteDelta = Math.max(0, (s.IOWrite || 0) - (bw.io.last.IOWrite || 0));
        ioOtherDelta = Math.max(0, (s.IOOther || 0) - (bw.io.last.IOOther || 0));
        ioDataDelta = Math.max(0, (s.IOData || 0) - (bw.io.last.IOData || 0));
        ioReadBps = ioReadDelta / dtSec;
        ioWriteBps = ioWriteDelta / dtSec;
        ioDataBps = ioDataDelta / dtSec;
        if (steadyActive) {
          if (ioReadBps > bw.io.peakReadBps) bw.io.peakReadBps = ioReadBps;
          if (ioWriteBps > bw.io.peakWriteBps) bw.io.peakWriteBps = ioWriteBps;
          if (ioDataBps > bw.io.peakDataBps) bw.io.peakDataBps = ioDataBps;
        }
        bw.io.last = { t: now, IORead: s.IORead || 0, IOWrite: s.IOWrite || 0, IOOther: s.IOOther || 0, IOData: s.IOData || 0 };
      }
      bw.io.samples += 1;

      const row = {
        t: now,
        iso: new Date(now).toISOString(),
        cpuPct: Math.round(cpuPct * 100) / 100,
        cpuSec: s.CpuSec,
        wsMB: fmtMB(s.WS),
        privMB: fmtMB(s.Priv),
        threads: s.Threads,
        joinsOk: stats.joinsOk,
        actionsTotal: stats.msgsSent,
        acksOk: stats.acksOk,
        acksErr: stats.acksErr,
        disconnects: stats.disconnects,
        liveBots: bots.filter((b) => b.alive).length,
        // bandwidth
        clientSentBps: Math.round(sentBps),
        clientRecvBps: Math.round(recvBps),
        clientSentMBps: Math.round((sentBps / (1024 * 1024)) * 1000) / 1000,
        clientRecvMBps: Math.round((recvBps / (1024 * 1024)) * 1000) / 1000,
        clientSentBytes: bw.sentBytes,
        clientRecvBytes: bw.recvBytes,
        steadySentBytes: bw.steadySentBytes,
        steadyRecvBytes: bw.steadyRecvBytes,
        ioReadBps: Math.round(ioReadBps),
        ioWriteBps: Math.round(ioWriteBps),
        ioDataBps: Math.round(ioDataBps),
        ioReadMBps: Math.round((ioReadBps / (1024 * 1024)) * 1000) / 1000,
        ioWriteMBps: Math.round((ioWriteBps / (1024 * 1024)) * 1000) / 1000,
        ioDataMBps: Math.round((ioDataBps / (1024 * 1024)) * 1000) / 1000,
        ioReadDelta,
        ioWriteDelta,
        ioOtherDelta,
        ioDataDelta,
        tcpSegSent: osCounters?.TcpSegSent ?? null,
        tcpSegRecv: osCounters?.TcpSegRecv ?? null,
        nicSentBps: osCounters?.NicSentBps ?? null,
        nicRecvBps: osCounters?.NicRecvBps ?? null,
        socketsWrapped: bw.socketsWrapped,
      };
      samples.push(row);
      say(
        `sample t+${Math.round((now - (stats.firstJoinAt || now)) / 1000)}s cpu=${row.cpuPct}% ws=${row.wsMB}MB priv=${row.privMB}MB ` +
          `actions=${row.actionsTotal} acksOk=${row.acksOk} acksErr=${row.acksErr} live=${row.liveBots} ` +
          `bw: c→s ${row.clientSentMBps}MB/s s→c ${row.clientRecvMBps}MB/s ioW ${row.ioWriteMBps}MB/s ioR ${row.ioReadMBps}MB/s`
      );
    } finally {
      sampling = false;
    }
  }, SAMPLE_MS);

  // ---- steady-state send loop ----
  if (START_AT && Date.now() < START_AT) {
    const waitMs = START_AT - Date.now();
    say(`sync wait ${waitMs}ms until shared start`);
    await sleep(waitMs);
  }
  const sendStart = Date.now();
  const sendUntil = sendStart + DURATION_SEC * 1000;
  steadyActive = true;
  // Reset per-second bandwidth cursors at steady start so rates are clean.
  bw.lastSentBytes = bw.sentBytes;
  bw.lastRecvBytes = bw.recvBytes;
  bw.lastSampleT = sendStart;
  bw.peakSentBps = 0;
  bw.peakRecvBps = 0;
  say(`steady start: ${liveBots.length} bots @ ~${ACTIONS_PER_SEC} act/s for ${DURATION_SEC}s via protocol=${PROTOCOL}`);

  const tickMs = 25;
  let lastTick = Date.now();
  const sender = setInterval(() => {
    const now = Date.now();
    if (now >= sendUntil) return;
    const dtSec = Math.min(0.25, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (!b.alive) continue;
      b.acc += ACTIONS_PER_SEC * dtSec;
      // Cap burst so a stalled event loop cannot dump thousands at once.
      let guard = 30;
      while (b.acc >= 1 && guard-- > 0 && b.alive) {
        sendAction(b);
        b.acc -= 1;
      }
      if (b.acc > 10) b.acc = 10;
    }
  }, tickMs);

  // Wait for duration
  while (Date.now() < sendUntil) {
    await sleep(200);
    // re-resolve pid periodically in case of crash/restart (do not restart server)
    if (samples.length % 15 === 0) {
      const pid2 = await resolveServerPid();
      if (pid2 && pid2 !== serverPid) {
        say(`WARNING: server pid changed ${serverPid} -> ${pid2} (sampling will continue on original if alive)`);
      }
    }
  }

  const steadyMs = Date.now() - sendStart;
  stats.steadyMs = steadyMs;
  steadyActive = false;
  clearInterval(sender);

  // Stop bots
  say("stopping bots...");
  await Promise.all(
    bots.map(async (b) => {
      if (!b.room) return;
      b.alive = false; // intentional leave — do not count as disconnect
      try {
        // leave() can hang on already-dead sockets; never block shutdown.
        await Promise.race([b.room.leave(), sleep(1500)]);
        stats.leaveOk += 1;
      } catch {
        /* ignore */
      }
    })
  );

  // Final sample
  await sleep(500);
  const finalS = await sampleProcess(serverPid);
  clearInterval(sampler);
  clearInterval(sender);
  if (finalS) {
    bw.io.end = {
      t: Date.now(),
      IORead: finalS.IORead ?? 0,
      IOWrite: finalS.IOWrite ?? 0,
      IOOther: finalS.IOOther ?? 0,
      IOData: finalS.IOData ?? 0,
    };
  }

  // ---- summary ----
  const cpuPcts = samples.map((s) => s.cpuPct).filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);
  const wsMBs = samples.map((s) => s.wsMB).filter((n) => Number.isFinite(n));
  const privMBs = samples.map((s) => s.privMB).filter((n) => Number.isFinite(n));
  const cpuAvg = cpuPcts.length ? cpuPcts.reduce((a, b) => a + b, 0) / cpuPcts.length : 0;
  const wsAvg = wsMBs.length ? wsMBs.reduce((a, b) => a + b, 0) / wsMBs.length : 0;
  const privAvg = privMBs.length ? privMBs.reduce((a, b) => a + b, 0) / privMBs.length : 0;

  // Authoritative overall CPU from process CPU-time delta across the whole bench.
  const wallSec = samples.length > 1 ? Math.max(0.001, (samples[samples.length - 1].t - samples[0].t) / 1000) : 0;
  const cpuSecUsed = base && finalS ? finalS.CpuSec - base.CpuSec : 0;
  const overallCpuPct = wallSec > 0 ? (cpuSecUsed / wallSec) * (100 / cores) : 0;

  // ---- bandwidth summary ----
  const steadySecNum = steadyMs / 1000;
  const steadySentMB = bw.steadySentBytes / (1024 * 1024);
  const steadyRecvMB = bw.steadyRecvBytes / (1024 * 1024);
  const ioStart = bw.io.start;
  const ioEnd = bw.io.end;
  const ioReadDeltaTotal = ioStart && ioEnd ? Math.max(0, ioEnd.IORead - ioStart.IORead) : 0;
  const ioWriteDeltaTotal = ioStart && ioEnd ? Math.max(0, ioEnd.IOWrite - ioStart.IOWrite) : 0;
  const ioOtherDeltaTotal = ioStart && ioEnd ? Math.max(0, ioEnd.IOOther - ioStart.IOOther) : 0;
  const ioDataDeltaTotal = ioStart && ioEnd ? Math.max(0, ioEnd.IOData - ioStart.IOData) : 0;
  // Steady-window IO deltas from per-sample rows (more accurate than full-run window).
  const steadyRows = samples.filter((s) => s.ioReadDelta != null);
  const ioReadSteady = steadyRows.reduce((a, s) => a + (s.ioReadDelta || 0), 0);
  const ioWriteSteady = steadyRows.reduce((a, s) => a + (s.ioWriteDelta || 0), 0);
  const ioDataSteady = steadyRows.reduce((a, s) => a + (s.ioDataDelta || 0), 0);
  const actionsProcessed = stats.msgsSent; // client-sent actions during steady
  const bandwidth = {
    measurementNotes: [
      "Client WS bytes: instrumented WebSocketTransport.send / onmessage on every bot socket (true Colyseus wire payload including binary schema patches; excludes TCP/IP headers).",
      "Colyseus uses ws://localhost — traffic is loopback and does NOT appear on physical NIC counters (verified: NIC Bytes Sent/Recv ≈ idle).",
      "Server process IO (Win32_PerfRawData_PerfProc_Process IORead/IOWrite/IOData) is cumulative process IO — includes disk and any other IO, not just sockets. Use as upper bound / cross-check.",
      "TCPv4 Segments Sent/Received are system-wide (all processes), not scoped to the server PID.",
      "App payload estimates are JSON.stringify sizes + ~10B channel envelope; actual wire is msgpack+schema and is larger for state frames.",
    ],
    clientWebSocket: {
      socketsWrapped: bw.socketsWrapped,
      lifetime: {
        sentBytes: bw.sentBytes,
        recvBytes: bw.recvBytes,
        sentMsgs: bw.sentMsgs,
        recvMsgs: bw.recvMsgs,
        sentMB: Math.round((bw.sentBytes / (1024 * 1024)) * 100) / 100,
        recvMB: Math.round((bw.recvBytes / (1024 * 1024)) * 100) / 100,
      },
      steady: {
        windowSec: Math.round(steadySecNum * 100) / 100,
        clientToServerBytes: bw.steadySentBytes,
        serverToClientBytes: bw.steadyRecvBytes,
        clientToServerMB: Math.round(steadySentMB * 100) / 100,
        serverToClientMB: Math.round(steadyRecvMB * 100) / 100,
        clientToServerMsgs: bw.steadySentMsgs,
        serverToClientMsgs: bw.steadyRecvMsgs,
        avgMBpsClientToServer: steadySecNum > 0 ? Math.round((steadySentMB / steadySecNum) * 1000) / 1000 : 0,
        avgMBpsServerToClient: steadySecNum > 0 ? Math.round((steadyRecvMB / steadySecNum) * 1000) / 1000 : 0,
        peakMBpsClientToServer: Math.round((bw.peakSentBps / (1024 * 1024)) * 1000) / 1000,
        peakMBpsServerToClient: Math.round((bw.peakRecvBps / (1024 * 1024)) * 1000) / 1000,
      },
    },
    serverProcessIO: {
      caveat: "includes non-network process IO (disk); treat as upper bound on socket bytes",
      start: ioStart,
      end: ioEnd,
      fullRunDelta: {
        ioReadBytes: ioReadDeltaTotal,
        ioWriteBytes: ioWriteDeltaTotal,
        ioOtherBytes: ioOtherDeltaTotal,
        ioDataBytes: ioDataDeltaTotal,
        ioReadMB: Math.round((ioReadDeltaTotal / (1024 * 1024)) * 100) / 100,
        ioWriteMB: Math.round((ioWriteDeltaTotal / (1024 * 1024)) * 100) / 100,
        ioDataMB: Math.round((ioDataDeltaTotal / (1024 * 1024)) * 100) / 100,
      },
      steadyWindowSum: {
        ioReadBytes: ioReadSteady,
        ioWriteBytes: ioWriteSteady,
        ioDataBytes: ioDataSteady,
        ioReadMB: Math.round((ioReadSteady / (1024 * 1024)) * 100) / 100,
        ioWriteMB: Math.round((ioWriteSteady / (1024 * 1024)) * 100) / 100,
        ioDataMB: Math.round((ioDataSteady / (1024 * 1024)) * 100) / 100,
        avgMBpsRead: steadySecNum > 0 ? Math.round((ioReadSteady / (1024 * 1024) / steadySecNum) * 1000) / 1000 : 0,
        avgMBpsWrite: steadySecNum > 0 ? Math.round((ioWriteSteady / (1024 * 1024) / steadySecNum) * 1000) / 1000 : 0,
        avgMBpsData: steadySecNum > 0 ? Math.round((ioDataSteady / (1024 * 1024) / steadySecNum) * 1000) / 1000 : 0,
        peakMBpsRead: Math.round((bw.io.peakReadBps / (1024 * 1024)) * 1000) / 1000,
        peakMBpsWrite: Math.round((bw.io.peakWriteBps / (1024 * 1024)) * 1000) / 1000,
        peakMBpsData: Math.round((bw.io.peakDataBps / (1024 * 1024)) * 1000) / 1000,
      },
    },
    appPayloadEstimate: {
      note: "JSON payload sizes (bytes) seen at room.onMessage / room.send — not full wire size",
      actionBytesTotal: bw.actionPayloadBytes,
      actionAvgBytes: actionsProcessed > 0 ? Math.round(bw.actionPayloadBytes / actionsProcessed) : 0,
      ackBytesTotal: bw.ackPayloadBytes,
      ackAvgBytes: stats.acksOk + stats.acksErr > 0 ? Math.round(bw.ackPayloadBytes / (stats.acksOk + stats.acksErr)) : 0,
      ownBatchBytesTotal: bw.ownBatchPayloadBytes,
      ownBatchAvgBytes: stats.ownBatch > 0 ? Math.round(bw.ownBatchPayloadBytes / stats.ownBatch) : 0,
      combatBytesTotal: bw.combatPayloadBytes,
      combatAvgBytes: stats.combatFrames > 0 ? Math.round(bw.combatPayloadBytes / stats.combatFrames) : 0,
      snapBytesTotal: bw.snapPayloadBytes,
      snapAvgBytes: stats.snapFrames > 0 ? Math.round(bw.snapPayloadBytes / stats.snapFrames) : 0,
      errorBytesTotal: bw.errorPayloadBytes,
      otherBytesTotal: bw.otherPayloadBytes,
    },
    osCounters: {
      note: bw.os.note,
      lastTcpSegSentPerSec: bw.os.lastTcpSegSent,
      lastTcpSegRecvPerSec: bw.os.lastTcpSegRecv,
      lastNicSentBps: samples.length ? samples[samples.length - 1].nicSentBps : null,
      lastNicRecvBps: samples.length ? samples[samples.length - 1].nicRecvBps : null,
    },
    bytesPerAction: {
      actionsProcessed,
      // server egress ≈ bytes clients received during steady (server→client)
      serverEgressPerAction: actionsProcessed > 0 ? Math.round(bw.steadyRecvBytes / actionsProcessed) : 0,
      // server ingress ≈ bytes clients sent during steady (client→server)
      serverIngressPerAction: actionsProcessed > 0 ? Math.round(bw.steadySentBytes / actionsProcessed) : 0,
      totalBytesPerAction: actionsProcessed > 0 ? Math.round((bw.steadySentBytes + bw.steadyRecvBytes) / actionsProcessed) : 0,
    },
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    config: {
      url: WS_URL,
      room: ROOM_NAME,
      protocol: PROTOCOL,
      totalBots: TOTAL_BOTS,
      workerId: isWorker ? WORKER_ID : null,
      schools: SCHOOL_IDS,
      durationSec: DURATION_SEC,
      actionsPerSecTarget: ACTIONS_PER_SEC,
      rampBatch: RAMP_BATCH,
      rampDelayMs: RAMP_DELAY_MS,
      joinPoints: JOIN_POINTS,
    },
    results: {
      serverPid,
      rampMs: stats.rampMs,
      steadyMs,
      steadySec: Math.round(steadyMs / 100) / 10,
      joinsOk: stats.joinsOk,
      joinsFail: stats.joinsFail,
      joinErrors: stats.joinErrors,
      maxConcurrentAchieved: stats.joinsOk,
      disconnects: stats.disconnects,
      roomErrors: stats.roomErrors,
      roomErrorCodes: stats.roomErrorCodes,
      leaveOk: stats.leaveOk,
      messagesSent: stats.msgsSent,
      sentByOp: stats.sentByOp,
      actionsPerSecActual: Math.round((stats.msgsSent / (steadyMs / 1000)) * 100) / 100,
      actionsPerSecPerBot: Math.round((stats.msgsSent / (steadyMs / 1000) / Math.max(1, stats.joinsOk)) * 1000) / 1000,
      acksOk: stats.acksOk,
      acksErr: stats.acksErr,
      ackErrReasons: stats.ackErrReasons,
      errorMessages: stats.errorMessages,
      ownBatchFrames: stats.ownBatch,
      combatFrames: stats.combatFrames,
      snapFrames: stats.snapFrames,
      landOtherFrames: stats.landOther,
      sendErrors: stats.sendErrors,
      cpu: {
        cores,
        avgPct: Math.round(cpuAvg * 100) / 100,
        maxPct: Math.round((cpuPcts.length ? Math.max(...cpuPcts) : 0) * 100) / 100,
        p95Pct: Math.round(percentile(cpuPcts, 95) * 100) / 100,
        overallPct: Math.round(overallCpuPct * 100) / 100,
        cpuSecUsed: Math.round(cpuSecUsed * 1000) / 1000,
        wallSec: Math.round(wallSec * 100) / 100,
        baselineCpuSec: base ? base.CpuSec : null,
        finalCpuSec: finalS ? finalS.CpuSec : null,
      },
      ramMB: {
        wsStart: base ? fmtMB(base.WS) : null,
        wsAvg: Math.round(wsAvg * 10) / 10,
        wsMax: wsMBs.length ? Math.max(...wsMBs) : null,
        wsEnd: finalS ? fmtMB(finalS.WS) : null,
        privStart: base ? fmtMB(base.Priv) : null,
        privAvg: Math.round(privAvg * 10) / 10,
        privMax: privMBs.length ? Math.max(...privMBs) : null,
        privEnd: finalS ? fmtMB(finalS.Priv) : null,
      },
      sampleCount: samples.length,
      bandwidth,
    },
    hqs,
    notes: [
      "Actions sent on Colyseus channel 'land' with frames {t:'claim'|'fortify',x,y} (shared/land/protocol.ts).",
      "Acks arrive on 'land' as {t:'ack',...}; own_batch/combat also counted.",
      "Each bot claimed/fortified tiles within ±30 of its school HQ.",
      `Personal troops granted on join: ${JOIN_POINTS} so claim costs do not starve the load.`,
      "Bandwidth: client WS bytes via WebSocketTransport instrumentation; server IO via process counters (includes disk).",
    ],
  };

  // CSV
  const csvHeader =
    "iso,cpu_pct,cpu_sec,ws_mb,priv_mb,threads,joins_ok,actions_total,acks_ok,acks_err,disconnects,live_bots," +
    "client_sent_bps,client_recv_bps,client_sent_mbps,client_recv_mbps,client_sent_bytes,client_recv_bytes," +
    "steady_sent_bytes,steady_recv_bytes,io_read_bps,io_write_bps,io_data_bps,io_read_mbps,io_write_mbps,io_data_mbps," +
    "io_read_delta,io_write_delta,io_other_delta,io_data_delta,tcp_seg_sent,tcp_seg_recv,nic_sent_bps,nic_recv_bps,sockets_wrapped\n";
  const csvBody = samples
    .map(
      (s) =>
        `${s.iso},${s.cpuPct},${s.cpuSec},${s.wsMB},${s.privMB},${s.threads},${s.joinsOk},${s.actionsTotal},${s.acksOk},${s.acksErr},${s.disconnects},${s.liveBots},` +
        `${s.clientSentBps},${s.clientRecvBps},${s.clientSentMBps},${s.clientRecvMBps},${s.clientSentBytes},${s.clientRecvBytes},` +
        `${s.steadySentBytes},${s.steadyRecvBytes},${s.ioReadBps},${s.ioWriteBps},${s.ioDataBps},${s.ioReadMBps},${s.ioWriteMBps},${s.ioDataMBps},` +
        `${s.ioReadDelta},${s.ioWriteDelta},${s.ioOtherDelta},${s.ioDataDelta},${s.tcpSegSent},${s.tcpSegRecv},${s.nicSentBps},${s.nicRecvBps},${s.socketsWrapped}`
    )
    .join("\n");
  writeFileSync(csvPath, csvHeader + csvBody + "\n");
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  say("===== SUMMARY =====");
  say(JSON.stringify(summary.results, null, 2));
  say(`csv=${csvPath}`);
  say(`json=${jsonPath}`);
  say(`log=${logPath}`);

  // Pretty print for the parent agent
  const r = summary.results;
  console.log("\n========== BENCH SUMMARY ==========");
  console.log(`Duration (steady): ${r.steadySec}s (ramp ${r.rampMs}ms)`);
  console.log(`Bots: ${r.joinsOk} joined / ${TOTAL_BOTS} target (fail ${r.joinsFail}, disconnects ${r.disconnects})`);
  console.log(`Actions: ${r.messagesSent} total, ${r.actionsPerSecActual}/s overall, ${r.actionsPerSecPerBot}/s/bot`);
  console.log(`Sent claim=${r.sentByOp.claim} fortify=${r.sentByOp.fortify} | sendErrors=${r.sendErrors}`);
  console.log(`Acks: ok=${r.acksOk} err=${r.acksErr} reasons=${JSON.stringify(r.ackErrReasons)}`);
  console.log(`Legacy error msgs: ${r.errorMessages} | other server msgs: ${r.landOtherFrames}`);
  console.log(`Frames: own_batch=${r.ownBatchFrames} combat=${r.combatFrames} snap=${r.snapFrames}`);
  console.log(
    `Bandwidth steady: c→s ${r.bandwidth?.clientWebSocket?.steady?.clientToServerMB}MB (${r.bandwidth?.clientWebSocket?.steady?.avgMBpsClientToServer}MB/s avg, peak ${r.bandwidth?.clientWebSocket?.steady?.peakMBpsClientToServer}MB/s)`
  );
  console.log(
    `                 s→c ${r.bandwidth?.clientWebSocket?.steady?.serverToClientMB}MB (${r.bandwidth?.clientWebSocket?.steady?.avgMBpsServerToClient}MB/s avg, peak ${r.bandwidth?.clientWebSocket?.steady?.peakMBpsServerToClient}MB/s)`
  );
  console.log(
    `Server IO steady: read ${r.bandwidth?.serverProcessIO?.steadyWindowSum?.ioReadMB}MB write ${r.bandwidth?.serverProcessIO?.steadyWindowSum?.ioWriteMB}MB data ${r.bandwidth?.serverProcessIO?.steadyWindowSum?.ioDataMB}MB`
  );
  console.log(
    `Bytes/action: egress ${r.bandwidth?.bytesPerAction?.serverEgressPerAction} ingress ${r.bandwidth?.bytesPerAction?.serverIngressPerAction} total ${r.bandwidth?.bytesPerAction?.totalBytesPerAction}`
  );
  console.log(
    `Avg frame payload (JSON est): action ${r.bandwidth?.appPayloadEstimate?.actionAvgBytes}B ack ${r.bandwidth?.appPayloadEstimate?.ackAvgBytes}B own_batch ${r.bandwidth?.appPayloadEstimate?.ownBatchAvgBytes}B combat ${r.bandwidth?.appPayloadEstimate?.combatAvgBytes}B snap ${r.bandwidth?.appPayloadEstimate?.snapAvgBytes}B`
  );
  console.log(`CPU% (of ${r.cpu.cores} cores): avg=${r.cpu.avgPct} max=${r.cpu.maxPct} p95=${r.cpu.p95Pct} overall=${r.cpu.overallPct}`);
  console.log(
    `RAM MB WS: start=${r.ramMB.wsStart} avg=${r.ramMB.wsAvg} max=${r.ramMB.wsMax} end=${r.ramMB.wsEnd}`
  );
  console.log(
    `RAM MB Priv: start=${r.ramMB.privStart} avg=${r.ramMB.privAvg} max=${r.ramMB.privMax} end=${r.ramMB.privEnd}`
  );
  console.log(`Protocol used: ${PROTOCOL} channel/message`);
  console.log(`CSV: ${csvPath}`);
  console.log(`JSON: ${jsonPath}`);
  console.log("===================================\n");

  log.end();
  // Give streams a moment, then exit cleanly so sockets close.
  setTimeout(() => process.exit(0), 500);
}

// Absolute failsafe: never hang the bench process (leave() / timers).
setTimeout(() => {
  console.error("BENCH TIMEOUT FAILSAFE — exiting");
  process.exit(2);
}, 10 * 60 * 1000).unref();

async function runParent() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const parentLog = path.join(OUT_DIR, `bench-landstate-parent-${stamp}.log`);
  const log = createWriteStream(parentLog, { flags: "a" });
  const say = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    if (!log.writableEnded) log.write(line + "\n");
  };

  const botsPerWorker = Math.ceil(TOTAL_BOTS / WORKERS);
  // Shared start: now + ramp allowance so workers finish joins first.
  const startAt = Date.now() + 90_000;
  say(`parent: spawning ${WORKERS} workers × ${botsPerWorker} bots, shared START_AT=${new Date(startAt).toISOString()}`);

  const children = [];
  for (let w = 0; w < WORKERS; w++) {
    const env = {
      ...process.env,
      BENCH_WORKER: String(w),
      BOTS: String(botsPerWorker),
      WORKERS: "1",
      START_AT: String(startAt),
      NO_SAMPLE: w === 0 ? "0" : "1",
      OUT_DIR: OUT_DIR,
    };
    children.push(
      new Promise((resolve) => {
        const child = execFile(
          process.execPath,
          [fileURLToPath(import.meta.url)],
          { env, timeout: 15 * 60 * 1000, windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
          (err, stdout, stderr) => {
            if (stdout) process.stdout.write(stdout);
            if (stderr) process.stderr.write(stderr);
            resolve({ err: err ? String(err.message || err) : null, w });
          }
        );
        child.on("exit", () => {});
      })
    );
  }

  const results = await Promise.all(children);
  say(`parent: all workers done ${JSON.stringify(results)}`);

  // Merge worker JSON summaries (newest per worker id).
  const { readdirSync, readFileSync } = await import("node:fs");
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith("bench-landstate-worker") && f.endsWith(".json"))
    .map((f) => path.join(OUT_DIR, f))
    .sort();
  const byWorker = new Map();
  for (const f of files) {
    try {
      const j = JSON.parse(readFileSync(f, "utf8"));
      const id = j.config?.workerId ?? 0;
      byWorker.set(id, j);
    } catch {
      /* skip */
    }
  }

  const workerSummaries = [...byWorker.values()].sort((a, b) => (a.config.workerId || 0) - (b.config.workerId || 0));
  const sum = (fn) => workerSummaries.reduce((a, s) => a + (fn(s) || 0), 0);
  const maxOf = (fn) => workerSummaries.reduce((a, s) => Math.max(a, fn(s) || 0), 0);

  const cpuFromSampler = workerSummaries.find((s) => s.results?.cpu?.sampleCount > 0)?.results?.cpu || null;

  // ---- merge bandwidth across workers (client WS totals sum; IO from sampler worker) ----
  const sumBw = (pathFn) => workerSummaries.reduce((a, s) => a + (pathFn(s) || 0), 0);
  const maxBw = (pathFn) => workerSummaries.reduce((a, s) => Math.max(a, pathFn(s) || 0), 0);
  const samplerWorker = workerSummaries.find((s) => s.results?.cpu?.sampleCount > 0) || workerSummaries[0];
  const steadySecMerged = maxOf((s) => s.results?.steadySec) || 0;
  const mergedSteadySent = sumBw((s) => s.results?.bandwidth?.clientWebSocket?.steady?.clientToServerBytes);
  const mergedSteadyRecv = sumBw((s) => s.results?.bandwidth?.clientWebSocket?.steady?.serverToClientBytes);
  const mergedActions = sum((s) => s.results?.messagesSent);
  const mergedBandwidth = {
    measurementNotes: [
      "Multi-process: each worker instruments its own bot WebSockets; totals are sums across workers.",
      "Server process IO is sampled by the worker with NO_SAMPLE=0 only (avoid double-counting).",
      "localhost WS — physical NIC counters will not show this traffic.",
    ],
    clientWebSocket: {
      socketsWrapped: sumBw((s) => s.results?.bandwidth?.clientWebSocket?.socketsWrapped),
      lifetime: {
        sentBytes: sumBw((s) => s.results?.bandwidth?.clientWebSocket?.lifetime?.sentBytes),
        recvBytes: sumBw((s) => s.results?.bandwidth?.clientWebSocket?.lifetime?.recvBytes),
        sentMsgs: sumBw((s) => s.results?.bandwidth?.clientWebSocket?.lifetime?.sentMsgs),
        recvMsgs: sumBw((s) => s.results?.bandwidth?.clientWebSocket?.lifetime?.recvMsgs),
        sentMB: Math.round((sumBw((s) => s.results?.bandwidth?.clientWebSocket?.lifetime?.sentBytes) / (1024 * 1024)) * 100) / 100,
        recvMB: Math.round((sumBw((s) => s.results?.bandwidth?.clientWebSocket?.lifetime?.recvBytes) / (1024 * 1024)) * 100) / 100,
      },
      steady: {
        windowSec: steadySecMerged,
        clientToServerBytes: mergedSteadySent,
        serverToClientBytes: mergedSteadyRecv,
        clientToServerMB: Math.round((mergedSteadySent / (1024 * 1024)) * 100) / 100,
        serverToClientMB: Math.round((mergedSteadyRecv / (1024 * 1024)) * 100) / 100,
        clientToServerMsgs: sumBw((s) => s.results?.bandwidth?.clientWebSocket?.steady?.clientToServerMsgs),
        serverToClientMsgs: sumBw((s) => s.results?.bandwidth?.clientWebSocket?.steady?.serverToClientMsgs),
        avgMBpsClientToServer: steadySecMerged > 0 ? Math.round((mergedSteadySent / (1024 * 1024) / steadySecMerged) * 1000) / 1000 : 0,
        avgMBpsServerToClient: steadySecMerged > 0 ? Math.round((mergedSteadyRecv / (1024 * 1024) / steadySecMerged) * 1000) / 1000 : 0,
        peakMBpsClientToServer: Math.round(maxBw((s) => s.results?.bandwidth?.clientWebSocket?.steady?.peakMBpsClientToServer) * 1000) / 1000,
        peakMBpsServerToClient: Math.round(maxBw((s) => s.results?.bandwidth?.clientWebSocket?.steady?.peakMBpsServerToClient) * 1000) / 1000,
      },
    },
    serverProcessIO: samplerWorker?.results?.bandwidth?.serverProcessIO || null,
    appPayloadEstimate: {
      actionAvgBytes: sumBw((s) => s.results?.bandwidth?.appPayloadEstimate?.actionBytesTotal) > 0
        ? Math.round(sumBw((s) => s.results?.bandwidth?.appPayloadEstimate?.actionBytesTotal) / Math.max(1, mergedActions))
        : 0,
      ackAvgBytes: sumBw((s) => s.results?.bandwidth?.appPayloadEstimate?.ackBytesTotal),
      ownBatchAvgBytes: sumBw((s) => s.results?.bandwidth?.appPayloadEstimate?.ownBatchAvgBytes),
      combatAvgBytes: sumBw((s) => s.results?.bandwidth?.appPayloadEstimate?.combatAvgBytes),
      snapAvgBytes: sumBw((s) => s.results?.bandwidth?.appPayloadEstimate?.snapAvgBytes),
      actionBytesTotal: sumBw((s) => s.results?.bandwidth?.appPayloadEstimate?.actionBytesTotal),
      ownBatchBytesTotal: sumBw((s) => s.results?.bandwidth?.appPayloadEstimate?.ownBatchBytesTotal),
      combatBytesTotal: sumBw((s) => s.results?.bandwidth?.appPayloadEstimate?.combatBytesTotal),
      snapBytesTotal: sumBw((s) => s.results?.bandwidth?.appPayloadEstimate?.snapBytesTotal),
    },
    bytesPerAction: {
      actionsProcessed: mergedActions,
      serverEgressPerAction: mergedActions > 0 ? Math.round(mergedSteadyRecv / mergedActions) : 0,
      serverIngressPerAction: mergedActions > 0 ? Math.round(mergedSteadySent / mergedActions) : 0,
      totalBytesPerAction: mergedActions > 0 ? Math.round((mergedSteadySent + mergedSteadyRecv) / mergedActions) : 0,
    },
  };

  const merged = {
    generatedAt: new Date().toISOString(),
    mode: `multi-process x${WORKERS}`,
    config: {
      url: WS_URL,
      room: ROOM_NAME,
      protocol: PROTOCOL,
      totalBots: TOTAL_BOTS,
      workers: WORKERS,
      durationSec: DURATION_SEC,
      actionsPerSecTarget: ACTIONS_PER_SEC,
    },
    results: {
      joinsOk: sum((s) => s.results?.joinsOk),
      joinsFail: sum((s) => s.results?.joinsFail),
      maxConcurrentAchieved: sum((s) => s.results?.maxConcurrentAchieved),
      disconnects: sum((s) => s.results?.disconnects),
      roomErrors: sum((s) => s.results?.roomErrors),
      messagesSent: sum((s) => s.results?.messagesSent),
      actionsPerSecActual: sum((s) => s.results?.actionsPerSecActual),
      acksOk: sum((s) => s.results?.acksOk),
      acksErr: sum((s) => s.results?.acksErr),
      errorMessages: sum((s) => s.results?.errorMessages),
      ownBatchFrames: sum((s) => s.results?.ownBatchFrames),
      combatFrames: sum((s) => s.results?.combatFrames),
      snapFrames: sum((s) => s.results?.snapFrames),
      sendErrors: sum((s) => s.results?.sendErrors),
      cpu: cpuFromSampler,
      ramMB: cpuFromSampler ? workerSummaries.find((s) => s.results?.cpu?.sampleCount > 0)?.results?.ramMB : null,
      steadySec: maxOf((s) => s.results?.steadySec),
      rampMs: maxOf((s) => s.results?.rampMs),
      bandwidth: mergedBandwidth,
    },
    workers: workerSummaries.map((s) => ({
      workerId: s.config?.workerId,
      joinsOk: s.results?.joinsOk,
      joinsFail: s.results?.joinsFail,
      messagesSent: s.results?.messagesSent,
      acksOk: s.results?.acksOk,
      acksErr: s.results?.acksErr,
      disconnects: s.results?.disconnects,
      actionsPerSecActual: s.results?.actionsPerSecActual,
      steadySentMB: s.results?.bandwidth?.clientWebSocket?.steady?.clientToServerMB,
      steadyRecvMB: s.results?.bandwidth?.clientWebSocket?.steady?.serverToClientMB,
    })),
    notes: [
      "Multi-process load gen: colyseus.js schema decode of a large shared GameState cannot hold 500 sockets on one Node event loop.",
      "CPU/RAM sampled by worker 0 against the server PID (port 2567).",
      "Bandwidth: client WS bytes summed across workers; server IO from sampler worker only.",
    ],
  };

  const mergedPath = path.join(OUT_DIR, `bench-landstate-MERGED-${stamp}.json`);
  writeFileSync(mergedPath, JSON.stringify(merged, null, 2));
  say(`merged=${mergedPath}`);
  console.log("\n========== MERGED BENCH SUMMARY ==========");
  console.log(JSON.stringify(merged.results, null, 2));
  console.log(`MERGED JSON: ${mergedPath}`);
  console.log("==========================================\n");
  log.end();
  setTimeout(() => process.exit(0), 300);
}

const isWorker = WORKER_ID != null;
if (!isWorker && WORKERS > 1) {
  runParent().catch((e) => {
    console.error("PARENT FATAL:", e);
    process.exit(1);
  });
} else {
  main().catch((e) => {
    console.error("BENCH FATAL:", e);
    process.exit(1);
  });
}
