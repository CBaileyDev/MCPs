/**
 * Offline VIN validation + structural decode.
 *
 * Mirrors the vpic MCP server's validator (universal format check + the North
 * American mod-11 check digit) and adds the fields you can read straight from
 * the 17 characters with no network: the world-manufacturer region/country
 * (WMI), the model year (position 10, disambiguated by position 7), and the
 * assembly-plant code. Precise make/model/engine needs the online NHTSA vPIC
 * lookup; everything here is pure and offline.
 */

/** ISO 3779 / NHTSA transliteration. I, O, Q are intentionally absent. */
const TRANSLITERATION: Readonly<Record<string, number>> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9
};

/** Positional weights, index 0..16. Position 9 (index 8) is the check digit → weight 0. */
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

const LEGAL_CHAR = /^[A-HJ-NPR-Z0-9]$/;

export interface VinFormat {
  ok: boolean;
  length: number;
  illegalChars: string[];
  issues: string[];
}

export interface VinCheckDigit {
  evaluated: boolean;
  expected: string | null;
  found: string | null;
  matches: boolean | null;
  note: string;
}

export interface VinValidation {
  input: string;
  normalized: string;
  format: VinFormat;
  checkDigit: VinCheckDigit;
  assessment: string;
}

/** Trim + uppercase. (Does not strip internal spaces — those are format errors.) */
export function normalizeVin(vin: string): string {
  return vin.trim().toUpperCase();
}

/** Universal format check: 17 chars, all from the legal VIN alphabet. */
export function checkVinFormat(vin: string): VinFormat {
  const normalized = normalizeVin(vin);
  const issues: string[] = [];
  const illegal = new Set<string>();

  for (const ch of normalized) {
    if (!LEGAL_CHAR.test(ch)) illegal.add(ch);
  }
  if (normalized.length !== 17) {
    issues.push(`Length is ${normalized.length}; a VIN must be exactly 17 characters.`);
  }
  if (illegal.size > 0) {
    const hasIOQ = [...illegal].some(c => "IOQ".includes(c));
    issues.push(
      `Illegal character(s): ${[...illegal].join(", ")}.` +
        (hasIOQ ? " VINs never use I, O, or Q (to avoid confusion with 1/0)." : "")
    );
  }

  return { ok: normalized.length === 17 && illegal.size === 0, length: normalized.length, illegalChars: [...illegal], issues };
}

/** North-American check digit (char "0"-"9" or "X"). Throws unless 17 legal chars. */
export function computeCheckDigit(vin: string): string {
  const normalized = normalizeVin(vin);
  if (normalized.length !== 17) throw new Error("computeCheckDigit requires a 17-character VIN");
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const value = TRANSLITERATION[normalized[i]];
    if (value === undefined) throw new Error(`Illegal VIN character ${JSON.stringify(normalized[i])} at position ${i + 1}`);
    sum += value * WEIGHTS[i];
  }
  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

/** Full validation: universal format + NA check digit, reported separately. */
export function validateVin(vin: string): VinValidation {
  const normalized = normalizeVin(vin);
  const format = checkVinFormat(vin);

  let checkDigit: VinCheckDigit;
  if (!format.ok) {
    checkDigit = { evaluated: false, expected: null, found: null, matches: null, note: "Check digit not evaluated — fix the format first." };
  } else {
    const expected = computeCheckDigit(normalized);
    const found = normalized[8];
    const matches = expected === found;
    checkDigit = {
      evaluated: true,
      expected,
      found,
      matches,
      note: matches
        ? "Position 9 matches the North American (FMVSS/ISO 3779) check digit."
        : "Position 9 does NOT match the North American check digit — either a transcription error, or a " +
          "non-North-American-market VIN (many EU/JP VINs do not use the scheme)."
    };
  }

  let assessment: string;
  if (!format.ok) {
    assessment = `Invalid format — ${format.issues.join(" ")} This is a transcription error; re-check the VIN.`;
  } else if (checkDigit.matches) {
    assessment = "Format is valid and the North American check digit matches.";
  } else {
    assessment =
      "Format is valid but the North American check digit does not match. Likely a typo — unless this is a " +
      "non-NA-market (e.g. European/Japanese) VIN, which may legitimately not use the check digit.";
  }

  return { input: vin, normalized, format, checkDigit, assessment };
}

