import { describe, it, expect } from "vitest";
import {
  injectorFlowConvert,
  injectorSizeRequired,
  injectorMaxHp
} from "./injectors.js";

// ─── injectorFlowConvert ──────────────────────────────────────────────────────
// Pinned values (density 0.72):
//   550 cc/min → lbPerHr = 550 × (60 × 0.72 / 453.592) = 52.3819…
//   52.38 lb/hr (rounded input) → ccPerMin ≈ 549.98 (not exactly 550; rounding loss)
//   Full-precision round-trip: 550 cc/min → lb/hr → cc/min recovers 550 exactly.

describe("injectorFlowConvert — pinned values (density 0.72)", () => {
  it("550 cc/min → lbPerHr ≈ 52.38", () => {
    const r = injectorFlowConvert(550, "cc_min");
    expect(r.ccPerMin).toBe(550);
    // Full precision: 52.38187622356655
    expect(r.lbPerHr).toBeCloseTo(52.38, 2);
  });

  it("550 cc/min → lbPerHr full precision", () => {
    const r = injectorFlowConvert(550, "cc_min");
    expect(r.lbPerHr).toBeCloseTo(52.38187622356655, 6);
  });

  it("52.38 lb/hr → ccPerMin ≈ 549.98 (spec approximation; rounded input loses precision)", () => {
    // The spec says "≈550" but 52.38 is a rounded value; full round-trip (see below)
    const r = injectorFlowConvert(52.38, "lb_hr");
    expect(r.lbPerHr).toBe(52.38);
    expect(r.ccPerMin).toBeCloseTo(549.98, 1);
  });

  it("stores fuelDensityGPerCc in result", () => {
    const r = injectorFlowConvert(550, "cc_min");
    expect(r.fuelDensityGPerCc).toBe(0.72);
  });

  it("stores inputs correctly", () => {
    const r = injectorFlowConvert(550, "cc_min", 0.72);
    expect(r.inputs).toEqual({ value: 550, from: "cc_min", fuelDensityGPerCc: 0.72 });
  });

  it("result includes a note about fuel density", () => {
    const r = injectorFlowConvert(100, "cc_min");
    expect(r.note).toMatch(/density/i);
  });
});

describe("injectorFlowConvert — custom density (E85 ≈ 0.78)", () => {
  it("550 cc/min with density 0.78 gives higher lbPerHr than 0.72", () => {
    const gasoline = injectorFlowConvert(550, "cc_min", 0.72);
    const e85 = injectorFlowConvert(550, "cc_min", 0.78);
    expect(e85.lbPerHr).toBeGreaterThan(gasoline.lbPerHr);
  });
});

describe("injectorFlowConvert — round-trip (cc→lb→cc recovers original)", () => {
  it("550 cc/min → lb/hr → cc/min returns 550 exactly (full-precision)", () => {
    const step1 = injectorFlowConvert(550, "cc_min");
    const step2 = injectorFlowConvert(step1.lbPerHr, "lb_hr");
    expect(step2.ccPerMin).toBeCloseTo(550, 8);
  });

  it("arbitrary value 325 cc/min round-trips back within tolerance", () => {
    const step1 = injectorFlowConvert(325, "cc_min");
    const step2 = injectorFlowConvert(step1.lbPerHr, "lb_hr");
    expect(step2.ccPerMin).toBeCloseTo(325, 8);
  });
});

// ─── injectorSizeRequired ─────────────────────────────────────────────────────
// Pinned values (bsfc 0.5, duty 0.85, density 0.72):
//   400 HP, 8 cyl:
//     totalFuelLbHr     = 200
//     perInjectorLbHr   = 200 / (8 × 0.85) = 29.4118…
//     perInjectorCcMin  = 29.4118 × (453.592 / (60 × 0.72)) = 308.818…

describe("injectorSizeRequired — pinned values (400 HP, 8 cyl)", () => {
  it("totalFuelLbHr = 200", () => {
    const r = injectorSizeRequired(400, 8);
    expect(r.totalFuelLbHr).toBe(200);
  });

  it("perInjectorLbHr ≈ 29.41", () => {
    const r = injectorSizeRequired(400, 8);
    // Full precision: 29.411764705882355
    expect(r.perInjectorLbHr).toBeCloseTo(29.41, 2);
  });

  it("perInjectorCcMin ≈ 308.8", () => {
    const r = injectorSizeRequired(400, 8);
    // Full precision: 308.81808278867106
    expect(r.perInjectorCcMin).toBeCloseTo(308.8, 1);
  });

  it("stores assumptions", () => {
    const r = injectorSizeRequired(400, 8);
    expect(r.assumptions.bsfc).toBe(0.5);
    expect(r.assumptions.maxDutyCycle).toBe(0.85);
    expect(r.assumptions.fuelDensityGPerCc).toBe(0.72);
    expect(r.assumptions.cylinders).toBe(8);
    expect(r.assumptions.targetHp).toBe(400);
  });

  it("result includes a note about BSFC and duty cycle", () => {
    const r = injectorSizeRequired(400, 8);
    expect(r.note).toMatch(/BSFC/i);
  });
});

