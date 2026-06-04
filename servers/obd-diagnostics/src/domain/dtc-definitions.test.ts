import { describe, expect, it } from "vitest";
import { COMMON_GENERIC_DTC_DEFINITIONS, lookupGenericDtcDefinition } from "./dtc-definitions.js";
import { decodeDtcStructure } from "./dtc.js";

describe("lookupGenericDtcDefinition", () => {
  // Pinned against the standardized SAE J2012 / ISO 15031 generic definitions.
  it("returns the exact standardized definition for common generic codes", () => {
    expect(lookupGenericDtcDefinition("P0300")).toBe("Random/Multiple Cylinder Misfire Detected");
    expect(lookupGenericDtcDefinition("P0301")).toBe("Cylinder 1 Misfire Detected");
    expect(lookupGenericDtcDefinition("P0171")).toBe("System Too Lean (Bank 1)");
    expect(lookupGenericDtcDefinition("P0174")).toBe("System Too Lean (Bank 2)");
    expect(lookupGenericDtcDefinition("P0420")).toBe("Catalyst System Efficiency Below Threshold (Bank 1)");
    expect(lookupGenericDtcDefinition("P0430")).toBe("Catalyst System Efficiency Below Threshold (Bank 2)");
    expect(lookupGenericDtcDefinition("P0442")).toBe("Evaporative Emission Control System Leak Detected (Small Leak)");
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(lookupGenericDtcDefinition("p0420")).toBe("Catalyst System Efficiency Below Threshold (Bank 1)");
    expect(lookupGenericDtcDefinition("  P0300 ")).toBe("Random/Multiple Cylinder Misfire Detected");
  });

  it("returns null for a manufacturer-specific code (proprietary, never inferred)", () => {
    expect(lookupGenericDtcDefinition("P1234")).toBeNull();
    expect(lookupGenericDtcDefinition("P1101")).toBeNull();
  });

  it("returns null for an uncommon generic code not in the bundled set (no guessing)", () => {
    // P0001 is a valid generic code but intentionally not bundled.
    expect(lookupGenericDtcDefinition("P0001")).toBeNull();
    expect(lookupGenericDtcDefinition("P0abc")).toBeNull();
  });

  it("every bundled code is a generic powertrain code (second char '0')", () => {
    for (const code of Object.keys(COMMON_GENERIC_DTC_DEFINITIONS)) {
      expect(code).toMatch(/^P0[0-9A-F]{3}$/);
    }
  });
});

describe("decodeDtcStructure genericDescription integration", () => {
  it("attaches the standardized definition for a bundled generic code", () => {
    const s = decodeDtcStructure("P0420");
    expect(s.codeType).toBe("generic");
    expect(s.genericDescription).toBe("Catalyst System Efficiency Below Threshold (Bank 1)");
  });

  it("sets genericDescription to null for a manufacturer code while keeping structure", () => {
    const s = decodeDtcStructure("P1234");
    expect(s.codeType).toBe("manufacturer");
    expect(s.genericDescription).toBeNull();
    // Structural fields are still populated — the honest fallback is subsystemArea.
    expect(typeof s.subsystemArea).toBe("string");
    expect(s.subsystemArea.length).toBeGreaterThan(0);
  });

  it("sets genericDescription to null for an unbundled generic code", () => {
    const s = decodeDtcStructure("P0001");
    expect(s.codeType).toBe("generic");
    expect(s.genericDescription).toBeNull();
  });
});
