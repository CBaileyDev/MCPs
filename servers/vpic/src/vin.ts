/**
 * Offline VIN validation — a deterministic pre-flight check before spending an
 * API round-trip on a typo'd VIN.
 *
 * Two independent layers, deliberately reported separately because they have
 * different scope:
 *
 *  1. FORMAT (universal): a VIN is 17 characters from the set A-Z and 0-9 with
 *     I, O, and Q excluded (they look like 1/0). A format failure is a definite
 *     transcription error, true for every market.
 *
 *  2. CHECK DIGIT (North America only): FMVSS/ISO 3779 requires position 9 of a
 *     US/Canada-market VIN to be a mod-11 check digit over the other 16. This is
 *     NOT mandated for many European/Japanese-market VINs, so a check-digit
 *     mismatch on a format-valid VIN means "a typo OR a non-NA VIN that doesn't
 *     use the scheme" — never a bare "invalid".
 */

/** Standard ISO 3779 / NHTSA transliteration. I, O, Q are intentionally absent. */
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
  /** True only when the VIN is exactly 17 legal characters. A failure is a definite typo. */
  ok: boolean;
  length: number;
  /** Illegal characters found (includes I/O/Q and anything outside A-Z0-9), de-duplicated. */
  illegalChars: string[];
  issues: string[];
}

export interface VinCheckDigit {
  /** Whether the check digit could be evaluated (only when format is ok). */
  evaluated: boolean;
  /** Expected check-digit character ("0"-"9" or "X"), or null when not evaluated. */
  expected: string | null;
  /** The actual character at position 9, or null when not evaluated. */
  found: string | null;
  /** True/false when evaluated, else null. */
  matches: boolean | null;
  note: string;
}

export interface VinValidation {
  input: string;
  normalized: string;
  format: VinFormat;
  checkDigit: VinCheckDigit;
  /** Plain-language interpretation that combines both layers with correct hedging. */
  assessment: string;
}

/** Normalize: trim and uppercase. (Does not strip internal spaces — those are format errors.) */
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

  return {
    ok: normalized.length === 17 && illegal.size === 0,
    length: normalized.length,
    illegalChars: [...illegal],
    issues
  };
}

/**
 * Compute the North-American check digit character for a format-valid VIN.
 * Returns "0"-"9" or "X". Throws if the VIN is not 17 legal characters — call
 * checkVinFormat first.
 */
export function computeCheckDigit(vin: string): string {
  const normalized = normalizeVin(vin);
  if (normalized.length !== 17) {
    throw new Error("computeCheckDigit requires a 17-character VIN");
  }
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const value = TRANSLITERATION[normalized[i]];
    if (value === undefined) {
      throw new Error(`Illegal VIN character ${JSON.stringify(normalized[i])} at position ${i + 1}`);
    }
    sum += value * WEIGHTS[i];
  }
  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

/** Full validation: universal format + NA-specific check digit, reported separately. */
export function validateVin(vin: string): VinValidation {
  const normalized = normalizeVin(vin);
  const format = checkVinFormat(vin);

  let checkDigit: VinCheckDigit;
  if (!format.ok) {
    checkDigit = {
      evaluated: false,
      expected: null,
      found: null,
      matches: null,
      note: "Check digit not evaluated — fix the format first."
    };
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
        : "Position 9 does NOT match the North American check digit. This means either a " +
          "transcription error, OR a non-North-American-market VIN (many EU/JP VINs do not use " +
          "the check-digit scheme). It does not by itself prove the VIN is wrong."
    };
  }

  let assessment: string;
  if (!format.ok) {
    assessment = `Invalid format — ${format.issues.join(" ")} This is a transcription error; re-check the VIN.`;
  } else if (checkDigit.matches) {
    assessment =
      "Format is valid and the North American check digit matches. Safe to look up.";
  } else {
    assessment =
      "Format is valid but the North American check digit does not match. Likely a typo — re-check the " +
      "characters — unless this is a non-NA-market (e.g. European/Japanese) VIN, which may legitimately " +
      "not use the check digit. Worth confirming before relying on it.";
  }

  return { input: vin, normalized, format, checkDigit, assessment };
}
