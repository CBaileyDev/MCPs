/**
 * Decode a Mode 09 PID 02 (Vehicle Identification Number) response.
 *
 * The VIN comes back as ASCII bytes after a "49 02" header, often spread across
 * several ISO-TP frames that an ELM327 prints with a leading frame index
 * ("0:", "1:", …) and sometimes a length line. This decoder is tolerant of all
 * of that: it strips frame indices, concatenates the bytes, and keeps the
 * printable ASCII after the header (the count byte and any 0x00 padding are
 * non-printable and fall away naturally). Pure; no I/O.
 */

import { parseHexBytes } from "./dtc-decode.js";

/**
 * Decode the VIN from a Mode 09 PID 02 response (one or more lines). Returns the
 * uppercased VIN string, or undefined if no "49 02" frame is found or the result
 * is implausibly short.
 */
export function decodeVinResponse(lines: string[]): string | undefined {
  const bytes: number[] = [];
  for (const raw of lines) {
    // Drop an ISO-TP frame index like "0:" / "1:" that ELM327 prefixes.
    const cleaned = raw.replace(/^[0-9A-Fa-f]+:\s*/, "");
    bytes.push(...parseHexBytes(cleaned));
  }

  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0x49 && bytes[i + 1] === 0x02) {
      const vin = bytes
        .slice(i + 2)
        .filter(b => b >= 0x20 && b <= 0x7e) // printable ASCII only (drops count + 0x00 pad)
        .map(b => String.fromCharCode(b))
        .join("")
        .replace(/\s+/g, "")
        .toUpperCase();
      return vin.length >= 11 ? vin : undefined;
    }
  }
  return undefined;
}

/** Strict 17-char VIN check (excludes I, O, Q per the standard). */
export function isValidVin(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin.trim().toUpperCase());
}
