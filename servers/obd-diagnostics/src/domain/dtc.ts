/**
 * Diagnostic Trouble Code (DTC) parsing and STRUCTURAL decode.
 *
 * This module decodes only the structure of a DTC string as defined by the
 * public OBD-II / SAE J2012 code format (system letter, generic vs
 * manufacturer digit, subsystem digit). It deliberately does NOT ship a
 * description table: the human-readable meaning of a specific code is
 * proprietary, so `description` stays undefined unless a caller supplies one.
 */

/** A normalized DTC observation, with optional caller-supplied description. */
export type DtcRecord = {
  /** Normalized uppercase code, e.g. "P0301". */
  code: string;
  /** Where the code sits in the OBD lifecycle, when known. */
  status?: "stored" | "pending" | "permanent";
  /** ECU / module that reported the code, when known (e.g. "ECM"). */
  module?: string;
  /** Caller-supplied human description; never inferred from a bundled table. */
  description?: string;
  /** Where this record came from (e.g. "mock-adapter", "scan-log"). */
  source: string;
};

/** Structural decode of a DTC string — purely from its format, no lookup. */
export type DtcStructure = {
  system: "powertrain" | "body" | "chassis" | "network";
  codeType: "generic" | "manufacturer";
  /** The third character of the code, as a string (the subsystem group). */
  subsystem: string;
};

/** Standard OBD-II DTC format: letter + 4 hex-ish chars (case-insensitive). */
const DTC_PATTERN = /^[PBCU][0-3][0-9A-F]{3}$/i;

const SYSTEM_BY_LETTER: Record<string, DtcStructure["system"]> = {
  P: "powertrain",
  B: "body",
  C: "chassis",
  U: "network"
};

/**
 * Validate and normalize a DTC string. Returns the uppercase code when it
 * matches the standard format, or `null` otherwise. Returning null (rather
 * than throwing) lets log parsing skip malformed tokens without try/catch.
 */
export function parseDtc(code: string): string | null {
  if (typeof code !== "string") return null;
  const trimmed = code.trim().toUpperCase();
  return DTC_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Decode the STRUCTURE of a DTC: which vehicle system it belongs to, whether
 * it is a generic (SAE) or manufacturer-specific code, and its subsystem
 * digit. Throws on an invalid code so callers that need structure fail loudly;
 * use parseDtc first if you want a tolerant check.
 *
 * codeType rule (SAE J2012): the second character encodes standardization.
 *   '0' -> generic (SAE-defined)
 *   '1' -> manufacturer-specific
 *   '2'/'3' -> reserved/jointly-defined; this is unpinned by the public spec,
 *              so we treat '2'/'3' as "manufacturer" (i.e. only '0' is purely
 *              generic). No required behavior depends on the 2/3 choice.
 */
export function decodeDtcStructure(code: string): DtcStructure {
  const normalized = parseDtc(code);
  if (normalized === null) {
    throw new Error(`Invalid DTC format: ${JSON.stringify(code)} (expected like P0301)`);
  }

  const system = SYSTEM_BY_LETTER[normalized[0]];
  const codeType: DtcStructure["codeType"] = normalized[1] === "0" ? "generic" : "manufacturer";
  const subsystem = normalized[2];

  return { system, codeType, subsystem };
}
