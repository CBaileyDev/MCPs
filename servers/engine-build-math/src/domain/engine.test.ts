import { describe, it, expect } from "vitest";
import {
  calcDisplacement,
  calcCompressionRatio,
  calcBoreStrokeRatio,
  calcMeanPistonSpeed,
  calcEngineAirflowCfm
} from "./engine.js";

// ─── displacement ─────────────────────────────────────────────────────────────
// Note: spec states ci≈349.83 and cc≈5732.6 but these are rounded-intermediate
// approximations. Full-precision results are ci≈349.848 and cc≈5732.978.
// The ≈ in the spec is our license to assert at the actual computed precision.

describe("calcDisplacement — pinned reference values (inches)", () => {
  it("SBC 350: 4.00 in × 3.48 in × 8 → ci ≈ 349.85", () => {
    const r = calcDisplacement(4.00, 3.48, 8, "in");
    expect(r.ci).toBeCloseTo(349.848, 2);
  });

  it("SBC 350: → cc ≈ 5732.98 (full precision, not spec's 5732.6)", () => {
    const r = calcDisplacement(4.00, 3.48, 8, "in");
    expect(r.cc).toBeCloseTo(5732.978, 1);
  });

  it("SBC 350: → liters ≈ 5.733", () => {
    const r = calcDisplacement(4.00, 3.48, 8, "in");
    expect(r.liters).toBeCloseTo(5.733, 2);
  });
});

describe("calcDisplacement — pinned reference values (mm)", () => {
  it("4-cyl 92×86 mm: → cc ≈ 2286.78", () => {
    const r = calcDisplacement(92, 86, 4, "mm");
    expect(r.cc).toBeCloseTo(2286.778, 1);
  });

  it("4-cyl 92×86 mm: → liters ≈ 2.287", () => {
    const r = calcDisplacement(92, 86, 4, "mm");
    expect(r.liters).toBeCloseTo(2.287, 2);
  });

  it("4-cyl 92×86 mm: → ci ≈ 139.55", () => {
    const r = calcDisplacement(92, 86, 4, "mm");
    expect(r.ci).toBeCloseTo(139.548, 2);
  });
});

describe("calcDisplacement — round-trip unit consistency", () => {
  it("same engine in mm vs in gives the same cc within tolerance", () => {
    // Convert bore and stroke to mm, compute, compare cc
    const inResult = calcDisplacement(4.00, 3.48, 8, "in");
    const bore_mm = 4.00 * 25.4;
    const stroke_mm = 3.48 * 25.4;
    const mmResult = calcDisplacement(bore_mm, stroke_mm, 8, "mm");
    expect(mmResult.cc).toBeCloseTo(inResult.cc, 4);
  });

  it("same engine in mm vs in gives the same ci within tolerance", () => {
    const inResult = calcDisplacement(4.00, 3.48, 8, "in");
    const bore_mm = 4.00 * 25.4;
    const stroke_mm = 3.48 * 25.4;
    const mmResult = calcDisplacement(bore_mm, stroke_mm, 8, "mm");
    expect(mmResult.ci).toBeCloseTo(inResult.ci, 4);
  });
});

describe("calcDisplacement — inputs stored", () => {
  it("stores bore, stroke, cylinders, unit", () => {
    const r = calcDisplacement(4.00, 3.48, 8, "in");
    expect(r.inputs).toEqual({ bore: 4.00, stroke: 3.48, cylinders: 8, unit: "in" });
  });
});

// ─── compression ratio ────────────────────────────────────────────────────────
// Note: spec says sweptCc≈716.66 and ratio≈10.56 but full precision gives
// sweptCc≈716.622 and ratio≈10.555. The tool rounds to toFixed(2) → 10.55.
// We assert the full-precision domain value at appropriate precision.

describe("calcCompressionRatio — pinned reference values", () => {
  it("4.00in/3.48in, chamber64, gasket8, deck3, piston0 → sweptCc ≈ 716.62", () => {
    const r = calcCompressionRatio(4.00, 3.48, "in", 64, 8, 3, 0);
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.sweptCc).toBeCloseTo(716.622, 1);
    }
  });

  it("→ clearanceCc = 75", () => {
    const r = calcCompressionRatio(4.00, 3.48, "in", 64, 8, 3, 0);
    if (!("error" in r)) {
      expect(r.clearanceCc).toBe(75);
    }
  });

  it("→ ratio ≈ 10.555 (rounds to 10.55 at 2dp)", () => {
    const r = calcCompressionRatio(4.00, 3.48, "in", 64, 8, 3, 0);
    if (!("error" in r)) {
      expect(r.ratio).toBeCloseTo(10.555, 2);
      // At 2 decimal places the tool rounds to 10.55 (not 10.56)
      expect(parseFloat(r.ratio.toFixed(2))).toBe(10.55);
    }
  });
});

describe("calcCompressionRatio — round-trip (clearance inverse)", () => {
  it("sweptCc / (ratio - 1) recovers clearanceCc ≈ 75", () => {
    const r = calcCompressionRatio(4.00, 3.48, "in", 64, 8, 3, 0);
    if (!("error" in r)) {
      const impliedClearance = r.sweptCc / (r.ratio - 1);
      expect(impliedClearance).toBeCloseTo(75, 4);
    }
  });
});

describe("calcCompressionRatio — domed piston (negative pistonCc)", () => {
  it("piston dome reduces clearance volume", () => {
    const flat = calcCompressionRatio(4.00, 3.48, "in", 64, 8, 3, 0);
    const domed = calcCompressionRatio(4.00, 3.48, "in", 64, 8, 3, -10);
    if (!("error" in flat) && !("error" in domed)) {
      expect(domed.clearanceCc).toBe(65);
      expect(domed.ratio).toBeGreaterThan(flat.ratio);
    }
  });
});

