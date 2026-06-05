/**
 * Renderer UI. Wires the DOM (see index.html) to the Garage Copilot engine.
 *
 * Connection is either a real OBD-II dongle over Web Serial, or a built-in Demo
 * (replay) adapter so the whole GUI is usable with no hardware. Everything the
 * UI shows comes from the same tested engine the CLI uses — this file only does
 * DOM glue. The app is read-only: it never clears codes or writes to the ECU.
 */

import {
  Elm327Client,
  SimulatedObdReader,
  runDiagnosticSession,
  buildReport,
  analyzeTrends,
  assessFinalDriveChange,
  assessInjectorsForTarget,
  assessAddedElectricalLoad,
  PID_FORMULAS,
  convertUnit,
  decodeVin,
  type ObdReader,
  type Assessment,
  type TimedSample,
  type UnitSystem,
  type VinDecode,
  type DiagnosticSnapshot
} from "./core.js";
import { WebSerialTransport } from "./web-serial.js";
import { toCsv, lineSeverityClass, dtcSearchUrl, dtcCodeInLine, boundedPush } from "./format.js";
import type { SerialPortInfo, HistoryRecord } from "../shared/ipc.js";

// ---- tiny DOM helpers -------------------------------------------------------
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};
const numFrom = (id: string): number => Number($<HTMLInputElement>(id).value);
const show = (el: HTMLElement, visible: boolean): void => {
  el.hidden = !visible;
};

// ---- connection state -------------------------------------------------------
type Connection = { client: ObdReader; label: string; demo: boolean };
let conn: Connection | null = null;
let unitSystem: UnitSystem = "metric";
let lastSnapshot: DiagnosticSnapshot | null = null;
let lastLabel: string | undefined;
let liveTimer: number | null = null;
let liveSamples: TimedSample[] = [];
type Zone = "ok" | "watch" | "warn";
type LiveCard = { card: HTMLElement; numEl: HTMLElement; unitEl: HTMLElement; canvas: HTMLCanvasElement };
type HeroGauge = { canvas: HTMLCanvasElement; value: number; unit?: string };
const liveCards = new Map<string, LiveCard>();
const heroCards = new Map<string, HeroGauge>();
const liveHistory = new Map<string, number[]>();

/** Instrument-cluster palette + fonts, mirrored for <canvas> (CSS can't reach it). */
const COLORS = {
  text: "#eef2f8",
  muted: "#93a0b4",
  track: "#222c39",
  live: "#28d8ff",
  accent: "#ff7a18",
  ok: "#3ad17a",
  watch: "#ffb02e",
  warn: "#ff5142",
  redline: "#ff2a2a"
} as const;
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const COND = '"Bahnschrift", "DIN Alternate", "Segoe UI", system-ui, sans-serif';

/** Per-PID gauge range + warn/watch thresholds, in metric units (display converts). */
type GaugeSpec = { min: number; max: number; watchHigh?: number; warnHigh?: number; watchLow?: number; warnLow?: number; redline?: number };
const GAUGE_SPECS: Record<string, GaugeSpec> = {
  "0C": { min: 0, max: 8000, watchHigh: 5500, warnHigh: 6500, redline: 6500 }, // Engine RPM
  "0D": { min: 0, max: 240 }, // Vehicle speed (km/h)
  "05": { min: 40, max: 130, watchHigh: 105, warnHigh: 115 }, // Coolant °C
  "04": { min: 0, max: 100, watchHigh: 85, warnHigh: 95 }, // Engine load %
  "11": { min: 0, max: 100 }, // Throttle %
  "2F": { min: 0, max: 100, watchLow: 15, warnLow: 7 }, // Fuel level %
  "42": { min: 11, max: 15, warnLow: 12.0, watchLow: 12.4, watchHigh: 14.9 }, // Module voltage
  "0F": { min: -10, max: 90, watchHigh: 60, warnHigh: 75 }, // Intake air °C
  "5C": { min: 40, max: 160, watchHigh: 130, warnHigh: 150 }, // Oil temp °C
  "06": { min: -25, max: 25, watchHigh: 10, warnHigh: 20, watchLow: -10, warnLow: -20 }, // STFT %
  "07": { min: -25, max: 25, watchHigh: 10, warnHigh: 20, watchLow: -10, warnLow: -20 } // LTFT %
};
/** PIDs promoted to big radial gauges at the top of the live view, in order. */
const HERO_PIDS = ["0C", "0D", "05"];
const HERO_LABEL: Record<string, string> = { "0C": "RPM", "0D": "Speed", "05": "Coolant" };

/** Which alert zone a reading falls in for its PID (null = no thresholds defined). */
function zoneFor(pid: string, value: number): Zone | null {
  const s = GAUGE_SPECS[pid];
  if (!s) return null;
  if ((s.warnHigh !== undefined && value >= s.warnHigh) || (s.warnLow !== undefined && value <= s.warnLow)) return "warn";
  if ((s.watchHigh !== undefined && value >= s.watchHigh) || (s.watchLow !== undefined && value <= s.watchLow)) return "watch";
  return "ok";
}
function zoneColor(zone: Zone | null): string {
  return zone === "warn" ? COLORS.warn : zone === "watch" ? COLORS.watch : zone === "ok" ? COLORS.ok : COLORS.live;
}

/** Gauge/tile readout precision: integers for big values (RPM, speed), more
 *  decimals for small ones (volts, flow). Display-only — never touches data. */
