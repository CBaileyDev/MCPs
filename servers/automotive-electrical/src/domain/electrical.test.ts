import { describe, it, expect } from "vitest";
import {
  calcVoltageDrop,
  recommendWireGauge,
  calcOhmsLaw,
  calcFuseSize,
  calcBatteryRuntime,
  calcBatteryBank,
  findAwgEntry,
  ohmsPerFoot
} from "./electrical.js";

// ─── voltage_drop ─────────────────────────────────────────────────────────────

describe("calcVoltageDrop — pinned reference values", () => {
  it('awg "10", 10A, 15ft, 12V, copper → vDrop 0.30, dropPercent 2.50, endVolts 11.70', () => {
    const r = calcVoltageDrop("10", 10, 15, 12, "copper");
    expect(parseFloat(r.vDrop.toFixed(2))).toBe(0.30);
    expect(parseFloat(r.dropPercent.toFixed(2))).toBe(2.50);
    expect(parseFloat(r.endVolts.toFixed(2))).toBe(11.70);
  });

  it('awg "4", 50A, 20ft, 12V, copper → vDrop 0.50, dropPercent 4.14', () => {
    const r = calcVoltageDrop("4", 50, 20, 12, "copper");
    expect(parseFloat(r.vDrop.toFixed(2))).toBe(0.50);
    expect(parseFloat(r.dropPercent.toFixed(2))).toBe(4.14);
  });

  it("includes a note mentioning 3%", () => {
    const r = calcVoltageDrop("10", 10, 15, 12, "copper");
    expect(r.note).toMatch(/3%/);
  });

  it("endVolts = systemVolts - vDrop", () => {
    const r = calcVoltageDrop("10", 10, 15, 12, "copper");
    expect(r.endVolts).toBeCloseTo(12 - r.vDrop, 10);
  });
});

describe("calcVoltageDrop — aluminum factor", () => {
  it("aluminum resistance is ~1.64× copper", () => {
    const cu = calcVoltageDrop("10", 10, 15, 12, "copper");
    const al = calcVoltageDrop("10", 10, 15, 12, "aluminum");
    expect(al.vDrop / cu.vDrop).toBeCloseTo(1.64, 6);
  });
});

describe("calcVoltageDrop — round-trip", () => {
  it("recover amps from independently-computed run resistance (catches wrong table/multiplier)", () => {
    const awg = "10";
    const amps = 10;
    const lengthFeet = 15;
    const systemVolts = 12;
    const r = calcVoltageDrop(awg, amps, lengthFeet, systemVolts, "copper");
    // Compute run resistance independently from the gauge and length — not derived from vDrop/amps
    const runResistance = 2 * lengthFeet * ohmsPerFoot(awg, "copper");
    const recoveredAmps = r.vDrop / runResistance;
    expect(recoveredAmps).toBeCloseTo(amps, 6);
  });
});

describe("calcVoltageDrop — validation", () => {
  it("throws on unknown AWG", () => {
    expect(() => calcVoltageDrop("99", 10, 15, 12, "copper")).toThrow(/Unknown AWG/);
  });

  it("throws on non-positive amps", () => {
    expect(() => calcVoltageDrop("10", 0, 15, 12, "copper")).toThrow(/positive/);
  });

  it("throws on non-positive lengthFeet", () => {
    expect(() => calcVoltageDrop("10", 10, 0, 12, "copper")).toThrow(/positive/);
  });
});

// ─── recommend_wire_gauge ────────────────────────────────────────────────────

describe("recommendWireGauge — pinned reference values", () => {
  it('10A, 15ft, 12V, 3%, copper → awg "10", dropPercent ≈ 2.50', () => {
    const r = recommendWireGauge(10, 15, 12, 3, "copper");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.awg).toBe("10");
      expect(parseFloat(r.dropPercent.toFixed(2))).toBe(2.50);
    }
  });

  it('10A, 15ft, 12V, 10%, copper → awg "14", dropPercent ≈ 6.31', () => {
    const r = recommendWireGauge(10, 15, 12, 10, "copper");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.awg).toBe("14");
      expect(parseFloat(r.dropPercent.toFixed(2))).toBe(6.31);
    }
  });

  it("16 AWG would be >10% for 10A/15ft/12V/copper (confirming 14 is smallest valid)", () => {
    const r16 = calcVoltageDrop("16", 10, 15, 12, "copper");
    expect(r16.dropPercent).toBeGreaterThan(10);
  });

  it("12 AWG would be >3% for 10A/15ft/12V/copper (confirming 10 is smallest valid)", () => {
    const r12 = calcVoltageDrop("12", 10, 15, 12, "copper");
    expect(r12.dropPercent).toBeGreaterThan(3);
  });
});

