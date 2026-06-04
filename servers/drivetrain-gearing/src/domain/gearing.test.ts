import { describe, it, expect } from "vitest";
import {
  parseMetricTireDiameter,
  resolveTireDiameter,
  speedFromRpm,
  rpmFromSpeed,
  recommendFinalDrive,
  tireGearingEffect
} from "./gearing.js";

describe("parseMetricTireDiameter", () => {
  it("275/40R20 ≈ 28.66 in", () => {
    const d = parseMetricTireDiameter("275/40R20");
    expect(Math.abs(d - 28.66)).toBeLessThan(0.01);
  });

  it("throws on unparseable string", () => {
    expect(() => parseMetricTireDiameter("31x10.50R15")).toThrow();
  });

  it("accepts P-metric prefix like P225/45R17", () => {
    const d = parseMetricTireDiameter("P225/45R17");
    // 17 + 2 * (225 * 0.45 / 25.4) = 17 + 2 * 3.976... = 24.953...
    expect(d).toBeGreaterThan(24);
    expect(d).toBeLessThan(26);
  });
});

describe("resolveTireDiameter", () => {
  it("returns explicit diameter when provided", () => {
    expect(resolveTireDiameter({ tireDiameterIn: 28 })).toBe(28);
  });

  it("parses tireSize when provided", () => {
    const d = resolveTireDiameter({ tireSize: "275/40R20" });
    expect(Math.abs(d - 28.66)).toBeLessThan(0.01);
  });

  it("throws when neither is provided", () => {
    expect(() => resolveTireDiameter({})).toThrow();
  });

  it("throws when both are provided", () => {
    expect(() => resolveTireDiameter({ tireSize: "275/40R20", tireDiameterIn: 28 })).toThrow();
  });
});

describe("speedFromRpm", () => {
  it("2500 rpm, 1.0 trans, 3.73 final, 28in → ≈ 55.8 mph", () => {
    const speed = speedFromRpm(2500, 1.0, 3.73, 28);
    expect(Math.abs(speed - 55.8)).toBeLessThan(0.5);
  });
});

describe("rpmFromSpeed", () => {
  it("70 mph, 0.70 trans (OD), 3.55 final, 28in → ≈ 2088 rpm", () => {
    const rpm = rpmFromSpeed(70, 0.70, 3.55, 28);
    expect(Math.abs(rpm - 2088)).toBeLessThan(0.5);
  });
});

describe("recommendFinalDrive", () => {
  it("targetRpm=2088, targetSpeed=70, topGear=0.70, 28in → ≈ 3.55", () => {
    const fd = recommendFinalDrive(2088, 70, 0.70, 28);
    expect(Math.abs(fd - 3.55)).toBeLessThan(0.01);
  });
});

describe("tireGearingEffect", () => {
  it("bigger tire → numerically lower effective ratio (taller gearing)", () => {
    const result = tireGearingEffect(28, 30, 3.73);
    // effectiveRatio = 3.73 * 28/30 = 3.482 — numerically lower (taller)
    expect(result.effectiveRatio).toBeLessThan(result.stockFinalDrive);
  });

  it("bigger tire → restoring final drive is numerically higher", () => {
    const result = tireGearingEffect(28, 30, 3.73);
    // restoringFinalDrive = 3.73 * 30/28 = 3.996 — must compensate
    expect(result.restoringFinalDrive).toBeGreaterThan(result.stockFinalDrive);
  });

  it("bigger tire → percent change is negative (effective ratio got smaller)", () => {
    const result = tireGearingEffect(28, 30, 3.73);
    expect(result.percentChange).toBeLessThan(0);
  });

  it("bigger tire → speedometer note mentions under-reads", () => {
    const result = tireGearingEffect(28, 30, 3.73);
    expect(result.speedometerNote.toLowerCase()).toContain("under-read");
  });

  it("smaller tire → speedometer note mentions over-reads", () => {
    const result = tireGearingEffect(30, 28, 3.73);
    expect(result.speedometerNote.toLowerCase()).toContain("over-read");
  });

  it("same size → no change", () => {
    const result = tireGearingEffect(28, 28, 3.73);
    expect(result.effectiveRatio).toBeCloseTo(3.73, 5);
    expect(result.restoringFinalDrive).toBeCloseTo(3.73, 5);
    expect(result.percentChange).toBeCloseTo(0, 5);
  });
});