function fmtReadout(n: number): string {
  const a = Math.abs(n);
  if (a >= 100) return String(Math.round(n));
  if (a >= 10) return String(Math.round(n * 10) / 10);
  return String(Math.round(n * 100) / 100);
}
// Fallback PIDs when capability discovery is unavailable or empty.
const DEFAULT_LIVE_PIDS = ["0C", "0D", "05", "0F", "11", "06", "07", "42"];
// Preferred display order (most useful first); the rest follow.
const PID_PRIORITY = ["0C", "0D", "05", "04", "0B", "10", "0E", "11", "0F", "06", "07", "42", "2F", "46", "5C", "33"];
const MONITOR_PID_CAP = 16;
let monitorPids: string[] = DEFAULT_LIVE_PIDS;
const SPARK_MAX = 60;
// Cap the live sample buffer (~8 min at 8 PIDs/s) so memory and per-tick trend
// analysis stay flat over a long monitor session. CSV export covers this window.
const LIVE_SAMPLES_MAX = 4000;
const adapterLog: string[] = [];
const LOG_MAX = 240;

let logRenderScheduled = false;
function logTransaction(command: string, response: string[]): void {
  adapterLog.push(`> ${command}`);
  adapterLog.push(`< ${response.join(" | ") || "(no data)"}`);
  while (adapterLog.length > LOG_MAX) adapterLog.shift();
  // Coalesce DOM writes to one per frame so heavy serial traffic (8 reads/s
  // during live polling) doesn't thrash layout.
  if (!logRenderScheduled) {
    logRenderScheduled = true;
    requestAnimationFrame(() => {
      logRenderScheduled = false;
      const pre = $("adapter-log");
      pre.textContent = adapterLog.join("\n");
      pre.scrollTop = pre.scrollHeight;
    });
  }
}

// ---- status / connection ----------------------------------------------------
function setStatus(text: string, state: "off" | "connecting" | "on"): void {
  const pill = $("status-pill");
  pill.textContent = text;
  pill.className = `pill pill--${state}`;
}

function setConnectedUi(connected: boolean): void {
  show($("btn-connect"), !connected);
  show($("btn-demo"), !connected);
  show($("btn-disconnect"), connected);
  $<HTMLButtonElement>("btn-scan").disabled = !connected;
  $<HTMLButtonElement>("btn-live-start").disabled = !connected;
}