describe("recommendWireGauge — fallback branch", () => {
  it("returns success=false when even 4/0 cannot meet the requirement", () => {
    // 1000A, 1000ft run will overwhelm any standard gauge
    const r = recommendWireGauge(1000, 1000, 12, 1, "copper");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.awg).toBe("4/0");
      expect(r.message).toMatch(/No standard gauge/);
    }
  });
});

// ─── ohms_law ─────────────────────────────────────────────────────────────────

describe("calcOhmsLaw — pinned reference values", () => {
  it("{volts:12, amps:3} → ohms 4, watts 36", () => {
    const r = calcOhmsLaw({ volts: 12, amps: 3 });
    if ("error" in r) throw new Error(r.error);
    expect(r.ohms).toBeCloseTo(4, 10);
    expect(r.watts).toBeCloseTo(36, 10);
    expect(r.volts).toBe(12);
    expect(r.amps).toBe(3);
  });

  it("{watts:36, ohms:4} → amps 3, volts 12", () => {
    const r = calcOhmsLaw({ watts: 36, ohms: 4 });
    if ("error" in r) throw new Error(r.error);
    expect(r.amps).toBeCloseTo(3, 10);
    expect(r.volts).toBeCloseTo(12, 10);
  });

  it("{watts:100, volts:10} → amps 10, ohms 1", () => {
    const r = calcOhmsLaw({ watts: 100, volts: 10 });
    if ("error" in r) throw new Error(r.error);
    expect(r.amps).toBeCloseTo(10, 10);
    expect(r.ohms).toBeCloseTo(1, 10);
  });

  it("{volts:24, ohms:6} → amps 4, watts 96", () => {
    const r = calcOhmsLaw({ volts: 24, ohms: 6 });
    if ("error" in r) throw new Error(r.error);
    expect(r.amps).toBeCloseTo(4, 10);
    expect(r.watts).toBeCloseTo(96, 10);
  });

  it("{amps:2, ohms:8} → volts 16, watts 32", () => {
    const r = calcOhmsLaw({ amps: 2, ohms: 8 });
    if ("error" in r) throw new Error(r.error);
    expect(r.volts).toBeCloseTo(16, 10);
    expect(r.watts).toBeCloseTo(32, 10);
  });

  it("{watts:50, amps:5} → volts 10, ohms 2", () => {
    const r = calcOhmsLaw({ watts: 50, amps: 5 });
    if ("error" in r) throw new Error(r.error);
    expect(r.volts).toBeCloseTo(10, 10);
    expect(r.ohms).toBeCloseTo(2, 10);
  });
});

describe("calcOhmsLaw — round-trip", () => {
  it("from {volts,amps} recover original pair via {volts,ohms}", () => {
    const r1 = calcOhmsLaw({ volts: 12, amps: 3 });
    if ("error" in r1) throw new Error(r1.error);
    const r2 = calcOhmsLaw({ volts: r1.volts, ohms: r1.ohms });
    if ("error" in r2) throw new Error(r2.error);
    expect(r2.amps).toBeCloseTo(3, 6);
    expect(r2.watts).toBeCloseTo(36, 6);
  });

  it("from {watts,ohms} recover original pair via {volts,amps}", () => {
    const r1 = calcOhmsLaw({ watts: 36, ohms: 4 });
    if ("error" in r1) throw new Error(r1.error);
    const r2 = calcOhmsLaw({ volts: r1.volts, amps: r1.amps });
    if ("error" in r2) throw new Error(r2.error);
    expect(r2.ohms).toBeCloseTo(4, 6);
    expect(r2.watts).toBeCloseTo(36, 6);
  });
});

