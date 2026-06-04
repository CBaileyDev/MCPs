/**
 * Tolerant scan-log parser — the highest-value v1 capability.
 *
 * Accepts messy real-world logs exported from apps like Torque, OBD Fusion, or
 * Car Scanner and turns them into a normalized evidence trail. It auto-detects:
 *   (a) CSV with a header row (timestamp / PID / value / unit-ish columns), and
 *   (b) simple "key: value" text reports.
 *
 * It is deliberately forgiving: unknown columns, unknown units, blank lines,
 * and malformed rows produce a `warnings` entry and are skipped — parsing must
 * NEVER throw on bad input.
 */

import { parseDtc, type DtcRecord } from "./dtc.js";
import {
  buildReadinessSnapshot,
  READINESS_MONITOR_NAMES,
  type ReadinessMonitor,
  type ReadinessSnapshot
} from "./readiness.js";
import { normalizePidCode, normalizeUnit, resolveLabel, resolvePidCode, type PidSample } from "./pids.js";

/** Result of parsing a scan log. */
export type ParsedScanLog = {
  samples: PidSample[];
  dtcs: DtcRecord[];
  readiness?: ReadinessSnapshot;
  warnings: string[];
};

export type ParseScanLogOptions = {
  /** Force a parse mode instead of auto-detecting. */
  format?: "csv" | "keyvalue" | "auto";
  /** Source label stamped onto produced records. Defaults to "scan-log". */
  source?: string;
};

/** Column roles we try to recognize in a CSV header (case/space-insensitive). */
type ColumnRole = "timestamp" | "pid" | "label" | "value" | "unit" | "unknown";

const HEADER_ALIASES: Record<string, ColumnRole> = {
  // timestamp-ish
  timestamp: "timestamp",
  time: "timestamp",
  "gps time": "timestamp",
  "device time": "timestamp",
  date: "timestamp",
  // pid-ish
  pid: "pid",
  "pid id": "pid",
  obdpid: "pid",
  // label-ish
  label: "label",
  name: "label",
  parameter: "label",
  "sensor": "label",
  "pid description": "label",
  description: "label",
  // value-ish
  value: "value",
  reading: "value",
  // unit-ish
  unit: "unit",
  units: "unit"
};

const SOURCE_DEFAULT = "scan-log";

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/^["']|["']$/g, "").replace(/\s+/g, " ");
}

/** Split one CSV line, tolerating simple double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map(f => f.trim());
}

function coerceValue(raw: string): number | string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const num = Number(trimmed);
  return Number.isFinite(num) && /^[-+]?[0-9].*$/.test(trimmed) ? num : trimmed;
}

/** Does this content look like CSV with a recognizable header row? */
function looksLikeCsv(lines: string[]): boolean {
  const firstNonEmpty = lines.find(l => l.trim().length > 0);
  if (!firstNonEmpty) return false;
  if (!firstNonEmpty.includes(",")) return false;
  const cols = splitCsvLine(firstNonEmpty).map(normalizeKey);
  return cols.some(c => HEADER_ALIASES[c] !== undefined);
}