async function activate(client: ObdReader, label: string, demo: boolean): Promise<void> {
  setStatus("Initializing…", "connecting");
  try {
    const id = await client.initialize();
    conn = { client, label, demo };
    // Discover which live PIDs this car actually supports so the monitor adapts
    // to the vehicle instead of polling a fixed (often unsupported) set.
    monitorPids = await discoverMonitorPids(client);
    setStatus(`${demo ? "Demo" : "Connected"} · ${id.description} · ${id.protocol}`, "on");
    setConnectedUi(true);
  } catch (err) {
    setStatus(`Connection failed: ${errMsg(err)}`, "off");
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Ask the ECU which live PIDs it supports, keep only those we can decode, and
 * order them for display (preferred first), capped for a tidy grid. Falls back
 * to a sensible default if discovery is unavailable or empty.
 */
async function discoverMonitorPids(client: ObdReader): Promise<string[]> {
  if (!client.readSupportedPids) return DEFAULT_LIVE_PIDS;
  try {
    const supported = await client.readSupportedPids();
    const decodable = supported.filter(p => p in PID_FORMULAS);
    if (decodable.length === 0) return DEFAULT_LIVE_PIDS;
    const ordered = [
      ...PID_PRIORITY.filter(p => decodable.includes(p)),
      ...decodable.filter(p => !PID_PRIORITY.includes(p))
    ];
    return ordered.slice(0, MONITOR_PID_CAP);
  } catch {
    return DEFAULT_LIVE_PIDS;
  }
}

async function connectSerial(): Promise<void> {
  if (!("serial" in navigator)) {
    setStatus("Web Serial unavailable — open in Chrome/Edge or the desktop app.", "off");
    return;
  }
  setStatus("Select your adapter…", "connecting");
  try {
    const port = await navigator.serial.requestPort();
    const baudRate = Number($<HTMLSelectElement>("baud").value) || 38400;
    const transport = new WebSerialTransport(port, {
      baudRate,
      onError: () => handleTransportLost()
    });
    await transport.start();
    adapterLog.length = 0;
    // 4s per command keeps live polling responsive and fails fast on a dead
    // adapter; initialize() still gives protocol negotiation a longer window.
    await activate(
      new Elm327Client(transport, { onTransaction: logTransaction, timeoutMs: 4000 }),
      "OBD-II adapter",
      false
    );
  } catch (err) {
    setStatus(`No adapter selected (${errMsg(err)})`, "off");
  }
}

async function connectDemo(): Promise<void> {
  // A simulator with time-varying idle data, so the live monitor actually moves.
  await activate(new SimulatedObdReader(), "Demo (simulated)", true);
}

async function disconnect(): Promise<void> {
  stopLive();
  if (conn) {
    try {
      await conn.client.close();
    } catch {
      /* ignore */
    }
  }
  conn = null;
  show($("btn-live-export"), false);
  setStatus("Disconnected", "off");
  setConnectedUi(false);
}

/**
 * The serial adapter dropped mid-session (e.g. unplugged). Tear the UI back down
 * to a disconnected state with a clear message instead of leaving live cards
 * frozen on stale values.
 */
function handleTransportLost(): void {
  if (!conn) return; // already disconnected
  stopLive();
  conn = null;
  show($("btn-live-export"), false);
  setStatus("Adapter disconnected — check the cable, then reconnect.", "off");
  setConnectedUi(false);
}

// ---- serial picker modal ----------------------------------------------------
function setupPicker(): void {
  // Only present in Electron (preload bridge). In a plain browser the native
  // chooser is shown by the OS instead.
  if (!window.garage) return;
  window.garage.onSerialPorts(ports => openPicker(ports));
  $("picker-cancel").addEventListener("click", () => {
    window.garage.chooseSerialPort("");
    show($("picker"), false);
  });
}

function openPicker(ports: SerialPortInfo[]): void {
  const list = $("picker-list");
  list.replaceChildren();
  if (ports.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No serial ports found. Plug in your ELM327 adapter and retry.";
    list.appendChild(li);
  }
  for (const p of ports) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "picker-item";
    const name = p.displayName || p.portName || p.portId;
    const ids = p.vendorId && p.productId ? ` (${p.vendorId}:${p.productId})` : "";
    btn.textContent = `${name}${ids}`;
    btn.addEventListener("click", () => {
      window.garage.chooseSerialPort(p.portId);
      show($("picker"), false);
    });
    li.appendChild(btn);
    list.appendChild(li);
  }
  show($("picker"), true);
}

// ---- diagnose ---------------------------------------------------------------
async function runScan(): Promise<void> {
  // Capture the connection up front so a disconnect mid-scan can't null-deref.
  const c = conn;
  if (!c) return;
  const out = $("diagnose-output");
  const btn = $<HTMLButtonElement>("btn-scan");
  btn.disabled = true;
  out.replaceChildren(infoLine("Scanning… reading status, codes, readiness, and live data."));
  try {
    lastSnapshot = await runDiagnosticSession(c.client);
    lastLabel = c.demo ? "Demo vehicle" : undefined;
    renderCurrentReport();
    // Auto-fill the VIN Checker with the car's VIN so it's ready to validate/decode.
    if (lastSnapshot.vin) {
      $<HTMLInputElement>("vin-input").value = lastSnapshot.vin;
      renderVinDecode(decodeVin(lastSnapshot.vin));
    }
    // Auto-save the scan so the History tab builds up over time (Electron only).
    void window.garage?.history.save({ savedAt: Date.now(), label: lastLabel, snapshot: lastSnapshot });
  } catch (err) {
    out.replaceChildren(errorLine(`Scan failed: ${errMsg(err)}`));
  } finally {
    btn.disabled = false;
  }
}

/** Re-render the most recent scan with the current display units. */
function renderCurrentReport(): void {
  if (!lastSnapshot) return;
  const report = buildReport(lastSnapshot, lastLabel, unitSystem);
  renderReport($("diagnose-output"), report.headline, report.sections, report.caveats, report.text);
}

function renderReport(
  out: HTMLElement,
  headline: string,
  sections: Array<{ title: string; lines: string[] }>,
  caveats: string[],
  fullText: string
): void {
  out.replaceChildren();

  const head = document.createElement("div");
  head.className = "report-headline";
  const milOn = /\bMIL\b[^.]*\bON\b/i.test(headline);
  const milOff = /\bMIL\b[^.]*\b(off|ok)\b/i.test(headline);
  if (milOn) {
    head.classList.add("is-warn");
    head.appendChild(milLampSvg());
  } else if (milOff) {
    head.classList.add("is-ok");
    const lamp = document.createElement("span");
    lamp.className = "lamp lamp--ok";
    head.appendChild(lamp);
  }
  const headText = document.createElement("span");
  headText.textContent = headline;
  head.appendChild(headText);
  out.appendChild(head);

  for (const section of sections) {
    const card = document.createElement("div");
    card.className = "card";
    const h = document.createElement("h3");
    h.textContent = section.title;
    card.appendChild(h);
    for (const line of section.lines) {
      const row = document.createElement("div");
      row.className = lineSeverityClass(line);
      const code = dtcCodeInLine(line);
      const dtcParts = code ? line.match(/^(\s*[•\-]?\s*)([PCBU][0-3][0-9A-F]{3})\s*[—-]?\s*(.*)$/) : null;
      const trimmed = line.trimStart();
      const lampType: Zone | null = trimmed.startsWith("✓") ? "ok" : trimmed.startsWith("✗") ? "warn" : null;

      if (code && dtcParts) {
        // Render the code as a colour-coded chip + the rest of the description.
        if (dtcParts[1].trim()) row.append(document.createTextNode(dtcParts[1]));
        const chip = document.createElement("span");
        chip.className = "dtc-chip";
        chip.dataset.sys = code[0];
        chip.textContent = code;
        row.append(chip);
        if (dtcParts[3]) row.append(document.createTextNode(`${dtcParts[3]} `));
        row.append(makeDtcLink(code));
      } else if (lampType) {
        // Readiness / status check → a dashboard-style lamp + text.
        row.classList.add("row--lamp");
        const lamp = document.createElement("span");
        lamp.className = `lamp lamp--${lampType}`;
        row.append(lamp, document.createTextNode(line.replace(/^\s*[✓✗]\s*/, "")));
      } else {
        row.textContent = line;
      }
      card.appendChild(row);
    }
    out.appendChild(card);
  }

  const cav = document.createElement("details");
  cav.className = "caveats";
  const sum = document.createElement("summary");
  sum.textContent = "Caveats & safety";
  cav.appendChild(sum);
  for (const c of caveats) {
    const d = document.createElement("div");
    d.className = "muted";
    d.textContent = `• ${c}`;
    cav.appendChild(d);
  }
  out.appendChild(cav);

  const actions = document.createElement("div");
  actions.className = "report-actions";

  const copy = document.createElement("button");
  copy.className = "ghost";
  copy.textContent = "Copy report";
  copy.addEventListener("click", () => void navigator.clipboard?.writeText(fullText));

  const save = document.createElement("button");
  save.className = "ghost";
  save.textContent = "Save report (.md)";
  save.addEventListener("click", () => downloadText(fullText, "garage-copilot-report.md", "text/markdown"));

  actions.append(copy, save);
  out.appendChild(actions);
}

/** Trigger a file download of `data`. The anchor is attached and the object URL
 *  is revoked after a delay, so the download is never truncated or cancelled. */
function downloadText(data: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- live monitor -----------------------------------------------------------
function startLive(): void {
  if (!conn || liveTimer !== null) return;
  liveSamples = [];
  liveCards.clear();
  heroCards.clear();
  liveHistory.clear();
  $("live-heroes").replaceChildren();
  $("live-cards").replaceChildren();
  $("live-flags").replaceChildren();
  // Promote a few signature parameters to big radial gauges, if this car
  // reports them. The rest stay as compact tiles below.
  for (const pid of HERO_PIDS) {
    if (!monitorPids.includes(pid)) continue;
    const wrap = document.createElement("div");
    wrap.className = "hero";
    const canvas = document.createElement("canvas");
    wrap.appendChild(canvas);
    $("live-heroes").appendChild(wrap);
    heroCards.set(pid, { canvas, value: GAUGE_SPECS[pid]?.min ?? 0 });
  }
  show($("btn-live-start"), false);
  show($("btn-live-stop"), true);
  show($("btn-live-export"), true);
  // Guard against overlapping rounds: on a slow adapter a tick can outlast the
  // interval, which would back up the command queue unboundedly.
  let inFlight = false;
  const tick = async (): Promise<void> => {
    const c = conn;
    if (!c || inFlight) return;
    inFlight = true;
    try {
      for (const pid of monitorPids) {
        try {
          const decoded = await c.client.readLivePid(pid);
          if (decoded && typeof decoded.value === "number") {
            if (heroCards.has(decoded.pid)) updateHero(decoded.pid, decoded.value, decoded.unit);
            else updateCard(decoded.pid, decoded.label, decoded.value, decoded.unit);
            boundedPush(
              liveSamples,
              { pid: decoded.pid, label: decoded.label, value: decoded.value, unit: decoded.unit, t: Date.now() },
              LIVE_SAMPLES_MAX
            );
          }
        } catch {
          /* skip this PID this round */
        }
      }
      renderFlags();
    } finally {
      inFlight = false;
    }
  };
  void tick();
  liveTimer = window.setInterval(() => void tick(), 1000);
}

function stopLive(): void {
  if (liveTimer !== null) {
    window.clearInterval(liveTimer);
    liveTimer = null;
  }
  show($("btn-live-start"), Boolean(conn));
  show($("btn-live-stop"), false);
}

function updateCard(pid: string, label: string, value: number, unit?: string): void {
  // Cache the value/canvas refs so the per-second tick never re-queries the DOM.
  let entry = liveCards.get(pid);
  if (!entry) {
    const card = document.createElement("div");
    card.className = "live-card";
    const labelEl = document.createElement("div");
    labelEl.className = "live-label";
    labelEl.textContent = label;
    const valueLine = document.createElement("div");
    valueLine.className = "live-value";
    const numEl = document.createElement("span");
    const unitEl = document.createElement("span");
    unitEl.className = "live-unit";
    valueLine.append(numEl, unitEl);
    const canvas = document.createElement("canvas");
    canvas.className = "spark";
    card.append(labelEl, valueLine, canvas);
    $("live-cards").appendChild(card);
    entry = { card, numEl, unitEl, canvas };
    liveCards.set(pid, entry);
  }
  const display = convertUnit(value, unit, unitSystem);
  entry.numEl.textContent = fmtReadout(display.value);
  entry.unitEl.textContent = display.unit ?? "";
  const zone = zoneFor(pid, value);
  entry.card.dataset.zone = zone ?? "";

  const hist = liveHistory.get(pid) ?? [];
  hist.push(value); // store raw/metric so the sparkline + trends stay consistent
  if (hist.length > SPARK_MAX) hist.shift();
  liveHistory.set(pid, hist);
  drawSparkline(entry.canvas, hist, zoneColor(zone));
}

/** Update a hero radial gauge with a fresh reading (raw/metric value). */
function updateHero(pid: string, value: number, unit?: string): void {
  const hero = heroCards.get(pid);
  if (!hero) return;
  hero.value = value;
  hero.unit = unit;
  drawHeroGauge(hero, pid);
}

/** A 270° radial gauge with a redline band and a digital centre readout. */
function drawHeroGauge(hero: HeroGauge, pid: string): void {
  const ctx = fitCanvas(hero.canvas);
  if (!ctx) return;
  const { width: w, height: h } = hero.canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, w, h);
  const spec = GAUGE_SPECS[pid] ?? { min: 0, max: 100 };
  const cx = w / 2;
  const cy = h * 0.54;
  const radius = Math.min(w * 0.4, h * 0.42);
  const START = Math.PI * 0.75;
  const SWEEP = Math.PI * 1.5; // 270°
  const frac = clamp((hero.value - spec.min) / (spec.max - spec.min), 0, 1);
  const zone = zoneFor(pid, hero.value);
  const lineW = Math.max(8, radius * 0.16);

  arc(ctx, cx, cy, radius, START, START + SWEEP, COLORS.track, lineW);
  if (spec.redline !== undefined) {
    const rf = clamp((spec.redline - spec.min) / (spec.max - spec.min), 0, 1);
    arc(ctx, cx, cy, radius, START + rf * SWEEP, START + SWEEP, COLORS.redline, lineW);
  }
  ctx.shadowColor = zoneColor(zone);
  ctx.shadowBlur = 12;
  arc(ctx, cx, cy, radius, START, START + frac * SWEEP, zoneColor(zone), lineW);
  ctx.shadowBlur = 0;

  const display = convertUnit(hero.value, hero.unit, unitSystem);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.text;
  ctx.font = `600 ${Math.round(radius * 0.52)}px ${MONO}`;
  ctx.fillText(fmtReadout(display.value), cx, cy);
  ctx.fillStyle = COLORS.muted;
  if (display.unit) {
    ctx.font = `600 ${Math.round(radius * 0.2)}px ${COND}`;
    ctx.fillText(display.unit.toUpperCase(), cx, cy + radius * 0.34);
  }
  ctx.font = `700 ${Math.round(radius * 0.2)}px ${COND}`;
  ctx.fillText((HERO_LABEL[pid] ?? pid).toUpperCase(), cx, h - radius * 0.1);
}

/** Re-display existing live cards + gauges in the current units (instant toggle). */
function relabelCards(): void {
  for (const [pid, entry] of liveCards) {
    const hist = liveHistory.get(pid);
    if (!hist || hist.length === 0) continue;
    const def = PID_FORMULAS[pid];
    const display = convertUnit(hist[hist.length - 1], def?.unit, unitSystem);
    entry.numEl.textContent = fmtReadout(display.value);
    entry.unitEl.textContent = display.unit ?? "";
  }
  for (const [pid, hero] of heroCards) drawHeroGauge(hero, pid);
}

function setupUnits(): void {
  const sel = $<HTMLSelectElement>("units");
  const saved = localStorage.getItem("units");
  if (saved === "imperial" || saved === "metric") {
    unitSystem = saved;
    sel.value = saved;
  }
  sel.addEventListener("change", () => {
    unitSystem = sel.value === "imperial" ? "imperial" : "metric";
    localStorage.setItem("units", unitSystem);
    renderCurrentReport();
    relabelCards();
  });
}

/** Size a canvas to its CSS box at device-pixel resolution; returns a scaled ctx. */
function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Stroke an arc with a given colour/width (used by the radial gauges). */
function arc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a0: number, a1: number, color: string, width: number): void {
  ctx.beginPath();
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.arc(cx, cy, r, a0, a1);
  ctx.stroke();
}

