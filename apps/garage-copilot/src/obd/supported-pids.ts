/**
 * Decode the Mode-01 "supported PIDs" bitmask responses (PID 00, 20, 40, …).
 *
 * Each of these PIDs returns a 4-byte (32-bit) bitmask describing which of the
 * next 0x20 PIDs the ECU supports. The most-significant bit of byte A is the
 * first PID in the range; the least-significant bit of byte D is the last. The
 * last PID of each range (0x20, 0x40, …) doubles as a "next range available"
 * flag. Pure; no I/O.
 */

const toHex = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0");

/** The range-marker PIDs that signal "next bank supported" (not real sensors). */
export const SUPPORT_RANGE_PIDS = ["20", "40", "60", "80", "A0", "C0", "E0"];

/**
 * Decode one supported-PIDs bitmask. `basePid` is the PID queried (0x00, 0x20,
 * …); the 32 bits map to PIDs basePid+1 … basePid+0x20. Returns the supported
 * PID hex codes (including the range-marker bit if set).
 */
export function decodeSupportedPids(basePid: number, data: number[]): string[] {
  if (data.length < 4) return [];
  const supported: string[] = [];
  for (let i = 0; i < 32; i++) {
    const byte = data[Math.floor(i / 8)];
    const bit = 7 - (i % 8);
    if ((byte >> bit) & 1) supported.push(toHex(basePid + 1 + i));
  }
  return supported;
}