function parseCsv(lines: string[], source: string): ParsedScanLog {
  const warnings: string[] = [];
  const samples: PidSample[] = [];
  const dtcs: DtcRecord[] = [];

  const headerIndex = lines.findIndex(l => l.trim().length > 0);
  const header = splitCsvLine(lines[headerIndex]);
  const roles: ColumnRole[] = header.map(h => HEADER_ALIASES[normalizeKey(h)] ?? "unknown");

  const hasValue = roles.includes("value");
  const hasLabelOrPid = roles.includes("label") || roles.includes("pid");
  if (!hasValue || !hasLabelOrPid) {
    warnings.push(
      `CSV header did not expose a clear value column plus a pid/label column (saw: ${header.join(", ")}); rows may be skipped.`
    );
  }

  const unknownCols = header.filter((_, i) => roles[i] === "unknown");
  if (unknownCols.length > 0) {
    warnings.push(`Ignored unrecognized CSV column(s): ${unknownCols.join(", ")}.`);
  }

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const cells = splitCsvLine(line);

    const get = (role: ColumnRole): string | undefined => {
      const idx = roles.indexOf(role);
      return idx >= 0 ? cells[idx] : undefined;
    };

    const rawPid = get("pid");
    const rawLabel = get("label");
    const rawValue = get("value");
    const rawUnit = get("unit");
    const rawTimestamp = get("timestamp");

    if ((rawLabel === undefined || rawLabel === "") && (rawPid === undefined || rawPid === "")) {
      warnings.push(`Row ${i + 1}: no PID or label; skipped.`);
      continue;
    }
    if (rawValue === undefined || rawValue.trim() === "") {
      warnings.push(`Row ${i + 1}: missing value for "${rawLabel ?? rawPid}"; skipped.`);
      continue;
    }

    const pid = normalizePidCode(rawPid);
    if (rawPid && rawPid.trim() !== "" && pid === undefined) {
      warnings.push(`Row ${i + 1}: unrecognized PID "${rawPid}"; kept value but dropped PID.`);
    }

    // Back-fill the hex PID from label/alias when no explicit PID column is present.
    // Explicit pid column wins when it matches a known PID; fall back to label resolution.
    const resolvedPid = pid ?? resolvePidCode(undefined, rawLabel);

    const unit = normalizeUnit(resolvedPid, rawLabel, rawUnit);
    if (rawUnit && rawUnit.trim() !== "" && !isKnownUnit(rawUnit)) {
      warnings.push(`Row ${i + 1}: unrecognized unit "${rawUnit.trim()}"; passed through unchanged.`);
    }

    const sample: PidSample = {
      label: resolveLabel(resolvedPid, rawLabel),
      value: coerceValue(rawValue),
      source
    };
    if (resolvedPid) sample.pid = resolvedPid;
    if (unit) sample.unit = unit;
    if (rawTimestamp && rawTimestamp.trim() !== "") sample.timestamp = rawTimestamp.trim();
    samples.push(sample);
  }

  return { samples, dtcs, warnings };
}

// ---------------------------------------------------------------------------
// Wide-format CSV support (Torque / OBD Fusion / Car Scanner export style)
// ---------------------------------------------------------------------------

/**
 * Header substrings that identify non-OBD metadata columns in wide exports.
 * These are skipped silently — no samples emitted, no warnings generated.
 * Keep specific enough that "speed" is NOT in this list (it would kill Vehicle Speed).
 */
const WIDE_SKIP_SUBSTRINGS = [
  "gps time",
  "device time",
  "gps speed",
  "longitude",
  "latitude",
  "altitude",
  "bearing",
  "gravity x",
  "gravity y",
  "gravity z",
  "horizontal dilution",
  "gps accuracy",
  "gps altitude"
] as const;

/** Does this header string identify a non-OBD metadata column to skip? */
function isWideSkipColumn(headerLower: string): boolean {
  return WIDE_SKIP_SUBSTRINGS.some(sub => headerLower.includes(sub));
}

/**
 * Detect the "wide" export format: commas present, first column is time-ish,
 * and a significant portion of the remaining columns look like `Label(unit)`.
 * The long-format fixtures score 0 paren-headers so they stay on the long path.
 */
function looksLikeWide(lines: string[]): boolean {
  const firstNonEmpty = lines.find(l => l.trim().length > 0);
  if (!firstNonEmpty || !firstNonEmpty.includes(",")) return false;

  const cols = splitCsvLine(firstNonEmpty);
  if (cols.length < 2) return false;

  // First column must be time-ish.
  const firstColKey = normalizeKey(cols[0]);
  const timeishFirst =
    firstColKey === "gps time" ||
    firstColKey === "device time" ||
    firstColKey === "time" ||
    firstColKey === "timestamp";
  if (!timeishFirst) return false;

  // Count remaining columns that end with a parenthetical `(unit)`.
  const parenRe = /\([^()]+\)\s*$/;
  const remaining = cols.slice(1);
  const parenCount = remaining.filter(c => parenRe.test(c.trim())).length;

  // Require at least 3 paren-headers (enough signal that this is wide format).
  return parenCount >= 3;
}

/**
 * Extract label and unit from a wide-format header like
 *   "Engine RPM(rpm)"                    → { label: "Engine RPM", unit: "rpm" }
 *   "Engine Coolant Temperature(°C)"     → { label: "Engine Coolant Temperature", unit: "°C" }
 *   "Throttle Position(Manifold)(%)"     → { label: "Throttle Position(Manifold)", unit: "%" }
 *
 * Rule: unit = the LAST parenthetical group; label = everything before it.
 */