describe("calcCompressionRatio — clearanceCc <= 0 returns error", () => {
  it("massive dome piston causes clearanceCc = 0 → error result", () => {
    // chamber 10, gasket 0, deck 0, piston -10 → clearance = 0
    const r = calcCompressionRatio(4.00, 3.48, "in", 10, 0, 0, -10);
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toMatch(/zero or negative/i);
    }
  });

  it("clearanceCc < 0 → error result", () => {
    const r = calcCompressionRatio(4.00, 3.48, "in", 10, 0, 0, -20);
    expect("error" in r).toBe(true);
  });
});

// ─── bore/stroke ratio ────────────────────────────────────────────────────────

describe("calcBoreStrokeRatio — pinned reference values", () => {
  it("4.00 / 3.48 → ratio ≈ 1.149, oversquare", () => {
    const r = calcBoreStrokeRatio(4.00, 3.48);
    expect(r.ratio).toBeCloseTo(1.1494, 3);
    expect(r.classification).toBe("oversquare");
  });

  it("3.48 / 4.00 → ratio ≈ 0.870, undersquare", () => {
    const r = calcBoreStrokeRatio(3.48, 4.00);
    expect(r.ratio).toBeCloseTo(0.870, 3);
    expect(r.classification).toBe("undersquare");
  });

  it("4.00 / 4.00 → ratio = 1.000, square", () => {
    const r = calcBoreStrokeRatio(4.00, 4.00);
    expect(r.ratio).toBeCloseTo(1.000, 6);
    expect(r.classification).toBe("square");
  });
});

describe("calcBoreStrokeRatio — reciprocal round-trip", () => {
  it("ratio(bore, stroke) × ratio(stroke, bore) ≈ 1", () => {
    const r1 = calcBoreStrokeRatio(4.00, 3.48);
    const r2 = calcBoreStrokeRatio(3.48, 4.00);
    expect(r1.ratio * r2.ratio).toBeCloseTo(1, 6);
  });
});

describe("calcBoreStrokeRatio — classification boundary", () => {
  it("ratio exactly 1.05 → oversquare (>1.05 required for oversquare, 1.05 is square)", () => {
    // ratio = 1.05 is not > 1.05, so it falls in the 0.95..1.05 range → square
    const r = calcBoreStrokeRatio(1.05, 1.00);
    expect(r.classification).toBe("square");
  });

  it("ratio 1.06 → oversquare", () => {
    const r = calcBoreStrokeRatio(1.06, 1.00);
    expect(r.classification).toBe("oversquare");
  });

  it("ratio 0.94 → undersquare", () => {
    const r = calcBoreStrokeRatio(0.94, 1.00);
    expect(r.classification).toBe("undersquare");
  });
});

// ─── mean piston speed ────────────────────────────────────────────────────────

describe("calcMeanPistonSpeed — pinned reference values (inches)", () => {
  it("3.48 in stroke, 6000 rpm → ftPerMin ≈ 3480", () => {
    const r = calcMeanPistonSpeed(3.48, "in", 6000);
    expect(r.ftPerMin).toBeCloseTo(3480, 1);
  });

  it("3.48 in stroke, 6000 rpm → mPerSec ≈ 17.678", () => {
    const r = calcMeanPistonSpeed(3.48, "in", 6000);
    expect(r.mPerSec).toBeCloseTo(17.678, 2);
  });
});

describe("calcMeanPistonSpeed — mm/in unit consistency", () => {
  it("same stroke in mm and in gives same ftPerMin within tolerance", () => {
    const inResult = calcMeanPistonSpeed(3.48, "in", 6000);
    const mmResult = calcMeanPistonSpeed(3.48 * 25.4, "mm", 6000);
    expect(mmResult.ftPerMin).toBeCloseTo(inResult.ftPerMin, 4);
  });

  it("same stroke in mm and in gives same mPerSec within tolerance", () => {
    const inResult = calcMeanPistonSpeed(3.48, "in", 6000);
    const mmResult = calcMeanPistonSpeed(3.48 * 25.4, "mm", 6000);
    expect(mmResult.mPerSec).toBeCloseTo(inResult.mPerSec, 6);
  });
});

describe("calcMeanPistonSpeed — note present", () => {
  it("result includes a note about high piston speed", () => {
    const r = calcMeanPistonSpeed(3.48, "in", 6000);
    expect(r.note).toMatch(/4000/);
  });
});

// ─── engine airflow CFM ───────────────────────────────────────────────────────

describe("calcEngineAirflowCfm — pinned reference values", () => {
  it("350 ci, 6000 rpm, VE 0.85 → cfm ≈ 516.49", () => {
    const r = calcEngineAirflowCfm(350, 6000, 0.85);
    expect(r.cfm).toBeCloseTo(516.493, 2);
  });
});

describe("calcEngineAirflowCfm — forced induction (VE > 1)", () => {
  it("VE 1.2 > 1 is valid and produces higher cfm than VE 0.85", () => {
    const na = calcEngineAirflowCfm(350, 6000, 0.85);
    const boosted = calcEngineAirflowCfm(350, 6000, 1.2);
    expect(boosted.cfm).toBeGreaterThan(na.cfm);
  });
});

describe("calcEngineAirflowCfm — note present", () => {
  it("result includes a note explaining 3456 constant", () => {
    const r = calcEngineAirflowCfm(350, 6000, 0.85);
    expect(r.note).toMatch(/3456/);
  });
});
