import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEngineBuildMathTools } from "./register.js";

// ─── stub server that captures tool registrations ───────────────────────────

type HandlerFn = (args: Record<string, unknown>) => unknown;

interface Registration {
  name: string;
  handler: HandlerFn;
}

function makeStubServer(): { server: McpServer; registrations: Registration[] } {
  const registrations: Registration[] = [];
  const server = {
    registerTool: (name: string, _config: unknown, handler: HandlerFn) => {
      registrations.push({ name, handler });
    }
  } as unknown as McpServer;
  return { server, registrations };
}

function getHandler(registrations: Registration[], toolName: string): HandlerFn {
  const reg = registrations.find(r => r.name === toolName);
  if (!reg) throw new Error(`Tool "${toolName}" not registered`);
  return reg.handler;
}

function callTool(
  registrations: Registration[],
  toolName: string,
  args: Record<string, unknown>
) {
  const handler = getHandler(registrations, toolName);
  const result = handler(args) as { structuredContent?: Record<string, unknown> };
  return result.structuredContent as Record<string, unknown>;
}

// ─── registration count ───────────────────────────────────────────────────────

describe("registerEngineBuildMathTools", () => {
  it("registers exactly 8 tools", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    expect(registrations).toHaveLength(8);
    const names = registrations.map(r => r.name);
    expect(names).toContain("displacement");
    expect(names).toContain("compression_ratio");
    expect(names).toContain("bore_stroke_ratio");
    expect(names).toContain("mean_piston_speed");
    expect(names).toContain("engine_airflow_cfm");
    expect(names).toContain("injector_flow_convert");
    expect(names).toContain("injector_size_required");
    expect(names).toContain("injector_max_hp");
  });
});

// ─── displacement tool ────────────────────────────────────────────────────────

describe("displacement tool — pinned values (inches)", () => {
  it("SBC 350: 4.00in × 3.48in × 8 → ci ≈ 349.85, liters ≈ 5.733", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "displacement", {
      bore: 4.00,
      stroke: 3.48,
      cylinders: 8,
      unit: "in"
    });
    // spec says ≈349.83; full precision gives 349.848; rounded to 2dp = 349.85
    expect(r.ci).toBe(349.85);
    // spec says ≈5732.6; full precision gives 5732.978; rounded to 1dp = 5733.0
    expect(r.cc).toBe(5733.0);
    expect(r.liters).toBe(5.733);
  });
});

describe("displacement tool — pinned values (mm)", () => {
  it("4-cyl 92×86 mm → cc ≈ 2286.8, liters ≈ 2.287, ci ≈ 139.55", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "displacement", {
      bore: 92,
      stroke: 86,
      cylinders: 4,
      unit: "mm"
    });
    // Full precision cc = 2286.778, rounds to 2286.8 at 1dp
    expect(r.cc).toBe(2286.8);
    expect(r.liters).toBe(2.287);
    // Full precision ci = 139.548, rounds to 139.55 at 2dp
    expect(r.ci).toBe(139.55);
  });
});

describe("displacement tool — structuredContent fields", () => {
  it("result includes ci, cc, liters, sweptPerCylinder_cc, inputs", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "displacement", {
      bore: 4.00,
      stroke: 3.48,
      cylinders: 8,
      unit: "in"
    });
    expect(typeof r.ci).toBe("number");
    expect(typeof r.cc).toBe("number");
    expect(typeof r.liters).toBe("number");
    expect(typeof r.sweptPerCylinder_cc).toBe("number");
    expect(r.inputs).toBeTruthy();
  });
});

// ─── compression_ratio tool ───────────────────────────────────────────────────

describe("compression_ratio tool — pinned values", () => {
  it("4.00in/3.48in, chamber64, gasket8, deck3, piston0 → sweptCc=716.62, clearanceCc=75, ratio=10.55", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "compression_ratio", {
      bore: 4.00,
      stroke: 3.48,
      unit: "in",
      chamberCc: 64,
      gasketCc: 8,
      deckCc: 3,
      pistonCc: 0
    });
    // Full precision sweptCc = 716.622, rounds to 716.62 at 2dp
    expect(r.sweptCc).toBe(716.62);
    expect(r.clearanceCc).toBe(75);
    // Full precision ratio = 10.5550, rounds to 10.55 (NOT 10.56)
    expect(r.ratio).toBe(10.55);
    expect(r.ratioLabel).toBe("10.55:1");
  });
});

describe("compression_ratio tool — clearanceCc <= 0 returns error field", () => {
  it("massive dome piston → error result (no ratio field)", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "compression_ratio", {
      bore: 4.00,
      stroke: 3.48,
      unit: "in",
      chamberCc: 10,
      gasketCc: 0,
      deckCc: 0,
      pistonCc: -10
    });
    expect(typeof r.error).toBe("string");
    expect(r.ratio).toBeUndefined();
  });
});