/** "#rrggbb" + alpha → rgba() string, for canvas gradients. */
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function drawSparkline(canvas: HTMLCanvasElement, values: number[], color: string): void {
  const ctx = fitCanvas(canvas);
  if (!ctx) return;
  const { width: w, height: h } = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, w, h);
  if (values.length < 2) return;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xAt = (i: number): number => pad + (i / (values.length - 1)) * (w - 2 * pad);
  const yAt = (v: number): number => h - pad - ((v - min) / range) * (h - 2 * pad);

  // Gradient fill under the trace.
  ctx.beginPath();
  ctx.moveTo(xAt(0), h);
  values.forEach((v, i) => ctx.lineTo(xAt(i), yAt(v)));
  ctx.lineTo(xAt(values.length - 1), h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, hexA(color, 0.26));
  grad.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = grad;
  ctx.fill();

  // Trace with a soft glow.
  ctx.beginPath();
  values.forEach((v, i) => (i === 0 ? ctx.moveTo(xAt(i), yAt(v)) : ctx.lineTo(xAt(i), yAt(v))));
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function exportLiveCsv(): void {
  if (liveSamples.length === 0) return;
  downloadText(toCsv(liveSamples), "garage-copilot-live.csv", "text/csv");
}

function renderFlags(): void {
  const report = analyzeTrends(liveSamples);
  const container = $("live-flags");
  container.replaceChildren();
  if (report.flags.length === 0) {
    const ok = document.createElement("div");
    ok.className = "flag flag--ok";
    const lamp = document.createElement("span");
    lamp.className = "lamp lamp--ok";
    ok.append(lamp, document.createTextNode("No anomalies in the sampled window."));
    container.appendChild(ok);
    return;
  }
  for (const flag of report.flags) {
    const sev: Zone = flag.severity === "warn" ? "warn" : "watch";
    const row = document.createElement("div");
    row.className = `flag flag--${sev}`;
    const lamp = document.createElement("span");
    lamp.className = `lamp lamp--${sev}`;
    row.append(lamp, document.createTextNode(`${flag.parameter}: ${flag.message}`));
    container.appendChild(row);
  }
}