describe("calcOhmsLaw — validation", () => {
  it("returns error when fewer than 2 inputs provided (1 input)", () => {
    const r = calcOhmsLaw({ volts: 12 });
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toMatch(/exactly 2/);
    }
  });

  it("returns error when more than 2 inputs provided (3 inputs)", () => {
    const r = calcOhmsLaw({ volts: 12, amps: 3, ohms: 4 });
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toMatch(/exactly 2/);
    }
  });

  it("returns error when 0 inputs provided", () => {
    const r = calcOhmsLaw({});
    expect("error" in r).toBe(true);
  });

  it("returns error when all 4 inputs provided", () => {
    const r = calcOhmsLaw({ volts: 12, amps: 3, ohms: 4, watts: 36 });
    expect("error" in r).toBe(true);
  });
});

// ─── fuse_size ────────────────────────────────────────────────────────────────

describe("calcFuseSize — pinned reference values", () => {
  it("continuousAmps 10, factor 1.25 → minRequiredAmps 12.5, recommendedFuseAmps 15", () => {
    const r = calcFuseSize(10, 1.25);
    expect(r.minRequiredAmps).toBe(12.5);
    expect(r.recommendedFuseAmps).toBe(15);
  });

  it("continuousAmps 20, factor 1.25 → minRequiredAmps 25, recommendedFuseAmps 25", () => {
    const r = calcFuseSize(20, 1.25);
    expect(r.minRequiredAmps).toBe(25);
    expect(r.recommendedFuseAmps).toBe(25);
  });

  it("includes standard sizes array", () => {
    const r = calcFuseSize(10, 1.25);
    expect(Array.isArray(r.standardSizes)).toBe(true);
    expect(r.standardSizes).toContain(15);
  });

  it("includes caveat mentioning wire", () => {
    const r = calcFuseSize(10, 1.25);
    expect(r.caveat).toMatch(/wire/i);
  });
});

describe("calcFuseSize — wire ampacity warning", () => {
  it("warns when recommended fuse exceeds wire ampacity", () => {
    const r = calcFuseSize(10, 1.25, 12); // fuse=15, wire=12 → warning
    expect(r.wireWarning).toBeDefined();
    expect(r.wireWarning).toMatch(/WARNING/);
  });

  it("no warning when recommended fuse is within wire ampacity", () => {
    const r = calcFuseSize(10, 1.25, 20); // fuse=15, wire=20 → ok
    expect(r.wireWarning).toBeUndefined();
  });
});

describe("calcFuseSize — validation", () => {
  it("throws on non-positive continuousAmps", () => {
    expect(() => calcFuseSize(0, 1.25)).toThrow(/positive/);
  });
});

// ─── battery_runtime ─────────────────────────────────────────────────────────

describe("calcBatteryRuntime — pinned reference values", () => {
  it("100Ah, loadAmps 5, 50% DoD → runtimeHours 10, usableAh 50", () => {
    const r = calcBatteryRuntime(100, 12, 50, 5, undefined);
    if ("error" in r) throw new Error(r.error);
    expect(r.runtimeHours).toBe(10);
    expect(r.usableAh).toBe(50);
    expect(r.loadAmps).toBe(5);
  });

  it("100Ah, loadWatts 60, 12V, 50% DoD → loadAmps 5, runtimeHours 10", () => {
    const r = calcBatteryRuntime(100, 12, 50, undefined, 60);
    if ("error" in r) throw new Error(r.error);
    expect(r.loadAmps).toBeCloseTo(5, 10);
    expect(r.runtimeHours).toBeCloseTo(10, 10);
  });

  it("100Ah, loadAmps 10, 80% DoD → runtimeHours 8", () => {
    const r = calcBatteryRuntime(100, 12, 80, 10, undefined);
    if ("error" in r) throw new Error(r.error);
    expect(r.runtimeHours).toBe(8);
    expect(r.usableAh).toBe(80);
  });

  it("includes a note mentioning Peukert", () => {
    const r = calcBatteryRuntime(100, 12, 50, 5, undefined);
    if ("error" in r) throw new Error(r.error);
    expect(r.note).toMatch(/Peukert/);
  });
});

