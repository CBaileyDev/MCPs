/**
 * Standard public SAE J1979 Mode-01 PID decode formulas.
 *
 * This is the small, well-known set of generic OBD-II live parameters and their
 * scaling formulas — public structural definitions, not a proprietary table.
 * Each entry says how many data bytes the PID returns and how to turn those raw
 * bytes into an engineering value. Decoders are pure functions of the data bytes
 * (the bytes AFTER the "41 <pid>" response header), so they are trivial to test
 * against pinned reference values.
 */

/** A decoded live parameter value. */
export type DecodedPid = {
  /** Canonical Mode-01 PID hex, uppercase 2-char (e.g. "0C"). */
  pid: string;
  /** Human label (e.g. "Engine RPM"). */
  label: string;
  /** Engineering value. */
  value: number;
  /** Engineering unit, when dimensioned. */
  unit?: string;
};

/** Definition of how to decode one Mode-01 PID. */
export type PidFormula = {
  pid: string;
  label: string;
  unit?: string;
  /** Number of data bytes expected (after the response header). */
  bytes: number;
  /** Decode the data bytes into an engineering value. */
  decode: (data: number[]) => number;
};

const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The supported generic PID formulas, keyed by canonical PID hex. Formulas are
 * the standard J1979 scalings. Where a value is rounded it is to 2 decimals to
 * avoid noisy floating point in reports.
 */
