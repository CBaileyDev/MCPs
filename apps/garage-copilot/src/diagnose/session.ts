/**
 * Run a full read-only diagnostic pass against any {@link ObdReader} and collect
 * the evidence into a single snapshot.
 *
 * This is the deterministic core of Garage Copilot's "diagnose" capability —
 * what a tech does on first hookup: read the MIL/DTC count, pull stored/pending/
 * permanent codes, sample key live parameters, and note readiness. It does no
 * interpretation; ./report.ts turns the snapshot into a human report, and the
 * agent playbook (../agent/playbook.ts) is what hands it to Claude to reason
 * over alongside the other MCP servers.
 */

import type { ObdReader, ObdIdentity } from "../obd/reader.js";
import type { DecodedPid } from "../obd/pid-formulas.js";
import type { MonitorStatus, ReadinessMonitor } from "../obd/dtc-decode.js";

/** Everything gathered in one diagnostic pass. Pure evidence, no diagnosis. */
export type DiagnosticSnapshot = {
  capturedAt: string;
  identity: ObdIdentity;
  milOn: boolean;
  /** DTC count as reported by the ECU monitor status (authoritative count). */
  reportedDtcCount: number;
  ignitionType: MonitorStatus["ignitionType"];
  storedDtcs: string[];
  pendingDtcs: string[];
  permanentDtcs: string[];
  readiness: ReadinessMonitor[];
  notReadyMonitors: string[];
  livePids: DecodedPid[];
  voltage?: number;
  /** VIN read over Mode 09, when the ECU supports it. */
  vin?: string;
  /** Non-fatal problems encountered while reading (e.g. an unsupported PID). */
  warnings: string[];
};

export type SessionOptions = {
  /** Live PID hex codes to sample (default: a small idle-health set). */
  livePids?: string[];
  /** Clock injection for deterministic timestamps in tests. */
  now?: () => Date;
};

const DEFAULT_LIVE_PIDS = ["0C", "0D", "05", "0F", "11", "06", "07", "42"];

/**
 * Drive a reader through a complete read-only pass. Individual optional reads
 * (pending/permanent DTCs, each live PID, voltage) are tolerant: a failure is
 * recorded as a warning rather than aborting the whole session, because older
 * ECUs legitimately do not support every service.
 */
export async function runDiagnosticSession(
  reader: ObdReader,
  options: SessionOptions = {}
): Promise<DiagnosticSnapshot> {
  const now = options.now ?? (() => new Date());
  const pidList = options.livePids ?? DEFAULT_LIVE_PIDS;
  const warnings: string[] = [];

  const identity = await reader.initialize();
  const status = await reader.readMonitorStatus();

  const storedDtcs = await reader.readStoredDtcs();
  const pendingDtcs = await safe(() => reader.readPendingDtcs(), warnings, "read pending DTCs (mode 07)", []);
  const permanentDtcs = await safe(
    () => reader.readPermanentDtcs(),
    warnings,
    "read permanent DTCs (mode 0A)",
    []
  );

  const livePids: DecodedPid[] = [];
  for (const pid of pidList) {
    const decoded = await safe(() => reader.readLivePid(pid), warnings, `read live PID ${pid}`, undefined);
    if (decoded) livePids.push(decoded);
  }

  const voltage = await safe(() => reader.readVoltage(), warnings, "read voltage (ATRV)", undefined);
  const vin = reader.readVin
    ? await safe(() => reader.readVin!(), warnings, "read VIN (mode 09)", undefined)
    : undefined;

  return {
    capturedAt: now().toISOString(),
    identity,
    milOn: status.milOn,
    reportedDtcCount: status.dtcCount,
    ignitionType: status.ignitionType,
    storedDtcs,
    pendingDtcs,
    permanentDtcs,
    readiness: status.monitors,
    notReadyMonitors: status.monitors.filter(m => m.state === "not-ready").map(m => m.name),
    livePids,
    voltage,
    vin,
    warnings
  };
}

/** Run an optional read; on failure record a warning and return a fallback. */
async function safe<T>(
  fn: () => Promise<T>,
  warnings: string[],
  what: string,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    warnings.push(`Could not ${what}: ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}