describe("injectorSizeRequired — explicit parameters", () => {
  it("600 HP, 8 cyl, bsfc 0.6 → totalFuelLbHr = 360", () => {
    const r = injectorSizeRequired(600, 8, 0.6);
    expect(r.totalFuelLbHr).toBe(360);
  });

  it("higher maxDutyCycle reduces perInjectorLbHr", () => {
    const conservative = injectorSizeRequired(400, 8, 0.5, 0.80);
    const aggressive = injectorSizeRequired(400, 8, 0.5, 0.90);
    expect(aggressive.perInjectorLbHr).toBeLessThan(conservative.perInjectorLbHr);
  });
});

// ─── injectorMaxHp ────────────────────────────────────────────────────────────
// Pinned values (8 cyl, duty 0.85, bsfc 0.5, density 0.72):
//   550 cc/min → injectorLbHr = 52.38187622356655
//   maxHp = 52.38187622356655 × 8 × 0.85 / 0.5 = 712.393…
//   (spec says "≈712.5"; full precision is 712.39)

describe("injectorMaxHp — pinned values (550 cc/min, 8 cyl)", () => {
  it("injectorLbHr ≈ 52.38 (from 550 cc/min)", () => {
    const r = injectorMaxHp(550, "cc_min", 8);
    // Full precision: 52.38187622356655
    expect(r.injectorLbHr).toBeCloseTo(52.38, 2);
  });

  it("maxHp ≈ 712.39 (spec's ≈712.5 is a rounded approximation)", () => {
    const r = injectorMaxHp(550, "cc_min", 8);
    // Full precision: 712.393516640505
    expect(r.maxHp).toBeCloseTo(712.39, 1);
  });

  it("injectorCcMin echoes input 550", () => {
    const r = injectorMaxHp(550, "cc_min", 8);
    expect(r.injectorCcMin).toBe(550);
  });

  it("stores assumptions", () => {
    const r = injectorMaxHp(550, "cc_min", 8);
    expect(r.assumptions.cylinders).toBe(8);
    expect(r.assumptions.bsfc).toBe(0.5);
    expect(r.assumptions.maxDutyCycle).toBe(0.85);
    expect(r.assumptions.fuelDensityGPerCc).toBe(0.72);
  });

  it("result includes a note about BSFC and duty cycle", () => {
    const r = injectorMaxHp(550, "cc_min", 8);
    expect(r.note).toMatch(/BSFC/i);
  });
});

describe("injectorMaxHp — lb/hr input path", () => {
  it("52.38 lb/hr → injectorLbHr = 52.38 (echoed directly)", () => {
    const r = injectorMaxHp(52.38, "lb_hr", 8);
    expect(r.injectorLbHr).toBe(52.38);
  });
});

// ─── round-trip: injectorSizeRequired ↔ injectorMaxHp ────────────────────────
// injectorSizeRequired(targetHp) then injectorMaxHp(perInjectorLbHr) with identical
// parameters is an exact algebraic inverse:
//   perInjLbHr = (targetHp * bsfc) / (cylinders * duty)
//   maxHp      = perInjLbHr * cylinders * duty / bsfc = targetHp

describe("round-trip: injectorSizeRequired → injectorMaxHp recovers targetHp", () => {
  it("400 HP, 8 cyl, defaults → round-trip returns 400", () => {
    const sized = injectorSizeRequired(400, 8);
    const recovered = injectorMaxHp(sized.perInjectorLbHr, "lb_hr", 8);
    expect(recovered.maxHp).toBeCloseTo(400, 8);
  });

  it("700 HP, 6 cyl, bsfc 0.6, duty 0.80 → round-trip returns 700", () => {
    const sized = injectorSizeRequired(700, 6, 0.6, 0.80);
    const recovered = injectorMaxHp(sized.perInjectorLbHr, "lb_hr", 6, 0.6, 0.80);
    expect(recovered.maxHp).toBeCloseTo(700, 8);
  });
});

// ─── validation-relevant behaviour ───────────────────────────────────────────
// The domain functions are pure and do not throw. Validation (rejecting bad inputs)
// is enforced by Zod in register.ts. Here we verify the Zod schema shapes via
// safeParse, using the same constraints documented in the tool registration.

import * as z from "zod/v4";

// Inline schemas matching register.ts — tested here via safeParse to verify constraints.
const flowConvertSchema = z.object({
  value: z.number().positive(),
  from: z.enum(["cc_min", "lb_hr"]),
  fuelDensityGPerCc: z.number().positive().default(0.72)
});