// ---- tune advisor -----------------------------------------------------------
// Human-readable labels + units for the assessment `details` keys, so the UI
// never shows raw object keys like "requiredCcMin".
const TUNE_LABELS: Record<string, string> = {
  currentRpm: "Current cruise RPM",
  newRpm: "New cruise RPM",
  deltaPct: "Change",
  requiredCcMin: "Required injector",
  proposedCcMin: "Proposed injector",
  headroomPct: "Headroom",
  perInjectorLbHr: "Fuel per injector",
  totalLbHr: "Total fuel",
  addedAmps: "Added draw",
  totalAmps: "Total draw",
  utilizationPct: "Alternator load"
};
const TUNE_UNITS: Record<string, string> = {
  currentRpm: "rpm",
  newRpm: "rpm",
  deltaPct: "%",
  requiredCcMin: "cc/min",
  proposedCcMin: "cc/min",
  headroomPct: "%",
  perInjectorLbHr: "lb/hr",
  totalLbHr: "lb/hr",
  addedAmps: "A",
  totalAmps: "A",
  utilizationPct: "%"
};

function tuneLabel(key: string): string {
  return TUNE_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
}
function tuneValue(key: string, value: number | string): string {
  const signed = (key === "deltaPct" || key === "headroomPct") && typeof value === "number" && value > 0 ? `+${value}` : String(value);
  const unit = TUNE_UNITS[key];
  return unit ? `${signed} ${unit}` : signed;
}
const numOf = (v: number | string): number => (typeof v === "number" ? v : Number(v));

