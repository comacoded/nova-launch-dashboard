/* ============================================================
   NOVA LAUNCH — mission simulation
   Auto-running launch: terminal countdown -> liftoff -> ascent
   -> staging -> orbit insertion, then holds and loops.
   ============================================================ */

const $ = (id) => document.getElementById(id);

const COUNTDOWN = 5;       // seconds of terminal count before liftoff
const ORBIT_HOLD = 12;     // seconds to hold on orbit before reset

/* ---- Flight profile keyframes (t = seconds after liftoff) ----
   Values chosen to read like a real LEO ascent (faithful shape:
   rising altitude/velocity, a Max-Q bump, MECO dip, second-stage
   burn, SECO into orbit). */
const KF = [
  // t,    alt(km), vel(m/s), dr(km), q(kPa), g,   acc(m/s2)
  [0,      0.0,     0,        0,      0,      1.2, 12],
  [10,     0.6,     95,       0.1,    9,      1.5, 15],
  [30,     4.2,     390,      1.2,    28,     2.0, 20],
  [50,     10.5,    640,      4.0,    33,     2.5, 25],   // Max-Q
  [70,     17.5,    980,      9.5,    22,     2.9, 29],
  [95,     30.0,    1640,     26,     9,      3.3, 33],
  [120,    47.0,    2480,     58,     2.4,    3.6, 36],   // peak G/accel S1
  [148,    66.0,    3180,     118,    0.4,    1.0, 9],    // MECO
  [156,    70.0,    3210,     138,    0.05,   0.2, 2],    // stage sep / coast
  [170,    77.0,    3520,     168,    0,      0.9, 9],    // S2 ignition
  [185,    88.0,    4100,     215,    0,      1.1, 11],   // fairing jettison
  [215,    118.0,   5300,     360,    0,      1.4, 14],
  [255,    165.0,   6750,     680,    0,      1.7, 17],
  [288,    205.0,   7650,     1080,   0,      1.9, 19],
  [300,    420.0,   7790,     1300,   0,      0.4, 3],    // SECO target alt circularized
];
const FLIGHT_END = KF[KF.length - 1][0];

/* ---- Mission events (timeline + log + state changes) ---- */
const EVENTS = [
  { t: -COUNTDOWN, code: "TERMINAL COUNTDOWN", label: "Terminal Countdown" },
  { t: 0,    code: "LIFTOFF",            label: "Liftoff" },
  { t: 12,   code: "TOWER CLEARED",      label: "Tower Cleared" },
  { t: 50,   code: "MAX-Q",              label: "Max-Q" },
  { t: 95,   code: "THROTTLE UP",        label: "Throttle Up" },
  { t: 148,  code: "MECO",               label: "MECO" },
  { t: 156,  code: "STAGE SEPARATION",   label: "Stage 1 Separation" },
  { t: 170,  code: "STAGE 2 IGNITION",   label: "Stage 2 Ignition" },
  { t: 185,  code: "FAIRING JETTISON",   label: "Fairing Jettison" },
  { t: 300,  code: "SECO / ORBIT",       label: "Orbit Insertion" },
];

const SYSTEMS = [
  "Main Engine", "Guidance", "Avionics", "Thermal",
  "Comms", "Power", "Navigation", "Life Support",
];

/* ---------- build static DOM ---------- */
function buildEngines() {
  const grid = $("engineGrid");
  grid.innerHTML = "";
  for (let i = 1; i <= 9; i++) {
    const el = document.createElement("div");
    el.className = "eng";
    el.textContent = i;
    el.dataset.idx = i;
    grid.appendChild(el);
  }
}

function buildSystems() {
  const list = $("sysList");
  list.innerHTML = "";
  SYSTEMS.forEach((name) => {
    const row = document.createElement("div");
    row.className = "sys-row";
    row.innerHTML = `<span class="sys-name"><span class="dot dot-green"></span>${name}</span><span class="sys-state">NOMINAL</span>`;
    list.appendChild(row);
  });
}

function buildTimeline() {
  const tl = $("timeline");
  tl.innerHTML = "";
  EVENTS.forEach((e, i) => {
    const item = document.createElement("div");
    item.className = "tl-item";
    item.dataset.idx = i;
    item.innerHTML =
      `<div class="tl-time">${fmtClock(e.t)}</div>` +
      `<div class="tl-body"><span class="tl-dot"></span><span class="tl-label">${e.label}</span></div>`;
    tl.appendChild(item);
  });
}

function buildCharts() {
  ["chart-alt", "chart-vel"].forEach((id, k) => {
    const c = $(id);
    c.className = "chart " + (k === 0 ? "alt" : "vel");
    c.innerHTML = "";
    for (let i = 0; i < 40; i++) {
      const b = document.createElement("div");
      b.className = "col-bar";
      c.appendChild(b);
    }
  });
}

function buildSignals() {
  document.querySelectorAll(".signal").forEach((s) => {
    const bars = parseInt(s.dataset.bars || "4", 10);
    s.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const b = document.createElement("span");
      b.style.cssText =
        `width:3px;border-radius:1px;height:${(i + 1) * 25}%;` +
        `background:${i < bars ? "var(--green)" : "var(--border-2)"};`;
      s.appendChild(b);
    }
  });
}