// ---- Structural decode (offline) -------------------------------------------

/** Model-year codes for positions, 1980→2009 in order (I/O/Q/U/Z/0 excluded). */
const MODEL_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

/**
 * Model year from position 10, disambiguated by position 7: for light vehicles
 * an alphabetic 7th character means the 2010–2039 cycle, numeric means 1980–2009.
 */
export function decodeModelYear(vin: string): number | undefined {
  const n = normalizeVin(vin);
  if (n.length !== 17) return undefined;
  const idx = MODEL_YEAR_CODES.indexOf(n[9]);
  if (idx === -1) return undefined;
  let year = 1980 + idx;
  if (/[A-Z]/.test(n[6])) year += 30; // position 7 alphabetic → newer cycle
  return year;
}

/** Country/region of origin from the first WMI character. Common assignments. */
export function decodeOrigin(firstChar: string): { country?: string; region?: string } {
  const c = (firstChar ?? "").toUpperCase();
  const map: Record<string, [string, string]> = {
    "1": ["United States", "North America"],
    "4": ["United States", "North America"],
    "5": ["United States", "North America"],
    "2": ["Canada", "North America"],
    "3": ["Mexico", "North America"],
    "6": ["Australia", "Oceania"],
    "7": ["New Zealand", "Oceania"],
    "8": ["Argentina / South America", "South America"],
    "9": ["Brazil / South America", "South America"],
    J: ["Japan", "Asia"],
    K: ["South Korea", "Asia"],
    L: ["China", "Asia"],
    M: ["India / Asia", "Asia"],
    N: ["Turkey / Asia", "Asia"],
    P: ["Asia", "Asia"],
    R: ["Taiwan / Asia", "Asia"],
    S: ["United Kingdom", "Europe"],
    T: ["Europe (DE/CZ/HU)", "Europe"],
    V: ["Europe (FR/ES/AT)", "Europe"],
    W: ["Germany", "Europe"],
    X: ["Russia / Europe", "Europe"],
    Y: ["Europe (SE/FI/BY)", "Europe"],
    Z: ["Italy", "Europe"]
  };
  if (/[A-H]/.test(c)) return { country: "Africa", region: "Africa" };
  const m = map[c];
  return m ? { country: m[0], region: m[1] } : {};
}

export interface VinDecode {
  vin: string;
  validation: VinValidation;
  /** World Manufacturer Identifier (chars 1–3). */
  wmi: string;
  /** Vehicle Descriptor Section (chars 4–9). */
  vds: string;
  /** Vehicle Identifier Section (chars 10–17). */
  vis: string;
  country?: string;
  region?: string;
  modelYear?: number;
  /** Assembly-plant code (position 11) — manufacturer-specific, not decoded offline. */
  plantCode?: string;
  /** Production serial number (positions 12–17). */
  serial?: string;
}

/** Validate + structurally decode a VIN, entirely offline. */
export function decodeVin(raw: string): VinDecode {
  const vin = normalizeVin(raw);
  const validation = validateVin(raw);
  const result: VinDecode = { vin, validation, wmi: vin.slice(0, 3), vds: vin.slice(3, 9), vis: vin.slice(9, 17) };
  if (validation.format.ok) {
    const origin = decodeOrigin(vin[0]);
    result.country = origin.country;
    result.region = origin.region;
    result.modelYear = decodeModelYear(vin);
    result.plantCode = vin[10];
    result.serial = vin.slice(11);
  }
  return result;
}