function renderAssessment(targetId: string, run: () => Assessment): void {
  const target = $(targetId);
  try {
    const a = run();
    target.replaceChildren();

    const verdict = document.createElement("div");
    verdict.className = `verdict verdict--${a.ok ? "ok" : "warn"}`;
    verdict.textContent = a.ok ? "✓ Within limits" : "✗ Check this";
    target.appendChild(verdict);

    const summary = document.createElement("div");
    summary.className = "verdict-summary";
    summary.textContent = a.summary;
    target.appendChild(summary);

    const bar = buildTuneBar(a.details);
    if (bar) target.appendChild(bar);

    const metrics = document.createElement("div");
    metrics.className = "metrics";
    for (const [k, val] of Object.entries(a.details)) {
      const row = document.createElement("div");
      row.className = "metric";
      const key = document.createElement("span");
      key.className = "metric-key";
      key.textContent = tuneLabel(k);
      const value = document.createElement("span");
      value.className = "metric-val";
      value.textContent = tuneValue(k, val);
      row.append(key, value);
      metrics.appendChild(row);
    }
    target.appendChild(metrics);

    if (a.notes.length > 0) {
      const notes = document.createElement("ul");
      notes.className = "tune-notes";
      for (const note of a.notes) {
        const li = document.createElement("li");
        li.textContent = note;
        notes.appendChild(li);
      }
      target.appendChild(notes);
    }
  } catch (err) {
    target.replaceChildren(errorLine(errMsg(err)));
  }
}

/** A labelled horizontal bar. `fill`/`marks` are 0..1 fractions of the track. */
function makeBar(left: string, right: string, fill: number, zone: Zone, marks: Array<{ at: number; label: string }> = []): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "bar-wrap";
  const cap = document.createElement("div");
  cap.className = "bar-caption";
  const l = document.createElement("span");
  l.textContent = left;
  const r = document.createElement("span");
  r.textContent = right;
  cap.append(l, r);
  wrap.appendChild(cap);
  const bar = document.createElement("div");
  bar.className = "bar";
  const fillEl = document.createElement("div");
  fillEl.className = `bar-fill${zone !== "ok" ? ` bar-fill--${zone}` : ""}`;
  fillEl.style.width = `${clamp(fill, 0, 1) * 100}%`;
  bar.appendChild(fillEl);
  for (const m of marks) {
    const mk = document.createElement("div");
    mk.className = "bar-mark";
    mk.style.left = `${clamp(m.at, 0, 1) * 100}%`;
    mk.dataset.label = m.label;
    bar.appendChild(mk);
  }
  wrap.appendChild(bar);
  return wrap;
}

/** Pick a signature visual for whichever assessment this is. */
function buildTuneBar(d: Record<string, number | string>): HTMLElement | null {
  if ("utilizationPct" in d) {
    const util = numOf(d.utilizationPct);
    const zone: Zone = util >= 100 ? "warn" : util >= 80 ? "watch" : "ok";
    return makeBar("Alternator load", `${util}%`, util / 100, zone, [
      { at: 0.8, label: "80%" },
      { at: 1, label: "100%" }
    ]);
  }
  if ("newRpm" in d && "currentRpm" in d && "deltaPct" in d) {
    const cur = numOf(d.currentRpm);
    const nw = numOf(d.newRpm);
    const scale = Math.max(cur, nw) * 1.2 || 1;
    const zone: Zone = Math.abs(numOf(d.deltaPct)) >= 10 ? "watch" : "ok";
    return makeBar("Cruise RPM", `${nw} rpm`, nw / scale, zone, [{ at: cur / scale, label: "now" }]);
  }
  if ("proposedCcMin" in d && "requiredCcMin" in d) {
    const req = numOf(d.requiredCcMin);
    const prop = numOf(d.proposedCcMin);
    const frac = prop > 0 ? req / prop : 1;
    const zone: Zone = frac > 1 ? "warn" : frac > 0.9 ? "watch" : "ok";
    return makeBar("Injector demand at target", `${Math.round(frac * 100)}% of injector`, frac, zone, [{ at: 1, label: "max" }]);
  }
  return null;
}