function splitWideHeader(header: string): { label: string; unit: string | undefined } {
  // Match the very last `(...)` group, allowing nested parens in the label.
  const m = /^(.*)\(([^()]+)\)\s*$/.exec(header.trim());
  if (m) {
    return { label: m[1].trim(), unit: m[2].trim() };
  }
  return { label: header.trim(), unit: undefined };
}

/** Parse a wide-format CSV (one row per time tick, many PID columns). */
function parseWideCsv(lines: string[], source: string): ParsedScanLog {
  const warnings: string[] = [];
  const samples: PidSample[] = [];
  const dtcs: DtcRecord[] = [];

  const headerIndex = lines.findIndex(l => l.trim().length > 0);
  const rawHeaders = splitCsvLine(lines[headerIndex]);

  // Pre-process headers: classify each column.
  type WideColMeta =
    | { kind: "timestamp" }
    | { kind: "skip" }
    | { kind: "obd"; label: string; unit: string | undefined };

  const colMeta: WideColMeta[] = rawHeaders.map(h => {
    const hLower = normalizeKey(h);
    if (
      hLower === "gps time" ||
      hLower === "device time" ||
      hLower === "time" ||
      hLower === "timestamp"
    ) {
      return { kind: "timestamp" };
    }
    if (isWideSkipColumn(hLower)) return { kind: "skip" };
    const { label, unit } = splitWideHeader(h);
    return { kind: "obd", label, unit };
  });

  // Index of the first timestamp column (used to stamp every sample in the row).
  const tsIndex = colMeta.findIndex(m => m.kind === "timestamp");

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;

    const cells = splitCsvLine(line);
    const timestamp = tsIndex >= 0 ? cells[tsIndex]?.trim() : undefined;

    for (let c = 0; c < colMeta.length; c++) {
      const meta = colMeta[c];
      if (meta.kind !== "obd") continue;

      const rawValue = cells[c] ?? "";
      if (rawValue.trim() === "") continue; // blank cell — skip silently

      const coerced = coerceValue(rawValue);
      // Back-fill hex PID from label or alias.
      const resolvedPid = resolvePidCode(undefined, meta.label);
      const canonicalLabel = resolveLabel(resolvedPid, meta.label);

      const sample: PidSample = {
        label: canonicalLabel,
        value: coerced,
        source
      };
      if (resolvedPid) sample.pid = resolvedPid;
      if (meta.unit) sample.unit = meta.unit;
      if (timestamp && timestamp !== "") sample.timestamp = timestamp;
      samples.push(sample);
    }
  }

  return { samples, dtcs, warnings };
}

/** A loose allow-list of units we recognize, to flag genuinely odd ones. */
const KNOWN_UNITS = new Set([
  "rpm",
  "km/h",
  "mph",
  "c",
  "f",
  "kpa",
  "psi",
  "bar",
  "%",
  "v",
  "g/s",
  "deg",
  "s",
  "ms",
  "l/h",
  "ratio"
]);

function isKnownUnit(unit: string): boolean {
  return KNOWN_UNITS.has(unit.trim().toLowerCase());
}

/** Map a free-text monitor token to a canonical readiness name, if possible. */
function matchReadinessName(token: string): string | undefined {
  const norm = token.trim().toLowerCase();
  for (const name of READINESS_MONITOR_NAMES) {
    if (name.toLowerCase() === norm) return name;
  }
  // Loose contains-match for things like "Catalyst Monitor".
  for (const name of READINESS_MONITOR_NAMES) {
    if (norm.includes(name.toLowerCase())) return name;
  }
  return undefined;
}

function parseReadinessState(value: string): ReadinessMonitor["state"] | undefined {
  const v = value.trim().toLowerCase();
  if (["ready", "complete", "done", "ok", "pass"].includes(v)) return "ready";
  if (["not ready", "not-ready", "incomplete", "pending", "fail"].includes(v)) return "not-ready";
  if (["not supported", "not-supported", "n/a", "na", "unsupported"].includes(v)) return "not-supported";
  return undefined;
}

