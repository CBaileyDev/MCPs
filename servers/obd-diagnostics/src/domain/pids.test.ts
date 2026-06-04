import { describe, expect, it } from "vitest";
import { lookupPid, lookupPidByLabel, normalizePidCode, normalizeUnit, resolveLabel, resolvePidCode } from "./pids.js";

describe("normalizePidCode", () => {
  it("normalizes hex forms to 2-char uppercase", () => {
    expect(normalizePidCode("c")).toBe("0C");
    expect(normalizePidCode("0x0c")).toBe("0C");
    expect(normalizePidCode("0C")).toBe("0C");
  });

  it("returns undefined for non-hex or empty input", () => {
    expect(normalizePidCode("RPM")).toBeUndefined();
    expect(normalizePidCode("")).toBeUndefined();
    expect(normalizePidCode(undefined)).toBeUndefined();
  });
});

describe("lookupPidByLabel", () => {
  it("resolves canonical labels", () => {
    expect(lookupPidByLabel("Engine RPM")?.pid).toBe("0C");
  });

  it("resolves common real-world aliases case-insensitively", () => {
    expect(lookupPidByLabel("RPM")?.pid).toBe("0C");
    expect(lookupPidByLabel("coolant")?.pid).toBe("05");
    expect(lookupPidByLabel("Speed")?.pid).toBe("0D");
    expect(lookupPidByLabel("MAF")?.pid).toBe("10");
  });

  it("returns undefined for genuinely unknown labels", () => {
    expect(lookupPidByLabel("Flux Capacitor Charge")).toBeUndefined();
  });
});

describe("resolveLabel", () => {
  it("prefers the canonical label when the PID or alias is known", () => {
    expect(resolveLabel("0C", "rpm")).toBe("Engine RPM");
    expect(resolveLabel(undefined, "RPM")).toBe("Engine RPM");
  });

  it("passes an unknown label through unchanged", () => {
    expect(resolveLabel(undefined, "Boost PSI")).toBe("Boost PSI");
  });
});

describe("normalizeUnit", () => {
  it("keeps a provided unit, even an unusual one", () => {
    expect(normalizeUnit("0C", "rpm", "zorks")).toBe("zorks");
  });

  it("falls back to the known canonical unit when none provided", () => {
    expect(normalizeUnit("05", undefined, undefined)).toBe("C");
    expect(lookupPid("05")?.unit).toBe("C");
  });
});

describe("resolvePidCode", () => {
  it("returns the normalized hex pid when given a valid pid string", () => {
    expect(resolvePidCode("0C", undefined)).toBe("0C");
    expect(resolvePidCode("c", undefined)).toBe("0C");
  });

  it("resolves a canonical label to its pid hex", () => {
    expect(resolvePidCode(undefined, "Engine RPM")).toBe("0C");
    expect(resolvePidCode(undefined, "Engine Coolant Temperature")).toBe("05");
  });

  it("resolves a common alias to the pid hex", () => {
    expect(resolvePidCode(undefined, "coolant")).toBe("05");
    expect(resolvePidCode(undefined, "RPM")).toBe("0C");
  });

  it("returns undefined for genuinely unknown labels", () => {
    expect(resolvePidCode(undefined, "Flux Capacitor")).toBeUndefined();
    expect(resolvePidCode(undefined, undefined)).toBeUndefined();
  });
});
