/**
 * OBD-II live parameter (PID) samples and normalization.
 *
 * KNOWN_PIDS is a SMALL map of the standard public Mode-01 PID labels and
 * units (RPM, vehicle speed, coolant temp, etc.). It exists only to normalize
 * labels/units; it is intentionally not a full SAE PID dictionary. All helpers
 * pass through unknown PIDs/units WITHOUT throwing.
 */

/** A single sampled parameter value. */
export type PidSample = {
  /** Mode-01 PID in hex, when known (e.g. "0C" for RPM). */
  pid?: string;
  /** Human label (e.g. "Engine RPM"). */
  label: string;
  value: number | string;
  /** Engineering unit (e.g. "rpm", "km/h", "C"). */
  unit?: string;
  /** ISO timestamp of the sample, when known. */
  timestamp?: string;
  /** Where this sample came from (e.g. "mock-adapter", "scan-log"). */
  source: string;
};

/** Definition of a standard public PID for normalization. */
export type KnownPid = {
  /** Canonical Mode-01 PID hex (uppercase, 2 chars). */
  pid: string;
  /** Canonical label. */
  label: string;
  /** Canonical unit, when the parameter is dimensioned. */
  unit?: string;
};

/**
 * Small map of standard public Mode-01 PIDs, keyed by canonical PID hex.
 * Public structural labels/units only — not a full SAE table.
 */
export const KNOWN_PIDS: Record<string, KnownPid> = {
  "04": { pid: "04", label: "Calculated Engine Load", unit: "%" },
  "05": { pid: "05", label: "Engine Coolant Temperature", unit: "C" },
  "0A": { pid: "0A", label: "Fuel Pressure", unit: "kPa" },
  "0B": { pid: "0B", label: "Intake Manifold Pressure", unit: "kPa" },
  "0C": { pid: "0C", label: "Engine RPM", unit: "rpm" },
  "0D": { pid: "0D", label: "Vehicle Speed", unit: "km/h" },
  "0E": { pid: "0E", label: "Timing Advance", unit: "deg" },
  "0F": { pid: "0F", label: "Intake Air Temperature", unit: "C" },
  "10": { pid: "10", label: "Mass Air Flow", unit: "g/s" },
  "11": { pid: "11", label: "Throttle Position", unit: "%" },
  "1F": { pid: "1F", label: "Run Time Since Engine Start", unit: "s" },
  "2F": { pid: "2F", label: "Fuel Tank Level", unit: "%" },
  "42": { pid: "42", label: "Control Module Voltage", unit: "V" },
  "46": { pid: "46", label: "Ambient Air Temperature", unit: "C" }
};

/** Lower-cased label -> known PID, for resolving samples that arrive by label. */
const KNOWN_PIDS_BY_LABEL: Record<string, KnownPid> = Object.fromEntries(
  Object.values(KNOWN_PIDS).map(def => [def.label.toLowerCase(), def])
);

/**
 * Common short aliases real-world scan apps (Torque, OBD Fusion, Car Scanner)
 * use, mapped to canonical PID hex. Lets friendly column names resolve to a
 * known PID without a full SAE table.
 */
const PID_LABEL_ALIASES: Record<string, string> = {
  rpm: "0C",
  "engine speed": "0C",
  coolant: "05",
  "coolant temp": "05",
  "coolant temperature": "05",
  ect: "05",
  speed: "0D",
  "vehicle speed (obd)": "0D",
  vss: "0D",
  maf: "10",
  "mass airflow": "10",
  iat: "0F",
  "intake air temp": "0F",
  throttle: "11",
  "throttle pos": "11",
  tps: "11",
  load: "04",
  "engine load": "04",
  voltage: "42",
  "battery voltage": "42",
  "module voltage": "42",
  map: "0B",
  "manifold pressure": "0B",
  "fuel level": "2F",
  "ambient temp": "46",
  timing: "0E"
};

/** Normalize a PID token to canonical 2-char uppercase hex, or undefined. */
export function normalizePidCode(pid: string | undefined): string | undefined {
  if (typeof pid !== "string") return undefined;
  let trimmed = pid.trim().toUpperCase();
  // Tolerate "0x0C", "0xC", "C", "0C".
  if (trimmed.startsWith("0X")) trimmed = trimmed.slice(2);
  if (trimmed.length === 0) return undefined;
  if (!/^[0-9A-F]+$/.test(trimmed)) return undefined;
  return trimmed.padStart(2, "0");
}

/** Look up a known PID by its hex code (tolerant of formatting). */
export function lookupPid(pid: string | undefined): KnownPid | undefined {
  const code = normalizePidCode(pid);
  return code ? KNOWN_PIDS[code] : undefined;
}

/** Look up a known PID by a human label or common alias (case-insensitive). */
export function lookupPidByLabel(label: string | undefined): KnownPid | undefined {
  if (typeof label !== "string") return undefined;
  const key = label.trim().toLowerCase();
  const direct = KNOWN_PIDS_BY_LABEL[key];
  if (direct) return direct;
  const aliasPid = PID_LABEL_ALIASES[key];
  return aliasPid ? KNOWN_PIDS[aliasPid] : undefined;
}

/**
 * Resolve the canonical label for a sample. If the PID or the provided label
 * matches a known PID, the canonical label is returned; otherwise the provided
 * label is passed through unchanged (never throws).
 */
export function resolveLabel(pid: string | undefined, label: string | undefined): string {
  const known = lookupPid(pid) ?? lookupPidByLabel(label);
  if (known) return known.label;
  return (label ?? "").trim() || "Unknown";
}

/**
 * Resolve the unit for a sample, passing through unknown units untouched. If a
 * unit is provided it wins; otherwise the known PID's canonical unit is used;
 * otherwise undefined. Unknown units are NEVER rejected.
 */
export function normalizeUnit(
  pid: string | undefined,
  label: string | undefined,
  unit: string | undefined
): string | undefined {
  const provided = typeof unit === "string" ? unit.trim() : "";
  if (provided.length > 0) return provided;
  const known = lookupPid(pid) ?? lookupPidByLabel(label);
  return known?.unit;
}