function setupTune(): void {
  $("btn-fd").addEventListener("click", () =>
    renderAssessment("result-fd", () =>
      assessFinalDriveChange({
        speedMph: numFrom("fd-speed"),
        tireDiameterIn: numFrom("fd-tire"),
        topGearRatio: numFrom("fd-gear"),
        currentFinalDrive: numFrom("fd-from"),
        newFinalDrive: numFrom("fd-to")
      })
    )
  );
  $("btn-inj").addEventListener("click", () =>
    renderAssessment("result-inj", () => {
      const proposed = $<HTMLInputElement>("inj-size").value.trim();
      return assessInjectorsForTarget({
        targetHp: numFrom("inj-hp"),
        cylinders: numFrom("inj-cyl"),
        proposedCcMin: proposed === "" ? undefined : Number(proposed)
      });
    })
  );
  $("btn-load").addEventListener("click", () =>
    renderAssessment("result-load", () =>
      assessAddedElectricalLoad({
        systemVoltage: numFrom("load-volt"),
        existingLoadA: numFrom("load-existing"),
        addedWatts: numFrom("load-watts"),
        alternatorRatedA: numFrom("load-alt")
      })
    )
  );
}

// ---- VIN checker ------------------------------------------------------------
function setupVin(): void {
  const input = $<HTMLInputElement>("vin-input");
  $("btn-vin-check").addEventListener("click", () => checkVin());
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") checkVin();
  });
  $("btn-vin-online").addEventListener("click", () => {
    const decoded = decodeVin(input.value);
    renderVinDecode(decoded);
    // Don't spend a request on a VIN that fails the offline format check.
    if (decoded.validation.format.ok) void vinOnlineLookup(decoded.vin, decoded.modelYear);
  });
}

function checkVin(): void {
  const vin = $<HTMLInputElement>("vin-input").value.trim();
  $("vin-online").replaceChildren();
  if (vin === "") {
    $("vin-result").replaceChildren(infoLine("Enter a VIN to check."));
    return;
  }
  renderVinDecode(decodeVin(vin));
}

/** Render the offline validation + structural decode of a VIN. */
function renderVinDecode(d: VinDecode): void {
  const out = $("vin-result");
  out.replaceChildren();
  const fmtOk = d.validation.format.ok;
  const cd = d.validation.checkDigit;

  const banner = document.createElement("div");
  banner.className = "report-headline " + (!fmtOk ? "is-warn" : cd.matches ? "is-ok" : "");
  const lamp = document.createElement("span");
  lamp.className = "lamp " + (!fmtOk ? "lamp--warn" : cd.matches ? "lamp--ok" : "lamp--watch");
  const txt = document.createElement("span");
  txt.textContent = d.validation.assessment;
  banner.append(lamp, txt);
  out.appendChild(banner);

  if (!fmtOk) return; // nothing structural to show on a malformed VIN

  const rows: Array<[string, string | undefined]> = [
    ["VIN", d.vin],
    ["Country of origin", d.country],
    ["Region", d.region],
    ["Model year", d.modelYear ? String(d.modelYear) : undefined],
    ["WMI (manufacturer)", d.wmi],
    ["Plant code", d.plantCode],
    ["Serial", d.serial],
    ["Check digit", cd.evaluated ? `${cd.found} (expected ${cd.expected})` : undefined]
  ];
  out.appendChild(metricsCard(rows));
}

/** Look up the full make/model/engine online via NHTSA vPIC (the one network call). */
async function vinOnlineLookup(vin: string, modelYear?: number): Promise<void> {
  const out = $("vin-online");
  out.replaceChildren(infoLine("Looking up the VIN with NHTSA vPIC…"));
  try {
    const yr = modelYear ? `&modelyear=${modelYear}` : "";
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json${yr}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { Results?: Array<Record<string, string>> };
    const row = json.Results?.[0];
    if (!row) throw new Error("no result returned");
    renderVinOnline(out, row);
  } catch (err) {
    out.replaceChildren(errorLine(`Online lookup unavailable: ${errMsg(err)}. The offline decode above still applies.`));
  }
}

function renderVinOnline(out: HTMLElement, row: Record<string, string>): void {
  out.replaceChildren();
  const head = document.createElement("div");
  head.className = "report-headline is-ok";
  const lamp = document.createElement("span");
  lamp.className = "lamp lamp--ok";
  const txt = document.createElement("span");
  txt.textContent = "NHTSA vPIC decode";
  head.append(lamp, txt);
  out.appendChild(head);

  const plant = [row.PlantCity, row.PlantState, row.PlantCountry].filter(v => v && v.trim()).join(", ");
  const rows: Array<[string, string | undefined]> = [
    ["Make", row.Make],
    ["Model", row.Model],
    ["Model year", row.ModelYear],
    ["Trim", row.Trim],
    ["Body class", row.BodyClass],
    ["Vehicle type", row.VehicleType],
    ["Cylinders", row.EngineCylinders],
    ["Displacement (L)", row.DisplacementL],
    ["Fuel", row.FuelTypePrimary],
    ["Drive", row.DriveType],
    ["Manufacturer", row.Manufacturer],
    ["Plant", plant || undefined]
  ];
  out.appendChild(metricsCard(rows));

  if (row.ErrorCode && row.ErrorCode !== "0" && row.ErrorText) {
    out.appendChild(infoLine(`vPIC note: ${row.ErrorText}`));
  }
}

