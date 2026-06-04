import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAutomotiveUnitConverterTools } from "./register.js";

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

function callTool(registrations: Registration[], toolName: string, args: Record<string, unknown>) {
  const handler = getHandler(registrations, toolName);
  const result = handler(args) as { structuredContent?: Record<string, unknown> };
  return result.structuredContent as Record<string, unknown>;
}

// ─── registration count ──────────────────────────────────────────────────────

describe("registerAutomotiveUnitConverterTools", () => {
  it("registers exactly 6 tools", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    expect(registrations).toHaveLength(6);
    const names = registrations.map(r => r.name);
    expect(names).toContain("convert_fuel_economy");
    expect(names).toContain("convert_power");
    expect(names).toContain("convert_torque");
    expect(names).toContain("convert_pressure");
    expect(names).toContain("convert_volume");
    expect(names).toContain("socket_size");
  });
});

// ─── convert_fuel_economy ────────────────────────────────────────────────────

describe("convert_fuel_economy tool — pinned values", () => {
  it("30 mpg_us → 7.84 l_per_100km, 36.03 mpg_imp, 12.75 km_per_l", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_fuel_economy", { value: 30, from: "mpg_us" });
    expect(r).toMatchObject({ l_per_100km: 7.84, mpg_imp: 36.03, km_per_l: 12.75 });
  });

  it("8 l_per_100km → 29.40 mpg_us", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_fuel_economy", { value: 8, from: "l_per_100km" });
    expect(r).toMatchObject({ mpg_us: 29.40 });
  });

  it("50 mpg_imp → 5.65 l_per_100km", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_fuel_economy", { value: 50, from: "mpg_imp" });
    expect(r).toMatchObject({ l_per_100km: 5.65 });
  });

  it("result includes a note field", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_fuel_economy", { value: 30, from: "mpg_us" });
    expect(typeof r.note).toBe("string");
    expect((r.note as string).length).toBeGreaterThan(0);
  });
});

// ─── convert_power ───────────────────────────────────────────────────────────

describe("convert_power tool — pinned values", () => {
  it("100 ps → 73.55 kw, 98.63 hp", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_power", { value: 100, from: "ps" });
    expect(r).toMatchObject({ kw: 73.55, hp: 98.63 });
  });

  it("200 hp → 149.14 kw, 202.77 ps", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_power", { value: 200, from: "hp" });
    expect(r).toMatchObject({ kw: 149.14, ps: 202.77 });
  });

  it("100 kw → 134.10 hp, 135.96 ps", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_power", { value: 100, from: "kw" });
    expect(r).toMatchObject({ hp: 134.10, ps: 135.96 });
  });
});

// ─── convert_torque ──────────────────────────────────────────────────────────

describe("convert_torque tool — pinned values", () => {
  it("100 lb_ft → 135.58 nm, 13.83 kg_m", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_torque", { value: 100, from: "lb_ft" });
    expect(r).toMatchObject({ nm: 135.58, kg_m: 13.83 });
  });

  it("200 nm → 147.51 lb_ft, 20.39 kg_m", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_torque", { value: 200, from: "nm" });
    expect(r).toMatchObject({ lb_ft: 147.51, kg_m: 20.39 });
  });
});

// ─── convert_pressure ────────────────────────────────────────────────────────

describe("convert_pressure tool — pinned values", () => {
  it("32 psi → 2.21 bar, 220.63 kpa", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_pressure", { value: 32, from: "psi" });
    expect(r).toMatchObject({ bar: 2.21, kpa: 220.63 });
  });

  it("29.92 inhg → 14.70 psi, 101.32 kpa (standard atmosphere)", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_pressure", { value: 29.92, from: "inhg" });
    expect(r).toMatchObject({ psi: 14.70, kpa: 101.32 });
  });

  it("1 bar → 14.50 psi", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_pressure", { value: 1, from: "bar" });
    expect(r).toMatchObject({ psi: 14.50 });
  });
});

// ─── convert_volume ──────────────────────────────────────────────────────────

describe("convert_volume tool — pinned values", () => {
  it("5 us_qt → 4.73 l", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_volume", { value: 5, from: "us_qt" });
    expect(r).toMatchObject({ l: 4.73 });
  });

  it("1 us_gal → 3.79 l, 0.83 imp_gal", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_volume", { value: 1, from: "us_gal" });
    expect(r).toMatchObject({ l: 3.79, imp_gal: 0.83 });
  });

  it("10 l → 2.64 us_gal, 2.20 imp_gal", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "convert_volume", { value: 10, from: "l" });
    expect(r).toMatchObject({ us_gal: 2.64, imp_gal: 2.20 });
  });
});

// ─── socket_size ─────────────────────────────────────────────────────────────

describe("socket_size tool — pinned values", () => {
  it('19 mm → nearest 3/4", deltaMm 0.05, verdict "interchangeable"', () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "socket_size", { value: 19, unit: "mm" });
    expect(r).toMatchObject({
      nearestLabel: '3/4"',
      deltaMm: 0.05,
      verdict: "interchangeable"
    });
  });

  it('0.75 in → nearest 19 mm, deltaMm 0.05, verdict "interchangeable"', () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "socket_size", { value: 0.75, unit: "in" });
    expect(r).toMatchObject({
      nearestLabel: "19 mm",
      deltaMm: 0.05,
      verdict: "interchangeable"
    });
  });

  it('10 mm → nearest 3/8", deltaMm 0.475, verdict "do not substitute"', () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "socket_size", { value: 10, unit: "mm" });
    expect(r).toMatchObject({
      nearestLabel: '3/8"',
      deltaMm: 0.475,
      verdict: "do not substitute"
    });
  });

  it('13 mm → nearest 1/2", deltaMm 0.30, verdict "usable in a pinch — risk of rounding the fastener"', () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveUnitConverterTools(server);
    const r = callTool(registrations, "socket_size", { value: 13, unit: "mm" });
    expect(r).toMatchObject({
      nearestLabel: '1/2"',
      deltaMm: 0.3,
      verdict: "usable in a pinch — risk of rounding the fastener"
    });
  });
});
