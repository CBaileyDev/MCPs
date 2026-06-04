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
  it("registers exactly 5 tools", () => {
    const { server, registrations } = makeStubServer();
    registerEngineBuildMathTools(server);
    expect(registrations).toHaveLength(5);
    const names = registrations.map(r => r.name);
    expect(names).toContain("displacement");
    expect(names).toContain("compression_ratio");
    expect(names).toContain("bore_stroke_ratio");
    expect(names).toContain("mean_piston_speed");
    expect(names).toContain("engine_airflow_cfm");
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