/** Parse a simple "key: value" text report. */
function parseKeyValue(lines: string[], source: string): ParsedScanLog {
  const warnings: string[] = [];
  const samples: PidSample[] = [];
  const dtcs: DtcRecord[] = [];
  const monitors: ReadinessMonitor[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") continue;

    const sep = trimmed.indexOf(":");
    if (sep < 0) {
      // Maybe a bare DTC token on its own line.
      const code = parseDtc(trimmed);
      if (code) {
        dtcs.push({ code, source });
        continue;
      }
      warnings.push(`Line ${i + 1}: "${truncate(trimmed)}" is not "key: value"; skipped.`);
      continue;
    }

    const key = trimmed.slice(0, sep).trim();
    const rest = trimmed.slice(sep + 1).trim();
    const keyLower = key.toLowerCase();

    // DTC lines: "DTC: P0301" or "Stored Codes: P0301, P0420".
    if (keyLower.includes("dtc") || keyLower.includes("code")) {
      const status = keyLower.includes("pending")
        ? "pending"
        : keyLower.includes("permanent")
          ? "permanent"
          : "stored";
      const tokens = rest.split(/[,;\s]+/).filter(t => t.length > 0);
      let matched = 0;
      for (const token of tokens) {
        const code = parseDtc(token);
        if (code) {
          dtcs.push({ code, status: status as DtcRecord["status"], source });
          matched++;
        }
      }
      if (matched === 0 && rest !== "" && !/^(none|no codes?|0)$/i.test(rest)) {
        warnings.push(`Line ${i + 1}: no valid DTC codes in "${truncate(rest)}".`);
      }
      continue;
    }

    // Readiness monitor lines: "Catalyst: Ready".
    const monitorName = matchReadinessName(key);
    if (monitorName) {
      const state = parseReadinessState(rest);
      if (state) {
        monitors.push({ name: monitorName, state });
        continue;
      }
      warnings.push(`Line ${i + 1}: unrecognized readiness state "${truncate(rest)}" for ${monitorName}.`);
      continue;
    }

    // Otherwise treat as a PID sample: "Engine RPM: 820 rpm".
    const { value, unit } = splitValueUnit(rest);
    if (value === "") {
      warnings.push(`Line ${i + 1}: no value for "${key}"; skipped.`);
      continue;
    }
    if (unit && !isKnownUnit(unit)) {
      warnings.push(`Line ${i + 1}: unrecognized unit "${unit}" for "${key}"; passed through.`);
    }
    // Back-fill hex PID from label/alias.
    const kvPid = resolvePidCode(undefined, key);
    const sample: PidSample = {
      label: resolveLabel(kvPid, key),
      value: coerceValue(value),
      source
    };
    if (kvPid) sample.pid = kvPid;
    const resolvedUnit = normalizeUnit(kvPid, key, unit);
    if (resolvedUnit) sample.unit = resolvedUnit;
    samples.push(sample);
  }

  const result: ParsedScanLog = { samples, dtcs, warnings };
  if (monitors.length > 0) result.readiness = buildReadinessSnapshot(monitors);
  return result;
}

/** Split "820 rpm" into { value: "820", unit: "rpm" }; tolerant of no unit. */
function splitValueUnit(rest: string): { value: string; unit?: string } {
  const trimmed = rest.trim();
  const m = /^([-+]?[0-9]*\.?[0-9]+)\s*(.*)$/.exec(trimmed);
  if (m) {
    const unit = m[2].trim();
    return { value: m[1], unit: unit.length > 0 ? unit : undefined };
  }
  return { value: trimmed };
}

function truncate(s: string, max = 40): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Parse a scan log into a normalized evidence trail. Auto-detects CSV vs
 * key:value text unless `opts.format` forces a mode. Never throws: bad input
 * surfaces in `warnings`.
 */
export function parseScanLog(content: string, opts: ParseScanLogOptions = {}): ParsedScanLog {
  const source = opts.source ?? SOURCE_DEFAULT;

  if (typeof content !== "string" || content.trim() === "") {
    return { samples: [], dtcs: [], warnings: ["Empty log content; nothing to parse."] };
  }

  const lines = content.split(/\r\n|\r|\n/);
  const format = opts.format ?? "auto";

  if (format === "keyvalue") {
    return parseKeyValue(lines, source);
  }

  if (format === "csv") {
    // Even when format is forced to csv, prefer the wide path if the header looks wide.
    return looksLikeWide(lines) ? parseWideCsv(lines, source) : parseCsv(lines, source);
  }

  // auto: try wide first (more specific), then long CSV, then key:value.
  if (looksLikeWide(lines)) return parseWideCsv(lines, source);
  if (looksLikeCsv(lines)) return parseCsv(lines, source);
  return parseKeyValue(lines, source);
}