/** Build a card of label/value metric rows, skipping blank values. */
function metricsCard(rows: Array<[string, string | undefined]>): HTMLElement {
  const card = document.createElement("div");
  card.className = "card";
  const grid = document.createElement("div");
  grid.className = "metrics";
  for (const [key, value] of rows) {
    if (!value || value.trim() === "") continue;
    const row = document.createElement("div");
    row.className = "metric";
    const k = document.createElement("span");
    k.className = "metric-key";
    k.textContent = key;
    const v = document.createElement("span");
    v.className = "metric-val";
    v.textContent = value;
    row.append(k, v);
    grid.appendChild(row);
  }
  card.appendChild(grid);
  return card;
}

// ---- tabs / misc ------------------------------------------------------------
function setupTabs(): void {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"));
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      for (const t of tabs) t.classList.toggle("tab--active", t === tab);
      for (const panel of document.querySelectorAll<HTMLElement>(".panel")) {
        show(panel, panel.id === `tab-${name}`);
      }
    });
  }
}

// ---- history ----------------------------------------------------------------
function setupHistory(): void {
  if (!window.garage) return;
  document.querySelector('[data-tab="history"]')?.addEventListener("click", () => void loadHistory());
  $("btn-history-refresh").addEventListener("click", () => void loadHistory());
  $("btn-history-clear").addEventListener("click", async () => {
    await window.garage.history.clear();
    await loadHistory();
    $("history-detail").replaceChildren();
  });
}

async function loadHistory(): Promise<void> {
  if (!window.garage) return;
  const records = await window.garage.history.list();
  const list = $("history-list");
  list.replaceChildren();
  if (records.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No saved scans yet. Run a diagnostic scan and it will appear here.";
    list.appendChild(li);
    return;
  }
  records.forEach((record, i) => list.appendChild(historyItem(record, i)));
}

function historyItem(record: HistoryRecord, index: number): HTMLElement {
  const snap = record.snapshot as DiagnosticSnapshot;
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.className = "history-item";
  const when = new Date(record.savedAt).toLocaleString();
  const codes = snap.storedDtcs.length > 0 ? snap.storedDtcs.join(", ") : "no codes";
  const mil = snap.milOn ? "MIL ON" : "MIL off";
  const top = document.createElement("div");
  top.className = "history-when";
  top.textContent = when;
  const sub = document.createElement("div");
  sub.className = "history-sub";
  sub.textContent = `${mil} · ${snap.reportedDtcCount} DTC${snap.reportedDtcCount === 1 ? "" : "s"} · ${codes}${snap.vin ? ` · ${snap.vin}` : ""}`;
  btn.append(top, sub);
  // Red timeline dot when this scan had the MIL on or stored codes; green if clean.
  if (snap.milOn || snap.storedDtcs.length > 0) btn.classList.add("is-alert");
  btn.addEventListener("click", () => {
    for (const el of document.querySelectorAll(".history-item")) el.classList.remove("history-item--active");
    btn.classList.add("history-item--active");
    showHistoryRecord(record);
  });
  if (index === 0) {
    btn.classList.add("history-item--active");
    showHistoryRecord(record);
  }
  li.appendChild(btn);
  return li;
}

function showHistoryRecord(record: HistoryRecord): void {
  const report = buildReport(record.snapshot as DiagnosticSnapshot, record.label, unitSystem);
  renderReport($("history-detail"), report.headline, report.sections, report.caveats, report.text);
}

async function setupAbout(): Promise<void> {
  if (!window.garage) return;
  try {
    const info = await window.garage.appInfo();
    $("about-info").textContent = `v${info.appVersion} · Electron ${info.electron} · Chrome ${info.chrome} · ${info.platform}`;
  } catch {
    /* ignore */
  }
}

function infoLine(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text;
  return p;
}
function errorLine(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "row row--warn";
  p.textContent = text;
  return p;
}
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A "look up ↗" link for a DTC code, opened in the OS browser. */
function makeDtcLink(code: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "dtc-link";
  link.textContent = "look up ↗";
  link.href = dtcSearchUrl(code);
  link.target = "_blank";
  link.rel = "noreferrer";
  return link;
}

/** The check-engine glyph shown in a report banner when the MIL is on. */
function milLampSvg(): SVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "mil-lamp");
  svg.setAttribute("fill", "currentColor");
  const path = document.createElementNS(NS, "path");
  path.setAttribute(
    "d",
    "M16 5V3h-2v2h-2.6l-1.7-1.7-.7.7L10.3 5H8a2 2 0 0 0-2 2v1H4v3h2v1a3 3 0 0 0 3 3h.5l-1 4h2l1-4h1l1 4h2l-1-4h.5a3 3 0 0 0 3-3v-1h2V8h-2V7a2 2 0 0 0-2-2z"
  );
  svg.appendChild(path);
  return svg;
}

// ---- boot -------------------------------------------------------------------
function main(): void {
  setupTabs();
  setupPicker();
  setupUnits();
  setupHistory();
  setupTune();
  setupVin();
  void setupAbout();
  $("btn-connect").addEventListener("click", () => void connectSerial());
  $("btn-demo").addEventListener("click", () => void connectDemo());
  $("btn-disconnect").addEventListener("click", () => void disconnect());
  $("btn-scan").addEventListener("click", () => void runScan());
  $("btn-live-start").addEventListener("click", () => startLive());
  $("btn-live-stop").addEventListener("click", () => stopLive());
  $("btn-live-export").addEventListener("click", () => exportLiveCsv());
  setConnectedUi(false);
  setStatus("Disconnected", "off");
}

main();