export const PID_FORMULAS: Record<string, PidFormula> = {
  "04": { pid: "04", label: "Calculated Engine Load", unit: "%", bytes: 1, decode: ([a]) => r2((a * 100) / 255) },
  "05": { pid: "05", label: "Engine Coolant Temperature", unit: "C", bytes: 1, decode: ([a]) => a - 40 },
  "06": { pid: "06", label: "Short Term Fuel Trim (Bank 1)", unit: "%", bytes: 1, decode: ([a]) => r2((a - 128) * (100 / 128)) },
  "07": { pid: "07", label: "Long Term Fuel Trim (Bank 1)", unit: "%", bytes: 1, decode: ([a]) => r2((a - 128) * (100 / 128)) },
  "08": { pid: "08", label: "Short Term Fuel Trim (Bank 2)", unit: "%", bytes: 1, decode: ([a]) => r2((a - 128) * (100 / 128)) },
  "09": { pid: "09", label: "Long Term Fuel Trim (Bank 2)", unit: "%", bytes: 1, decode: ([a]) => r2((a - 128) * (100 / 128)) },
  "0A": { pid: "0A", label: "Fuel Pressure", unit: "kPa", bytes: 1, decode: ([a]) => a * 3 },
  "0B": { pid: "0B", label: "Intake Manifold Pressure", unit: "kPa", bytes: 1, decode: ([a]) => a },
  "0C": { pid: "0C", label: "Engine RPM", unit: "rpm", bytes: 2, decode: ([a, b]) => r2((256 * a + b) / 4) },
  "0D": { pid: "0D", label: "Vehicle Speed", unit: "km/h", bytes: 1, decode: ([a]) => a },
  "0E": { pid: "0E", label: "Timing Advance", unit: "deg", bytes: 1, decode: ([a]) => r2(a / 2 - 64) },
  "0F": { pid: "0F", label: "Intake Air Temperature", unit: "C", bytes: 1, decode: ([a]) => a - 40 },
  "10": { pid: "10", label: "Mass Air Flow", unit: "g/s", bytes: 2, decode: ([a, b]) => r2((256 * a + b) / 100) },
  "11": { pid: "11", label: "Throttle Position", unit: "%", bytes: 1, decode: ([a]) => r2((a * 100) / 255) },
  "1F": { pid: "1F", label: "Run Time Since Engine Start", unit: "s", bytes: 2, decode: ([a, b]) => 256 * a + b },
  "21": { pid: "21", label: "Distance With MIL On", unit: "km", bytes: 2, decode: ([a, b]) => 256 * a + b },
  "2F": { pid: "2F", label: "Fuel Tank Level", unit: "%", bytes: 1, decode: ([a]) => r2((a * 100) / 255) },
  "14": { pid: "14", label: "O2 Sensor 1 Voltage", unit: "V", bytes: 2, decode: ([a]) => r2(a / 200) },
  "22": { pid: "22", label: "Fuel Rail Pressure (rel. manifold)", unit: "kPa", bytes: 2, decode: ([a, b]) => r2((256 * a + b) * 0.079) },
  "23": { pid: "23", label: "Fuel Rail Gauge Pressure", unit: "kPa", bytes: 2, decode: ([a, b]) => (256 * a + b) * 10 },
  "2C": { pid: "2C", label: "Commanded EGR", unit: "%", bytes: 1, decode: ([a]) => r2((a * 100) / 255) },
  "2D": { pid: "2D", label: "EGR Error", unit: "%", bytes: 1, decode: ([a]) => r2((a - 128) * (100 / 128)) },
  "2E": { pid: "2E", label: "Commanded Evap Purge", unit: "%", bytes: 1, decode: ([a]) => r2((a * 100) / 255) },
  "30": { pid: "30", label: "Warm-ups Since Codes Cleared", unit: "count", bytes: 1, decode: ([a]) => a },
  "31": { pid: "31", label: "Distance Since Codes Cleared", unit: "km", bytes: 2, decode: ([a, b]) => 256 * a + b },
  "32": {
    pid: "32",
    label: "Evap System Vapor Pressure",
    unit: "Pa",
    bytes: 2,
    decode: ([a, b]) => {
      const raw = 256 * a + b;
      return (raw > 32767 ? raw - 65536 : raw) / 4; // signed 16-bit
    }
  },
  "33": { pid: "33", label: "Barometric Pressure", unit: "kPa", bytes: 1, decode: ([a]) => a },
  "42": { pid: "42", label: "Control Module Voltage", unit: "V", bytes: 2, decode: ([a, b]) => r2((256 * a + b) / 1000) },
  "43": { pid: "43", label: "Absolute Load Value", unit: "%", bytes: 2, decode: ([a, b]) => r2(((256 * a + b) * 100) / 255) },
  "44": { pid: "44", label: "Commanded Equivalence Ratio (λ)", unit: "ratio", bytes: 2, decode: ([a, b]) => r2((256 * a + b) / 32768) },
  "45": { pid: "45", label: "Relative Throttle Position", unit: "%", bytes: 1, decode: ([a]) => r2((a * 100) / 255) },
  "46": { pid: "46", label: "Ambient Air Temperature", unit: "C", bytes: 1, decode: ([a]) => a - 40 },
  "47": { pid: "47", label: "Absolute Throttle Position B", unit: "%", bytes: 1, decode: ([a]) => r2((a * 100) / 255) },
  "49": { pid: "49", label: "Accelerator Pedal Position D", unit: "%", bytes: 1, decode: ([a]) => r2((a * 100) / 255) },
  "4A": { pid: "4A", label: "Accelerator Pedal Position E", unit: "%", bytes: 1, decode: ([a]) => r2((a * 100) / 255) },
  "4C": { pid: "4C", label: "Commanded Throttle Actuator", unit: "%", bytes: 1, decode: ([a]) => r2((a * 100) / 255) },
  "4D": { pid: "4D", label: "Time Run With MIL On", unit: "min", bytes: 2, decode: ([a, b]) => 256 * a + b },
  "4E": { pid: "4E", label: "Time Since Codes Cleared", unit: "min", bytes: 2, decode: ([a, b]) => 256 * a + b },
  "5A": { pid: "5A", label: "Relative Accelerator Pedal Position", unit: "%", bytes: 1, decode: ([a]) => r2((a * 100) / 255) },
  "5B": { pid: "5B", label: "Hybrid Battery Pack Remaining Life", unit: "%", bytes: 1, decode: ([a]) => r2((a * 100) / 255) },
  "5C": { pid: "5C", label: "Engine Oil Temperature", unit: "C", bytes: 1, decode: ([a]) => a - 40 },
  "5E": { pid: "5E", label: "Engine Fuel Rate", unit: "L/h", bytes: 2, decode: ([a, b]) => r2((256 * a + b) / 20) }
};

/** Normalize a PID token to canonical 2-char uppercase hex, or undefined. */
export function normalizePid(pid: string | undefined): string | undefined {
  if (typeof pid !== "string") return undefined;
  let t = pid.trim().toUpperCase();
  if (t.startsWith("0X")) t = t.slice(2);
  if (t.length === 0 || !/^[0-9A-F]+$/.test(t)) return undefined;
  return t.padStart(2, "0");
}

/** Look up a formula for a PID (tolerant of formatting). */
export function lookupFormula(pid: string | undefined): PidFormula | undefined {
  const code = normalizePid(pid);
  return code ? PID_FORMULAS[code] : undefined;
}

/**
 * Decode a Mode-01 PID from its data bytes (the bytes AFTER the "41 <pid>"
 * header). Returns undefined for an unknown PID or when too few bytes were
 * supplied — never throws, so a partial frame can be skipped rather than crash a
 * read loop.
 */
export function decodePidData(pid: string, data: number[]): DecodedPid | undefined {
  const formula = lookupFormula(pid);
  if (!formula) return undefined;
  if (data.length < formula.bytes) return undefined;
  const value = formula.decode(data.slice(0, formula.bytes));
  return { pid: formula.pid, label: formula.label, value, unit: formula.unit };
}