describe("calcBatteryRuntime — validation", () => {
  it("returns error when both loadAmps and loadWatts provided", () => {
    const r = calcBatteryRuntime(100, 12, 50, 5, 60);
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toMatch(/exactly one/);
  });

  it("returns error when neither loadAmps nor loadWatts provided", () => {
    const r = calcBatteryRuntime(100, 12, 50, undefined, undefined);
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toMatch(/exactly one/);
  });

  it("throws on non-positive capacityAh", () => {
    expect(() => calcBatteryRuntime(0, 12, 50, 5, undefined)).toThrow(/positive/);
  });
});

// ─── battery_bank ─────────────────────────────────────────────────────────────

describe("calcBatteryBank — pinned reference values", () => {
  it('12V, 100Ah, 2S1P → 24V, 100Ah, 2400Wh, "2S1P"', () => {
    const r = calcBatteryBank(12, 100, 2, 1);
    expect(r.totalVolts).toBe(24);
    expect(r.totalAh).toBe(100);
    expect(r.totalWh).toBe(2400);
    expect(r.configuration).toBe("2S1P");
    expect(r.count).toBe(2);
  });

  it('12V, 100Ah, 1S2P → 12V, 200Ah, 2400Wh, "1S2P"', () => {
    const r = calcBatteryBank(12, 100, 1, 2);
    expect(r.totalVolts).toBe(12);
    expect(r.totalAh).toBe(200);
    expect(r.totalWh).toBe(2400);
    expect(r.configuration).toBe("1S2P");
    expect(r.count).toBe(2);
  });

  it('12V, 100Ah, 2S2P → 24V, 200Ah, 4800Wh, "2S2P"', () => {
    const r = calcBatteryBank(12, 100, 2, 2);
    expect(r.totalVolts).toBe(24);
    expect(r.totalAh).toBe(200);
    expect(r.totalWh).toBe(4800);
    expect(r.configuration).toBe("2S2P");
    expect(r.count).toBe(4);
  });
});

describe("calcBatteryBank — round-trip invariants", () => {
  it("totalWh is stable regardless of series/parallel split (same cell count)", () => {
    // 4 cells of 12V/100Ah: total energy is always 4 * 12 * 100 = 4800 Wh
    const r1 = calcBatteryBank(12, 100, 4, 1); // 4S1P
    const r2 = calcBatteryBank(12, 100, 1, 4); // 1S4P
    const r3 = calcBatteryBank(12, 100, 2, 2); // 2S2P
    expect(r1.totalWh).toBe(r2.totalWh);
    expect(r2.totalWh).toBe(r3.totalWh);
    expect(r1.totalWh).toBe(4800);
  });

  it("count = series * parallel", () => {
    const r = calcBatteryBank(12, 100, 3, 4);
    expect(r.count).toBe(12);
  });

  it("totalVolts depends only on series", () => {
    const r1 = calcBatteryBank(12, 100, 3, 1);
    const r2 = calcBatteryBank(12, 100, 3, 5);
    expect(r1.totalVolts).toBe(r2.totalVolts);
    expect(r1.totalVolts).toBe(36);
  });

  it("totalAh depends only on parallel", () => {
    const r1 = calcBatteryBank(12, 100, 1, 3);
    const r2 = calcBatteryBank(12, 100, 5, 3);
    expect(r1.totalAh).toBe(r2.totalAh);
    expect(r1.totalAh).toBe(300);
  });
});

describe("calcBatteryBank — validation", () => {
  it("throws on non-positive cellVolts", () => {
    expect(() => calcBatteryBank(0, 100, 1, 1)).toThrow(/positive/);
  });

  it("throws on series < 1", () => {
    expect(() => calcBatteryBank(12, 100, 0, 1)).toThrow(/integer/);
  });

  it("throws on non-integer series", () => {
    expect(() => calcBatteryBank(12, 100, 1.5, 1)).toThrow(/integer/);
  });
});

// ─── findAwgEntry ─────────────────────────────────────────────────────────────

describe("findAwgEntry — validation", () => {
  it("throws on unknown label", () => {
    expect(() => findAwgEntry("99")).toThrow(/Unknown AWG/);
  });

  it('returns correct entry for "4/0"', () => {
    const e = findAwgEntry("4/0");
    expect(e.ohmsPer1000ft).toBe(0.04901);
  });
});
