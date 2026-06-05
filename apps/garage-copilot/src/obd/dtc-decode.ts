/**
 * Decoding of raw OBD-II response bytes into DTCs and monitor (I/M readiness)
 * status. These are pure functions over byte arrays — the ELM327 driver
 * (./elm327.ts) hands them the parsed hex bytes; nothing here does any I/O.
 *
 * Standards: the DTC byte layout and the Mode-01 PID-01 monitor-status layout
 * are public SAE J2012 / J1979 definitions, identical across makes.
 */

const DTC_LETTERS = ["P", "C", "B", "U"] as const;

/** Parse a single ELM327 response line ("41 0C 1A F8") into bytes [0x41,...]. */
export function parseHexBytes(line: string): number[] {
  const cleaned = line.trim().toUpperCase();
  if (cleaned.length === 0) return [];
  // Accept space-separated ("41 0C 1A F8") or packed ("410C1AF8") hex.
  const compact = cleaned.replace(/\s+/g, "");
  if (!/^[0-9A-F]+$/.test(compact) || compact.length % 2 !== 0) return [];
  const bytes: number[] = [];
  for (let i = 0; i < compact.length; i += 2) {
    bytes.push(parseInt(compact.slice(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Decode a 2-byte DTC pair into a code string (e.g. [0x01,0x33] -> "P0133").
 * Returns null for the all-zero padding pair (0x00 0x00), which represents
 * "no code" in a fixed-width response.
 */
export function decodeDtcBytes(a: number, b: number): string | null {
  if (a === 0 && b === 0) return null;
  const letter = DTC_LETTERS[(a >> 6) & 0x03];
  const firstDigit = (a >> 4) & 0x03;
  const second = a & 0x0f;
  const third = (b >> 4) & 0x0f;
  const fourth = b & 0x0f;
  return (
    letter +
    firstDigit.toString(16) +
    second.toString(16) +
    third.toString(16) +
    fourth.toString(16)
  ).toUpperCase();
}

/**
 * Decode a sequence of DTC data bytes (pairs) into codes, dropping all-zero
 * padding. Used for Mode 03 (stored), 07 (pending) and 0A (permanent) once the
 * service header byte has been removed.
 */
export function decodeTroubleCodes(data: number[]): string[] {
  const codes: string[] = [];
  for (let i = 0; i + 1 < data.length; i += 2) {
    const code = decodeDtcBytes(data[i], data[i + 1]);
    if (code) codes.push(code);
  }
  return codes;
}

/**
 * Decode a full Mode 03/07/0A response (one or more ELM327 lines) into DTC
 * codes. `service` is the positive-response service byte to strip (0x43 for
 * mode 03, 0x47 for 07, 0x4A for 0A).
 *
 * On CAN (ISO 15765-4) the ECU prefixes the DTC pairs with a one-byte COUNT of
 * codes right after the service byte (`43 NN <pairs>`). That byte must be
 * skipped or it pairs with the first code's high byte and yields garbage; set
 * `skipCountByte` for CAN protocols. Legacy protocols (J1850/ISO 9141/KWP) have
 * no count byte. Any ISO-TP frame index ("0:", "1:") an adapter prints for a
 * multi-frame response is stripped per line.
 */
export function decodeDtcResponse(
  lines: string[],
  service: number,
  options: { skipCountByte?: boolean } = {}
): string[] {
  const codes = new Set<string>();
  for (const raw of lines) {
    const bytes = parseHexBytes(raw.replace(/^[0-9A-Fa-f]+:\s*/, ""));
    const idx = bytes.indexOf(service);
    if (idx === -1) continue;
    let payload = bytes.slice(idx + 1);
    if (options.skipCountByte && payload.length > 0) payload = payload.slice(1);
    for (const code of decodeTroubleCodes(payload)) codes.add(code);
  }
  return [...codes];
}

/** Monitor (I/M readiness) state for one monitor. */
export type MonitorState = "ready" | "not-ready" | "not-supported";

/** A single readiness monitor and its decoded state. */
export type ReadinessMonitor = { name: string; state: MonitorState };

/** Decoded Mode-01 PID-01 monitor status. */
export type MonitorStatus = {
  /** Malfunction Indicator Lamp ("check engine light"). */
  milOn: boolean;
  /** Number of confirmed DTCs the ECU reports alongside the MIL. */
  dtcCount: number;
  /** Engine type implied by byte B bit 3. */
  ignitionType: "spark" | "compression";
  monitors: ReadinessMonitor[];
};

/** Continuous monitors live in byte B (low nibble = supported, high nibble = incomplete). */
const CONTINUOUS = [
  { name: "Misfire", bit: 0x01 },
  { name: "Fuel System", bit: 0x02 },
  { name: "Components", bit: 0x04 }
] as const;

/**
 * Non-continuous monitors in bytes C (supported) and D (incomplete), spark-
 * ignition bit layout (SAE J1979). Compression-ignition uses a different set
 * for some bits; we label using the common spark-ignition names and rely on the
 * supported bit to suppress monitors a given vehicle does not implement.
 */
const NON_CONTINUOUS = [
  { name: "Catalyst", bit: 0x01 },
  { name: "Heated Catalyst", bit: 0x02 },
  { name: "Evaporative System", bit: 0x04 },
  { name: "Secondary Air System", bit: 0x08 },
  { name: "A/C Refrigerant", bit: 0x10 },
  { name: "Oxygen Sensor", bit: 0x20 },
  { name: "Oxygen Sensor Heater", bit: 0x40 },
  { name: "EGR System", bit: 0x80 }
] as const;

function monitorState(supported: boolean, incomplete: boolean): MonitorState {
  if (!supported) return "not-supported";
  return incomplete ? "not-ready" : "ready";
}

/**
 * Decode Mode-01 PID-01 monitor status from its 4 data bytes [A,B,C,D] (the
 * bytes after the "41 01" header). Throws if fewer than 4 bytes are supplied,
 * since a partial status cannot be trusted.
 */
export function decodeMonitorStatus(data: number[]): MonitorStatus {
  if (data.length < 4) {
    throw new Error(`Monitor status needs 4 data bytes, got ${data.length}`);
  }
  const [a, b, c, d] = data;
  const monitors: ReadinessMonitor[] = [];

  for (const m of CONTINUOUS) {
    const supported = (b & m.bit) !== 0;
    const incomplete = (b & (m.bit << 4)) !== 0;
    monitors.push({ name: m.name, state: monitorState(supported, incomplete) });
  }
  for (const m of NON_CONTINUOUS) {
    const supported = (c & m.bit) !== 0;
    const incomplete = (d & m.bit) !== 0;
    monitors.push({ name: m.name, state: monitorState(supported, incomplete) });
  }

  return {
    milOn: (a & 0x80) !== 0,
    dtcCount: a & 0x7f,
    ignitionType: (b & 0x08) !== 0 ? "compression" : "spark",
    monitors
  };
}
