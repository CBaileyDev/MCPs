import { describe, expect, it } from "vitest";
import { checkVinFormat, computeCheckDigit, normalizeVin, validateVin } from "./vin.js";

describe("computeCheckDigit", () => {
  // Hand-verified against the ISO 3779 / NHTSA mod-11 algorithm.
  it("computes the check digit for known-valid VINs", () => {
    expect(computeCheckDigit("1HGCM82633A004352")).toBe("3"); // Honda Accord 2003
    expect(computeCheckDigit("11111111111111111")).toBe("1"); // all-ones reference VIN
    expect(computeCheckDigit("1M8GDM9AXKP042788")).toBe("X"); // remainder 10 → "X"
  });

  it("throws on a non-17-character input (caller must format-check first)", () => {
    expect(() => computeCheckDigit("1HGCM82633A0043")).toThrow();
  });
});

describe("checkVinFormat (universal)", () => {
  it("accepts a well-formed 17-char VIN", () => {
    const f = checkVinFormat("1HGCM82633A004352");
    expect(f.ok).toBe(true);
    expect(f.length).toBe(17);
    expect(f.illegalChars).toEqual([]);
  });

  it("rejects the wrong length", () => {
    const f = checkVinFormat("1HGCM82633A00435"); // 16 chars
    expect(f.ok).toBe(false);
    expect(f.length).toBe(16);
  });

  it("rejects I, O, Q and reports them", () => {
    const f = checkVinFormat("1HGCM82633A0O4352"); // an O where a 0 belongs
    expect(f.ok).toBe(false);
    expect(f.illegalChars).toContain("O");
  });

  it("normalizes case and trims surrounding whitespace", () => {
    expect(normalizeVin("  1hgcm82633a004352 ")).toBe("1HGCM82633A004352");
    expect(checkVinFormat(" 1hgcm82633a004352 ").ok).toBe(true);
  });
});

describe("validateVin", () => {
  it("reports a fully valid North American VIN", () => {
    const r = validateVin("1HGCM82633A004352");
    expect(r.format.ok).toBe(true);
    expect(r.checkDigit.evaluated).toBe(true);
    expect(r.checkDigit.expected).toBe("3");
    expect(r.checkDigit.found).toBe("3");
    expect(r.checkDigit.matches).toBe(true);
    expect(r.assessment.toLowerCase()).toContain("safe to look up");
  });

  it("flags a check-digit mismatch as typo-OR-non-NA, never a bare invalid", () => {
    // Same VIN with the last char changed: still a legal 17-char string, but the
    // check digit no longer matches.
    const r = validateVin("1HGCM82633A004351");
    expect(r.format.ok).toBe(true); // format is fine
    expect(r.checkDigit.matches).toBe(false);
    expect(r.checkDigit.expected).toBe("1");
    expect(r.checkDigit.found).toBe("3");
    // Must hedge: typo OR non-NA market VIN.
    expect(r.checkDigit.note.toLowerCase()).toMatch(/non-north-american|eu\/jp|european|japanese/);
    expect(r.assessment.toLowerCase()).toContain("typo");
  });

  it("does not evaluate the check digit when the format is broken", () => {
    const r = validateVin("1HGCM82633A0O4352"); // illegal O
    expect(r.format.ok).toBe(false);
    expect(r.checkDigit.evaluated).toBe(false);
    expect(r.checkDigit.matches).toBeNull();
    expect(r.assessment.toLowerCase()).toContain("transcription error");
  });

  it("accepts a valid VIN whose check digit is X", () => {
    const r = validateVin("1M8GDM9AXKP042788");
    expect(r.format.ok).toBe(true);
    expect(r.checkDigit.expected).toBe("X");
    expect(r.checkDigit.matches).toBe(true);
  });
});
