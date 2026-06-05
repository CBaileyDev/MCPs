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
  type ObdReader,
  type Assessment,
  type TimedSample
} from "./core.js";
import { WebSerialTransport } from "./web-serial.js";
import { toCsv, lineSeverityClass, dtcSearchUrl, dtcCodeInLine, boundedPush } from "./format.js";
import type { SerialPortInfo } from "../shared/ipc.js";

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
let liveTimer: number | null = null;
let liveSamples: TimedSample[] = [];
const liveCards = new Map<string, HTMLElement>();
const liveHistory = new Map<string, number[]>();
const LIVE_PIDS = ["0C", "0D", "05", "0F", "11", "06", "07", "42"];
const SPARK_MAX = 60;
// Cap the live sample buffer (~8 min at 8 PIDs/s) so memory and per-tick trend
// analysis stay flat over a long monitor session. CSV export covers this window.
const LIVE_SAMPLES_MAX = 4000;
const adapterLog: string[] = [];
const LOG_MAX = 240;

function logTransaction(command: string, response: string[]): void {
  adapterLog.push(`> ${command}`);
  adapterLog.push(`< ${response.join(" | ") || "(no data)"}`);
  while (adapterLog.length > LOG_MAX) adapterLog.shift();
  const pre = $("adapter-log");
  pre.textContent = adapterLog.join("\n");
  pre.scrollTop = pre.scrollHeight;
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

async function connectSerial(): Promise<void> {
  if (!("serial" in navigator)) {
    setStatus("Web Serial unavailable — open in Chrome/Edge or the desktop app.", "off");
    return;
  }
  setStatus("Select your adapter…", "connecting");
  try {
    const port = await navigator.serial.requestPort();
    const baudRate = Number($<HTMLSelectElement>("baud").value) || 38400;
    const transport = new WebSerialTransport(port, { baudRate });
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
    const snapshot = await runDiagnosticSession(c.client);
    const report = buildReport(snapshot, c.demo ? "Demo vehicle" : undefined);
    renderReport(out, report.headline, report.sections, report.caveats, report.text);
  } catch (err) {
    out.replaceChildren(errorLine(`Scan failed: ${errMsg(err)}`));
  } finally {
    btn.disabled = false;
  }
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
  save.addEventListener("click", () => {
    const blob = new Blob([fullText], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "garage-copilot-report.md";
    a.click();
    URL.revokeObjectURL(url);
  });

  actions.append(copy, save);
  out.appendChild(actions);
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
      for (const pid of LIVE_PIDS) {
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
  let card = liveCards.get(pid);
  if (!card) {
    card = document.createElement("div");
    card.className = "live-card";
    const l = document.createElement("div");
    l.className = "live-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "live-value";
    const canvas = document.createElement("canvas");
    canvas.className = "spark";
    canvas.width = 300;
    canvas.height = 48;
    card.append(l, v, canvas);
    liveCards.set(pid, card);
    $("live-cards").appendChild(card);
  }
  (card.querySelector(".live-value") as HTMLElement).textContent = `${value}${unit ? ` ${unit}` : ""}`;

  const hist = liveHistory.get(pid) ?? [];
  hist.push(value);
  if (hist.length > SPARK_MAX) hist.shift();
  liveHistory.set(pid, hist);
  drawSparkline(card.querySelector(".spark") as HTMLCanvasElement, hist);
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
  const blob = new Blob([toCsv(liveSamples)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "garage-copilot-live.csv";
  a.click();
  URL.revokeObjectURL(url);
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