/* ---------- helpers ---------- */
function fmtClock(t) {
  const sign = t < 0 ? "-" : "+";
  const a = Math.abs(Math.floor(t));
  const h = String(Math.floor(a / 3600)).padStart(2, "0");
  const m = String(Math.floor((a % 3600) / 60)).padStart(2, "0");
  const s = String(a % 60).padStart(2, "0");
  return `T${sign}${h}:${m}:${s}`;
}
function clockShort(t) {
  const a = Math.abs(Math.floor(t));
  const h = String(Math.floor(a / 3600)).padStart(2, "0");
  const m = String(Math.floor((a % 3600) / 60)).padStart(2, "0");
  const s = String(a % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
// piecewise-linear interpolation over keyframes
function interp(t, col) {
  if (t <= KF[0][0]) return KF[0][col];
  for (let i = 1; i < KF.length; i++) {
    if (t <= KF[i][0]) {
      const [t0, t1] = [KF[i - 1][0], KF[i][0]];
      const f = (t - t0) / (t1 - t0);
      return KF[i - 1][col] + (KF[i][col] - KF[i - 1][col]) * f;
    }
  }
  return KF[KF.length - 1][col];
}
function fmt(n, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/* ---------- chart fill ---------- */
function paintChart(id, col, maxVal) {
  const bars = $(id).children;
  const n = bars.length;
  for (let i = 0; i < n; i++) {
    const tt = (i / (n - 1)) * FLIGHT_END;
    const v = interp(tt, col);
    bars[i].style.height = Math.max(2, (v / maxVal) * 100) + "%";
    bars[i].classList.toggle("on", tt <= state.t);
  }
}

/* ---------- state ---------- */
// optional seek for review/demo: #t=120 starts the clock at T+120s
const seek = parseFloat((location.hash.match(/t=(-?\d+\.?\d*)/) || [])[1]);
const state = {
  t: Number.isFinite(seek) ? seek : -COUNTDOWN,
  phase: Number.isFinite(seek) && seek >= 0 ? "flight" : "count",
  holdUntil: 0,
};
let lastEventIdx = -1;

/* ---------- per-frame update ---------- */
function setText(id, v) { const el = $(id); if (el) el.textContent = v; }
function setWidth(id, pct) { const el = $(id); if (el) el.style.width = Math.max(0, Math.min(100, pct)) + "%"; }

function update() {
  const t = state.t;

  // --- countdown / clock ---
  $("countdown").textContent = clockShort(t);
  $("countdown").classList.toggle("is-counting", t < 0);
  if (t < 0) {
    $("countLabel").textContent = "T-MINUS";
    $("countPhase").textContent = "TERMINAL COUNTDOWN";
    setWidth("countFill", ((COUNTDOWN + t) / COUNTDOWN) * 100);
  } else {
    $("countLabel").textContent = "MISSION ELAPSED";
    $("countPhase").textContent = state.phase === "orbit" ? "ORBIT ACHIEVED" : "POWERED FLIGHT";
    setWidth("countFill", (t / FLIGHT_END) * 100);
  }
  $("footClock").textContent = fmtClock(t);

  // --- telemetry metrics ---
  const tc = Math.max(0, t);
  const alt = interp(tc, 1), vel = interp(tc, 2), dr = interp(tc, 3),
        q = interp(tc, 4), g = interp(tc, 5), acc = interp(tc, 6);
  setText("m-alt", fmt(alt));
  setText("m-vel", fmt(vel));
  setText("m-dr", fmt(dr));
  setText("m-q", fmt(q));
  setText("m-g", fmt(g, 1));
  setText("m-acc", fmt(acc, 1));

  // hot-state highlight on Max-Q dynamic pressure
  $("m-q").closest(".metric").classList.toggle("is-hot", q > 25);

  // --- propellant + thrust gauges ---
  const burning1 = t >= 0 && t < 148;
  const burning2 = t >= 170 && t < 300;
  // stage 1 props deplete 100->4 over its burn
  const s1p = t < 0 ? 100 : t >= 148 ? Math.max(3, 100 - (148 / 148) * 96) : 100 - (t / 148) * 96;
  const s1lox = t < 0 ? 100 : t >= 148 ? Math.max(5, 100 - (t / 148) * 93) : 100 - (t / 148) * 93;
  const s2start = 170, s2end = 300;
  const s2p = t < s2start ? 100 : t >= s2end ? Math.max(8, 100 - 88) : 100 - ((t - s2start) / (s2end - s2start)) * 88;
  const s2lox = t < s2start ? 100 : t >= s2end ? Math.max(10, 100 - 85) : 100 - ((t - s2start) / (s2end - s2start)) * 85;
  const thrust = burning1 ? 92 + Math.sin(t) * 4 : burning2 ? 78 + Math.sin(t) * 3 : 0;
  const chamber = burning1 ? 88 : burning2 ? 72 : 0;

  setText("g-s1fuel", fmt(s1p, 1)); setWidth("b-s1fuel", s1p);
  setText("g-s1lox", fmt(s1lox, 1)); setWidth("b-s1lox", s1lox);
  setText("g-s2fuel", fmt(s2p, 1)); setWidth("b-s2fuel", s2p);
  setText("g-s2lox", fmt(s2lox, 1)); setWidth("b-s2lox", s2lox);
  setText("g-thrust", fmt(thrust, 1)); setWidth("b-thrust", thrust);
  setText("g-chamber", fmt(chamber, 1)); setWidth("b-chamber", chamber);

  // --- engines ---
  const engs = $("engineGrid").children;
  for (let i = 0; i < 9; i++) {
    engs[i].className = "eng";
    if (burning1) engs[i].classList.add("burning");
    else if (t >= 148 && t < 170) engs[i].classList.add("cut");
    else if (burning2) { i === 4 ? engs[i].classList.add("burning") : engs[i].classList.add("cut"); }
    else if (t >= 300) engs[i].classList.add("cut");
  }
  const activeCount = burning1 ? 9 : burning2 ? 1 : 0;
  setText("engineMode", activeCount + " ACTIVE");
  const totalThrust = burning1 ? 22.8 + Math.sin(t) * 0.6 : burning2 ? 2.1 : 0;
  setText("engineThrust", fmt(totalThrust, 1) + " MN");

  // --- stage status ---
  const st1 = $("stage1State"), st2 = $("stage2State");
  function setStage(el, label, cls) { el.textContent = label; el.className = "stage-state " + cls; }
  if (t < 0) { setStage(st1, "ARMED", "armed"); setStage(st2, "STANDBY", "standby"); }
  else if (burning1) { setStage(st1, "BURNING", "burning"); setStage(st2, "STANDBY", "standby"); }
  else if (t >= 148 && t < 170) { setStage(st1, "SEPARATED", "separated"); setStage(st2, "ARMED", "armed"); }
  else if (burning2) { setStage(st1, "SPENT", "spent"); setStage(st2, "BURNING", "burning"); }
  else if (t >= 300) { setStage(st1, "SPENT", "spent"); setStage(st2, "ORBIT", "orbit"); }
  setText("stage1Temp", (burning1 ? Math.round(3100 + Math.sin(t) * 40) : t < 0 ? 205 : 60) + "°C");
  setText("stage2Temp", (burning2 ? Math.round(2950 + Math.sin(t) * 35) : 18) + "°C");

  // --- system pill ---
  const pill = $("systemPill"), pillText = $("systemPillText");
  const dot = pill.querySelector(".dot");
  if (t < 0) { pillText.textContent = "TERMINAL COUNT"; dot.className = "dot dot-orange"; }
  else if (state.phase === "orbit") { pillText.textContent = "ORBIT ACHIEVED"; dot.className = "dot dot-green"; }
  else { pillText.textContent = "ASCENT NOMINAL"; dot.className = "dot dot-green"; }

  // --- timeline highlight ---
  const tlItems = $("timeline").children;
  let curEvt = 0;
  EVENTS.forEach((e, i) => { if (t >= e.t) curEvt = i; });
  for (let i = 0; i < tlItems.length; i++) {
    tlItems[i].className = "tl-item " + (i < curEvt ? "done" : i === curEvt ? "active" : "");
  }
  $("footEvent").textContent =
    t < 0 ? "PROPELLANT LOADING COMPLETE" : EVENTS[curEvt].code;

  // --- charts (alt col=1 max 420, vel col=2 max 7800) ---
  paintChart("chart-alt", 1, 420);
  paintChart("chart-vel", 2, 7800);
}

/* ---------- main loop ---------- */
let last = null;
function tick(ts) {
  if (last === null) last = ts;
  const dt = Math.min(0.1, (ts - last) / 1000);
  last = ts;

  if (state.phase === "count" || state.phase === "flight") {
    state.t += dt;
    if (state.t >= 0 && state.phase === "count") state.phase = "flight";
    if (state.t >= FLIGHT_END) {
      state.t = FLIGHT_END;
      state.phase = "orbit";
      state.holdUntil = ts + ORBIT_HOLD * 1000;
    }
  } else if (state.phase === "orbit") {
    if (ts >= state.holdUntil) {
      // reset and loop
      state.t = -COUNTDOWN;
      state.phase = "count";
    }
  }

  update();
  requestAnimationFrame(tick);
}

/* ---------- nav (clickable shell) ---------- */
function initNav() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });
}

/* ---------- staggered load-in ---------- */
function revealWidgets() {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // document-order list of every top-level widget
  const targets = document.querySelectorAll(".topbar, .col .card, .metric, .footer");
  targets.forEach((el, i) => {
    el.classList.add("reveal");
    el.style.animationDelay = (i * 45) + "ms";
  });
}

/* ---------- boot ---------- */
buildEngines();
buildSystems();
buildTimeline();
buildCharts();
buildSignals();
initNav();
revealWidgets();
requestAnimationFrame(tick);