describe("compression_ratio tool — ratioLabel format", () => {
  it("ratioLabel is a string ending in ':1'", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "compression_ratio", {
      bore: 4.00,
      stroke: 3.48,
      unit: "in",
      chamberCc: 64,
      gasketCc: 8,
      deckCc: 3,
      pistonCc: 0
    });
    expect(typeof r.ratioLabel).toBe("string");
    expect((r.ratioLabel as string).endsWith(":1")).toBe(true);
  });
});

// ─── bore_stroke_ratio tool ───────────────────────────────────────────────────

describe("bore_stroke_ratio tool — pinned values", () => {
  it("4.00/3.48 → ratio ≈ 1.1494, oversquare", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "bore_stroke_ratio", { bore: 4.00, stroke: 3.48 });
    expect(r.ratio).toBe(1.1494);
    expect(r.classification).toBe("oversquare");
    expect(typeof r.meaning).toBe("string");
  });

  it("3.48/4.00 → ratio 0.87, undersquare", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "bore_stroke_ratio", { bore: 3.48, stroke: 4.00 });
    expect(r.ratio).toBe(0.87);
    expect(r.classification).toBe("undersquare");
  });

  it("4.00/4.00 → ratio 1.0, square", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "bore_stroke_ratio", { bore: 4.00, stroke: 4.00 });
    expect(r.ratio).toBe(1.0);
    expect(r.classification).toBe("square");
  });
});

// ─── mean_piston_speed tool ───────────────────────────────────────────────────

describe("mean_piston_speed tool — pinned values", () => {
  it("3.48 in, 6000 rpm → ftPerMin ≈ 3480.0, mPerSec ≈ 17.68", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "mean_piston_speed", {
      stroke: 3.48,
      unit: "in",
      rpm: 6000
    });
    expect(r.ftPerMin).toBe(3480.0);
    expect(r.mPerSec).toBe(17.68);
  });
});

describe("mean_piston_speed tool — note present", () => {
  it("result includes note field with string content", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "mean_piston_speed", {
      stroke: 3.48,
      unit: "in",
      rpm: 6000
    });
    expect(typeof r.note).toBe("string");
    expect((r.note as string).length).toBeGreaterThan(0);
  });
});

// ─── engine_airflow_cfm tool ──────────────────────────────────────────────────

describe("engine_airflow_cfm tool — pinned values", () => {
  it("350 ci, 6000 rpm, VE 0.85 → cfm ≈ 516.5", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "engine_airflow_cfm", {
      displacementCi: 350,
      rpm: 6000,
      volumetricEfficiency: 0.85
    });
    // Full precision = 516.493, rounds to 516.5 at 1dp
    expect(r.cfm).toBe(516.5);
  });
});

describe("engine_airflow_cfm tool — note present", () => {
  it("result includes note field explaining 3456", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "engine_airflow_cfm", {
      displacementCi: 350,
      rpm: 6000,
      volumetricEfficiency: 0.85
    });
    expect(typeof r.note).toBe("string");
    expect((r.note as string).includes("3456")).toBe(true);
  });
});

// ─── injector_flow_convert tool ───────────────────────────────────────────────
// Pinned: 550 cc/min → lbPerHr ≈ 52.38 (full precision 52.38187…, rounds to 52.38 at 2dp)

describe("injector_flow_convert tool — pinned values cc_min input", () => {
  it("550 cc/min → ccPerMin = 550, lbPerHr ≈ 52.38", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "injector_flow_convert", {
      value: 550,
      from: "cc_min",
      fuelDensityGPerCc: 0.72
    });
    expect(r.ccPerMin).toBe(550);
    // Full precision 52.38187622…, rounds to 52.38 at 2dp
    expect(r.lbPerHr).toBe(52.38);
  });
});

describe("injector_flow_convert tool — pinned values lb_hr input", () => {
  it("52.38 lb/hr → lbPerHr = 52.38, ccPerMin ≈ 549.98", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "injector_flow_convert", {
      value: 52.38,
      from: "lb_hr",
      fuelDensityGPerCc: 0.72
    });
    expect(r.lbPerHr).toBe(52.38);
    // 52.38 lb/hr is a rounded value; back-conversion gives ≈ 549.98
    expect(r.ccPerMin as number).toBeCloseTo(549.98, 1);
  });
});

describe("injector_flow_convert tool — round-trip via full-precision domain values", () => {
  it("550 cc/min → lb/hr → cc/min recovers 550 within tool rounding tolerance", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const step1 = callTool(registrations, "injector_flow_convert", {
      value: 550,
      from: "cc_min",
      fuelDensityGPerCc: 0.72
    });
    // step1.lbPerHr = 52.38 (rounded to 2dp at tool layer)
    const step2 = callTool(registrations, "injector_flow_convert", {
      value: step1.lbPerHr as number,
      from: "lb_hr",
      fuelDensityGPerCc: 0.72
    });
    // Rounding at tool layer means we can only guarantee closeness, not exactness
    expect(step2.ccPerMin as number).toBeCloseTo(550, 0);
  });
});

