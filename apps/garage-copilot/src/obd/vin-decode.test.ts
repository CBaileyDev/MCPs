import { describe, it, expect } from "vitest";
import { decodeVin, validateVin, computeCheckDigit, decodeModelYear, decodeOrigin } from "./vin-decode.js";

describe("validateVin", () => {
  it("accepts a format-valid VIN with a matching NA check digit", () => {
    const v = validateVin("1HGCM82633A004352"); // Honda Accord, 2003
    expect(v.format.ok).toBe(true);
    expect(v.checkDigit.matches).toBe(true);
    expect(v.checkDigit.expected).toBe("3");
  });

  it("flags a bad format (wrong length / illegal char)", () => {
    expect(validateVin("1HGCM82633A00435").format.ok).toBe(false); // 16 chars
    const bad = validateVin("1HGCM82633A0043O2"); // contains O
    expect(bad.format.ok).toBe(false);
    expect(bad.format.illegalChars).toContain("O");
  });

  it("reports a check-digit mismatch without calling it definitively invalid", () => {
    const v = validateVin("1HGCM82633A004353"); // last digit changed → CD now mismatches
    expect(v.format.ok).toBe(true);
    expect(v.checkDigit.matches).toBe(false);
    expect(v.assessment).toMatch(/non-NA-market|typo/i);
  });
});

describe("computeCheckDigit", () => {
  it("matches the reference all-ones VIN", () => {
    expect(computeCheckDigit("11111111111111111")).toBe("1");
  });
});

describe("decodeModelYear", () => {
  it("decodes the year from position 10, using position 7 to pick the cycle", () => {
    expect(decodeModelYear("1HGCM82633A004352")).toBe(2003); // pos7 '2' numeric → 1980s cycle
    // pos7 alphabetic ('A') with the same position-10 code ('3') → +30 years.
    expect(decodeModelYear("1HGCM8A633A004352")).toBe(2033);
  });
});

describe("decodeOrigin", () => {
  it("maps the first WMI character to a country/region", () => {
    expect(decodeOrigin("1").country).toBe("United States");
    expect(decodeOrigin("J").country).toBe("Japan");
    expect(decodeOrigin("W").region).toBe("Europe");
  });
});

describe("decodeVin", () => {
  it("returns WMI/VDS/VIS split, origin, year, and plant for a valid VIN", () => {
    const d = decodeVin("1hgcm82633a004352"); // lowercase in → normalized
    expect(d.vin).toBe("1HGCM82633A004352");
    expect(d.wmi).toBe("1HG");
    expect(d.vds).toBe("CM8263");
    expect(d.vis).toBe("3A004352");
    expect(d.country).toBe("United States");
    expect(d.modelYear).toBe(2003);
    expect(d.plantCode).toBe("A");
    expect(d.serial).toBe("004352");
  });

  it("omits structural fields when the format is invalid", () => {
    const d = decodeVin("NOTAVIN");
    expect(d.validation.format.ok).toBe(false);
    expect(d.country).toBeUndefined();
    expect(d.modelYear).toBeUndefined();
  });
});
