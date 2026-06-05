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
  type ObdReader,
  type Assessment,
  type TimedSample,
  type UnitSystem,
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
type LiveCard = { valueEl: HTMLElement; canvas: HTMLCanvasElement };
const liveCards = new Map<string, LiveCard>();
const liveHistory = new Map<string, number[]>();
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
  head.textContent = headline;
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
      row.textContent = line;
      const code = dtcCodeInLine(line);
      if (code) {
        const link = document.createElement("a");
        link.className = "dtc-link";
        link.textContent = "look up ↗";
        link.href = dtcSearchUrl(code);
        link.target = "_blank";
        link.rel = "noreferrer";
        row.append(" ", link);
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
  liveHistory.clear();
  $("live-cards").replaceChildren();
  $("live-flags").replaceChildren();
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
            updateCard(decoded.pid, decoded.label, decoded.value, decoded.unit);
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
    const valueEl = document.createElement("div");
    valueEl.className = "live-value";
    const canvas = document.createElement("canvas");
    canvas.className = "spark";
    canvas.width = 300;
    canvas.height = 48;
    card.append(labelEl, valueEl, canvas);
    $("live-cards").appendChild(card);
    entry = { valueEl, canvas };
    liveCards.set(pid, entry);
  }
  const display = convertUnit(value, unit, unitSystem);
  entry.valueEl.textContent = `${display.value}${display.unit ? ` ${display.unit}` : ""}`;

  const hist = liveHistory.get(pid) ?? [];
  hist.push(value); // store raw/metric so the sparkline + trends stay consistent
  if (hist.length > SPARK_MAX) hist.shift();
  liveHistory.set(pid, hist);
  drawSparkline(entry.canvas, hist);
}

/** Re-display existing live cards in the current units (instant toggle feedback). */
function relabelCards(): void {
  for (const [pid, entry] of liveCards) {
    const hist = liveHistory.get(pid);
    if (!hist || hist.length === 0) continue;
    const def = PID_FORMULAS[pid];
    const display = convertUnit(hist[hist.length - 1], def?.unit, unitSystem);
    entry.valueEl.textContent = `${display.value}${display.unit ? ` ${display.unit}` : ""}`;
  }
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

function drawSparkline(canvas: HTMLCanvasElement, values: number[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const pad = 4;
  ctx.clearRect(0, 0, w, h);
  if (values.length < 2) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#2f81f7";
  ctx.lineJoin = "round";
  values.forEach((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
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
    container.appendChild(infoLine("No anomalies in the sampled window."));
    return;
  }
  for (const flag of report.flags) {
    const row = document.createElement("div");
    row.className = `row row--${flag.severity === "warn" ? "warn" : "watch"}`;
    row.textContent = `[${flag.severity}] ${flag.parameter}: ${flag.message}`;
    container.appendChild(row);
  }
}

// ---- tune advisor -----------------------------------------------------------
function renderAssessment(targetId: string, run: () => Assessment): void {
  const target = $(targetId);
  try {
    const a = run();
    target.replaceChildren();
    const verdict = document.createElement("div");
    verdict.className = a.ok ? "row row--ok" : "row row--warn";
    verdict.textContent = `${a.ok ? "✓" : "✗"} ${a.summary}`;
    target.appendChild(verdict);
    for (const [k, val] of Object.entries(a.details)) {
      const d = document.createElement("div");
      d.className = "row";
      d.textContent = `${k}: ${val}`;
      target.appendChild(d);
    }
    for (const note of a.notes) {
      const d = document.createElement("div");
      d.className = "muted";
      d.textContent = `• ${note}`;
      target.appendChild(d);
    }
  } catch (err) {
    target.replaceChildren(errorLine(errMsg(err)));
  }
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

// ---- boot -------------------------------------------------------------------
function main(): void {
  setupTabs();
  setupPicker();
  setupUnits();
  setupHistory();
  setupTune();
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