describe("injector_flow_convert tool — result fields", () => {
  it("includes ccPerMin, lbPerHr, fuelDensityGPerCc, note, inputs", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "injector_flow_convert", {
      value: 550,
      from: "cc_min"
    });
    expect(typeof r.ccPerMin).toBe("number");
    expect(typeof r.lbPerHr).toBe("number");
    expect(typeof r.fuelDensityGPerCc).toBe("number");
    expect(typeof r.note).toBe("string");
    expect(r.inputs).toBeTruthy();
  });
});

// ─── injector_size_required tool ─────────────────────────────────────────────
// Pinned (bsfc 0.5, duty 0.85, density 0.72): 400 HP, 8 cyl
//   totalFuelLbHr = 200, perInjectorLbHr ≈ 29.41, perInjectorCcMin ≈ 308.8

describe("injector_size_required tool — pinned values (400 HP, 8 cyl)", () => {
  it("totalFuelLbHr = 200, perInjectorLbHr ≈ 29.41, perInjectorCcMin ≈ 308.8", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "injector_size_required", {
      targetHp: 400,
      cylinders: 8,
      bsfc: 0.5,
      maxDutyCycle: 0.85,
      fuelDensityGPerCc: 0.72
    });
    expect(r.totalFuelLbHr).toBe(200);
    // Full precision: 29.411764705882355 → rounds to 29.41 at 2dp
    expect(r.perInjectorLbHr).toBe(29.41);
    // Full precision: 308.818… → rounds to 308.8 at 1dp
    expect(r.perInjectorCcMin).toBe(308.8);
  });
});

describe("injector_size_required tool — result fields", () => {
  it("includes perInjectorLbHr, perInjectorCcMin, totalFuelLbHr, assumptions, note", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "injector_size_required", {
      targetHp: 400,
      cylinders: 8
    });
    expect(typeof r.perInjectorLbHr).toBe("number");
    expect(typeof r.perInjectorCcMin).toBe("number");
    expect(typeof r.totalFuelLbHr).toBe("number");
    expect(r.assumptions).toBeTruthy();
    expect(typeof r.note).toBe("string");
    expect((r.note as string).length).toBeGreaterThan(0);
  });
});

// ─── injector_max_hp tool ─────────────────────────────────────────────────────
// Pinned (8 cyl, duty 0.85, bsfc 0.5, density 0.72): 550 cc/min
//   injectorLbHr ≈ 52.38 (rounds to 52.38), maxHp ≈ 712.4
//   Full precision: injectorLbHr = 52.38187…, maxHp = 712.393…
//   Spec's "≈712.5" is a rounded approximation; actual is 712.4 at 1dp.

describe("injector_max_hp tool — pinned values (550 cc/min, 8 cyl)", () => {
  it("injectorLbHr ≈ 52.38, maxHp ≈ 712.4 (full precision 712.39; spec's 712.5 is rounded)", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "injector_max_hp", {
      injectorFlow: 550,
      flowUnit: "cc_min",
      cylinders: 8,
      bsfc: 0.5,
      maxDutyCycle: 0.85,
      fuelDensityGPerCc: 0.72
    });
    // Full precision injectorLbHr = 52.38187622…, rounds to 52.38 at 2dp
    expect(r.injectorLbHr).toBe(52.38);
    // Full precision maxHp = 712.393516…, rounds to 712.4 at 1dp
    expect(r.maxHp).toBe(712.4);
    expect(r.injectorCcMin).toBe(550);
  });
});

describe("injector_max_hp tool — result fields", () => {
  it("includes maxHp, injectorLbHr, injectorCcMin, assumptions, note", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const r = callTool(registrations, "injector_max_hp", {
      injectorFlow: 550,
      flowUnit: "cc_min",
      cylinders: 8
    });
    expect(typeof r.maxHp).toBe("number");
    expect(typeof r.injectorLbHr).toBe("number");
    expect(typeof r.injectorCcMin).toBe("number");
    expect(r.assumptions).toBeTruthy();
    expect(typeof r.note).toBe("string");
  });
});

describe("injector_max_hp tool — round-trip with injector_size_required", () => {
  it("size_required(400 HP, 8 cyl) → max_hp(perInjectorLbHr) → recovers ≈ 400 HP", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    const sized = callTool(registrations, "injector_size_required", {
      targetHp: 400,
      cylinders: 8,
      bsfc: 0.5,
      maxDutyCycle: 0.85,
      fuelDensityGPerCc: 0.72
    });
    // Use rounded tool output; round-trip through domain is exact, tool layer adds small rounding error
    const maxed = callTool(registrations, "injector_max_hp", {
      injectorFlow: sized.perInjectorLbHr as number,
      flowUnit: "lb_hr",
      cylinders: 8,
      bsfc: 0.5,
      maxDutyCycle: 0.85,
      fuelDensityGPerCc: 0.72
    });
    // Tool rounds perInjectorLbHr to 2dp (29.41), so recovery is approximate
    expect(maxed.maxHp as number).toBeCloseTo(400, 0);
  });
});