const sizeRequiredSchema = z.object({
  targetHp: z.number().positive(),
  cylinders: z.number().int().positive(),
  bsfc: z.number().positive().default(0.5),
  maxDutyCycle: z.number().positive().max(1).default(0.85),
  fuelDensityGPerCc: z.number().positive().default(0.72)
});

const maxHpSchema = z.object({
  injectorFlow: z.number().positive(),
  flowUnit: z.enum(["cc_min", "lb_hr"]),
  cylinders: z.number().int().positive(),
  bsfc: z.number().positive().default(0.5),
  maxDutyCycle: z.number().positive().max(1).default(0.85),
  fuelDensityGPerCc: z.number().positive().default(0.72)
});

describe("injector_flow_convert schema — validation", () => {
  it("rejects value <= 0", () => {
    expect(flowConvertSchema.safeParse({ value: 0, from: "cc_min" }).success).toBe(false);
    expect(flowConvertSchema.safeParse({ value: -10, from: "cc_min" }).success).toBe(false);
  });

  it("rejects invalid flow unit enum", () => {
    expect(flowConvertSchema.safeParse({ value: 100, from: "gal_min" }).success).toBe(false);
  });

  it("rejects non-positive fuelDensityGPerCc", () => {
    expect(flowConvertSchema.safeParse({ value: 100, from: "cc_min", fuelDensityGPerCc: 0 }).success).toBe(false);
    expect(flowConvertSchema.safeParse({ value: 100, from: "cc_min", fuelDensityGPerCc: -1 }).success).toBe(false);
  });

  it("accepts valid cc_min and lb_hr", () => {
    expect(flowConvertSchema.safeParse({ value: 550, from: "cc_min" }).success).toBe(true);
    expect(flowConvertSchema.safeParse({ value: 52, from: "lb_hr" }).success).toBe(true);
  });
});

describe("injector_size_required schema — validation", () => {
  it("rejects targetHp <= 0", () => {
    expect(sizeRequiredSchema.safeParse({ targetHp: 0, cylinders: 8 }).success).toBe(false);
  });

  it("rejects non-integer cylinders", () => {
    expect(sizeRequiredSchema.safeParse({ targetHp: 400, cylinders: 7.5 }).success).toBe(false);
  });

  it("rejects cylinders <= 0", () => {
    expect(sizeRequiredSchema.safeParse({ targetHp: 400, cylinders: 0 }).success).toBe(false);
    expect(sizeRequiredSchema.safeParse({ targetHp: 400, cylinders: -1 }).success).toBe(false);
  });

  it("rejects maxDutyCycle > 1", () => {
    expect(sizeRequiredSchema.safeParse({ targetHp: 400, cylinders: 8, maxDutyCycle: 1.1 }).success).toBe(false);
  });

  it("rejects maxDutyCycle <= 0", () => {
    expect(sizeRequiredSchema.safeParse({ targetHp: 400, cylinders: 8, maxDutyCycle: 0 }).success).toBe(false);
  });

  it("accepts maxDutyCycle = 1", () => {
    expect(sizeRequiredSchema.safeParse({ targetHp: 400, cylinders: 8, maxDutyCycle: 1 }).success).toBe(true);
  });

  it("accepts valid defaults", () => {
    expect(sizeRequiredSchema.safeParse({ targetHp: 400, cylinders: 8 }).success).toBe(true);
  });
});

describe("injector_max_hp schema — validation", () => {
  it("rejects injectorFlow <= 0", () => {
    expect(maxHpSchema.safeParse({ injectorFlow: 0, flowUnit: "cc_min", cylinders: 8 }).success).toBe(false);
  });

  it("rejects invalid flowUnit enum", () => {
    expect(maxHpSchema.safeParse({ injectorFlow: 550, flowUnit: "oz_min", cylinders: 8 }).success).toBe(false);
  });

  it("rejects non-integer cylinders", () => {
    expect(maxHpSchema.safeParse({ injectorFlow: 550, flowUnit: "cc_min", cylinders: 3.5 }).success).toBe(false);
  });

  it("rejects maxDutyCycle > 1", () => {
    expect(maxHpSchema.safeParse({ injectorFlow: 550, flowUnit: "cc_min", cylinders: 8, maxDutyCycle: 1.01 }).success).toBe(false);
  });

  it("accepts maxDutyCycle = 1", () => {
    expect(maxHpSchema.safeParse({ injectorFlow: 550, flowUnit: "cc_min", cylinders: 8, maxDutyCycle: 1 }).success).toBe(true);
  });

  it("accepts valid input", () => {
    expect(maxHpSchema.safeParse({ injectorFlow: 550, flowUnit: "cc_min", cylinders: 8 }).success).toBe(true);
  });
});
