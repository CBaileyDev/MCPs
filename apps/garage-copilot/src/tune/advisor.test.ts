import { describe, it, expect } from "vitest";
import { assessAddedElectricalLoad, assessFinalDriveChange, assessInjectorsForTarget } from "./advisor.js";

describe("assessFinalDriveChange", () => {
  it("raises cruise RPM when the numeric final drive increases", () => {
    const a = assessFinalDriveChange({
      speedMph: 70,
      tireDiameterIn: 28,
      topGearRatio: 0.72,
      currentFinalDrive: 3.73,
      newFinalDrive: 4.1
    });
    expect(Number(a.details.newRpm)).toBeGreaterThan(Number(a.details.currentRpm));
    expect(Number(a.details.deltaPct)).toBeCloseTo(9.92, 1); // 4.10/3.73 - 1
    expect(a.ok).toBe(true);
  });

  it("flags a large gearing change", () => {
    const a = assessFinalDriveChange({
      speedMph: 70,
      tireDiameterIn: 28,
      topGearRatio: 0.72,
      currentFinalDrive: 3.0,
      newFinalDrive: 4.1
    });
    expect(a.notes.some(n => /large gearing change/.test(n))).toBe(true);
  });

  it("rejects non-positive inputs", () => {
    expect(() =>
      assessFinalDriveChange({ speedMph: 0, tireDiameterIn: 28, topGearRatio: 0.72, currentFinalDrive: 3.73, newFinalDrive: 4.1 })
    ).toThrow(/positive/);
  });
});

describe("assessInjectorsForTarget", () => {
  it("computes a required injector size for a power target", () => {
    // 400 hp, 8 cyl, 0.5 BSFC, 85% duty, 0.72 g/cc gasoline.
    // total = 200 lb/hr; per inj = 25 lb/hr; cc/min = 25*453.592/60/0.72/0.85 ≈ 308.8
    const a = assessInjectorsForTarget({ targetHp: 400, cylinders: 8 });
    expect(Number(a.details.requiredCcMin)).toBeCloseTo(308.8, 0);
  });

  it("clears or fails a proposed injector with headroom", () => {
    const ok = assessInjectorsForTarget({ targetHp: 400, cylinders: 8, proposedCcMin: 440 });
    expect(ok.ok).toBe(true);
    expect(Number(ok.details.headroomPct)).toBeGreaterThan(0);

    const tooSmall = assessInjectorsForTarget({ targetHp: 400, cylinders: 8, proposedCcMin: 250 });
    expect(tooSmall.ok).toBe(false);
    expect(tooSmall.summary).toMatch(/BELOW/);
  });

  it("validates duty cycle and positives", () => {
    expect(() => assessInjectorsForTarget({ targetHp: 400, cylinders: 8, maxDutyCycle: 1.5 })).toThrow(/duty/i);
    expect(() => assessInjectorsForTarget({ targetHp: -1, cylinders: 8 })).toThrow(/positive/);
  });
});

describe("assessAddedElectricalLoad", () => {
  it("computes added amps and alternator utilization", () => {
    const a = assessAddedElectricalLoad({ systemVoltage: 13.8, existingLoadA: 60, addedWatts: 690, alternatorRatedA: 130 });
    expect(Number(a.details.addedAmps)).toBeCloseTo(50, 0); // 690/13.8
    expect(Number(a.details.totalAmps)).toBeCloseTo(110, 0);
    expect(Number(a.details.utilizationPct)).toBeCloseTo(84.6, 1);
    expect(a.notes.some(n => /80%/.test(n))).toBe(true);
    expect(a.ok).toBe(true);
  });

  it("fails when total load exceeds the alternator rating", () => {
    const a = assessAddedElectricalLoad({ systemVoltage: 13.8, existingLoadA: 100, addedWatts: 1380, alternatorRatedA: 130 });
    expect(a.ok).toBe(false);
    expect(a.notes.some(n => /exceeds/.test(n))).toBe(true);
  });
});
