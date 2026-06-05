import { describe, it, expect } from "vitest";
import { decodePidData, lookupFormula, normalizePid, PID_FORMULAS } from "./pid-formulas.js";

describe("normalizePid", () => {
  it("normalizes formatting variants to 2-char uppercase hex", () => {
    expect(normalizePid("c")).toBe("0C");
    expect(normalizePid("0x0c")).toBe("0C");
    expect(normalizePid("0C")).toBe("0C");
    expect(normalizePid(" 5 ")).toBe("05");
  });
  it("returns undefined for junk", () => {
    expect(normalizePid("zz")).toBeUndefined();
    expect(normalizePid("")).toBeUndefined();
    expect(normalizePid(undefined)).toBeUndefined();
  });
});

describe("PID decode formulas", () => {
  it("RPM (0C) = (256A+B)/4", () => {
    // 0x1A=26, 0xF8=248 -> (256*26+248)/4 = 1726
    expect(decodePidData("0C", [0x1a, 0xf8])).toEqual({
      pid: "0C",
      label: "Engine RPM",
      value: 1726,
      unit: "rpm"
    });
  });

  it("coolant temp (05) = A - 40", () => {
    expect(decodePidData("05", [0x81])?.value).toBe(89); // 129-40
    expect(decodePidData("05", [40])?.value).toBe(0);
  });

  it("vehicle speed (0D) = A", () => {
    expect(decodePidData("0D", [100])?.value).toBe(100);
  });

  it("throttle (11) = A*100/255", () => {
    expect(decodePidData("11", [0xff])?.value).toBe(100);
    expect(decodePidData("11", [0x24])?.value).toBeCloseTo(14.12, 2);
  });

  it("fuel trim (06) = (A-128)*100/128, centered at 0", () => {
    expect(decodePidData("06", [128])?.value).toBe(0);
    expect(decodePidData("06", [0x84])?.value).toBeCloseTo(3.13, 2); // (132-128)*0.78125
  });

  it("module voltage (42) = (256A+B)/1000", () => {
    expect(decodePidData("42", [0x37, 0x78])?.value).toBe(14.2); // (256*55+120)/1000
  });

  it("returns undefined for unknown PID or too-few bytes", () => {
    expect(decodePidData("ZZ", [1, 2])).toBeUndefined();
    expect(decodePidData("0C", [0x1a])).toBeUndefined(); // needs 2 bytes
  });

  it("every formula declares a byte count matching its decoder arity expectation", () => {
    for (const def of Object.values(PID_FORMULAS)) {
      expect(def.bytes).toBeGreaterThanOrEqual(1);
      // Decoding with the declared number of zero bytes must not throw.
      expect(() => def.decode(new Array(def.bytes).fill(0))).not.toThrow();
    }
  });

  it("lookupFormula is tolerant of formatting", () => {
    expect(lookupFormula("0xc")?.label).toBe("Engine RPM");
  });
});
