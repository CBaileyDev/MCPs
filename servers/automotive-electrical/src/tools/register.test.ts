import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAutomotiveElectricalTools } from "./register.js";

// ─── stub server that captures tool registrations ────────────────────────────

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

// ─── registration count ──────────────────────────────────────────────────────

describe("registerAutomotiveElectricalTools", () => {
  it("registers exactly 6 tools", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    expect(registrations).toHaveLength(6);
    const names = registrations.map(r => r.name);
    expect(names).toContain("voltage_drop");
    expect(names).toContain("recommend_wire_gauge");
    expect(names).toContain("ohms_law");
    expect(names).toContain("fuse_size");
    expect(names).toContain("battery_runtime");
    expect(names).toContain("battery_bank");
  });
});

// ─── voltage_drop ─────────────────────────────────────────────────────────────

describe("voltage_drop tool — pinned values", () => {
  it('awg "10", 10A, 15ft, 12V, copper → vDrop 0.30, dropPercent 2.50, endVolts 11.70', () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "voltage_drop", {
      awg: "10",
      amps: 10,
      lengthFeet: 15,
      systemVolts: 12,
      material: "copper"
    });
    expect(r).toMatchObject({ vDrop: 0.30, dropPercent: 2.50, endVolts: 11.70 });
  });

  it('awg "4", 50A, 20ft, 12V, copper → vDrop 0.50, dropPercent 4.14', () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "voltage_drop", {
      awg: "4",
      amps: 50,
      lengthFeet: 20,
      systemVolts: 12,
      material: "copper"
    });
    expect(r).toMatchObject({ vDrop: 0.50, dropPercent: 4.14 });
  });

  it("result includes a non-empty note field", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "voltage_drop", {
      awg: "10",
      amps: 10,
      lengthFeet: 15,
      systemVolts: 12,
      material: "copper"
    });
    expect(typeof r.note).toBe("string");
    expect((r.note as string).length).toBeGreaterThan(0);
  });
});

// ─── recommend_wire_gauge ────────────────────────────────────────────────────

describe("recommend_wire_gauge tool — pinned values", () => {
  it('10A, 15ft, 12V, 3%, copper → awg "10", dropPercent 2.50', () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "recommend_wire_gauge", {
      amps: 10,
      lengthFeet: 15,
      systemVolts: 12,
      maxDropPercent: 3,
      material: "copper"
    });
    expect(r).toMatchObject({ awg: "10", dropPercent: 2.50 });
  });

  it('10A, 15ft, 12V, 10%, copper → awg "14", dropPercent 6.31', () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "recommend_wire_gauge", {
      amps: 10,
      lengthFeet: 15,
      systemVolts: 12,
      maxDropPercent: 10,
      material: "copper"
    });
    expect(r).toMatchObject({ awg: "14", dropPercent: 6.31 });
  });
});

// ─── ohms_law ─────────────────────────────────────────────────────────────────

describe("ohms_law tool — pinned values", () => {
  it("{volts:12, amps:3} → ohms 4, watts 36", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "ohms_law", { volts: 12, amps: 3 });
    expect(r).toMatchObject({ ohms: 4, watts: 36 });
    expect(r.error).toBeUndefined();
  });

  it("{watts:36, ohms:4} → amps 3, volts 12", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "ohms_law", { watts: 36, ohms: 4 });
    expect(r).toMatchObject({ amps: 3, volts: 12 });
  });

  it("{watts:100, volts:10} → amps 10, ohms 1", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "ohms_law", { watts: 100, volts: 10 });
    expect(r).toMatchObject({ amps: 10, ohms: 1 });
  });
});

describe("ohms_law tool — validation", () => {
  it("returns error object when only 1 input provided", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "ohms_law", { volts: 12 });
    expect(typeof r.error).toBe("string");
    expect((r.error as string)).toMatch(/exactly 2/);
  });

  it("returns error object when 3 inputs provided", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "ohms_law", { volts: 12, amps: 3, ohms: 4 });
    expect(typeof r.error).toBe("string");
    expect((r.error as string)).toMatch(/exactly 2/);
  });
});

// ─── fuse_size ────────────────────────────────────────────────────────────────

describe("fuse_size tool — pinned values", () => {
  it("continuousAmps 10, factor 1.25 → minRequiredAmps 12.50, recommendedFuseAmps 15", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "fuse_size", {
      continuousAmps: 10,
      factor: 1.25
    });
    expect(r).toMatchObject({ minRequiredAmps: 12.50, recommendedFuseAmps: 15 });
  });

  it("continuousAmps 20, factor 1.25 → minRequiredAmps 25, recommendedFuseAmps 25", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "fuse_size", {
      continuousAmps: 20,
      factor: 1.25
    });
    expect(r).toMatchObject({ minRequiredAmps: 25, recommendedFuseAmps: 25 });
  });

  it("returns a non-empty caveat string", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "fuse_size", {
      continuousAmps: 10,
      factor: 1.25
    });
    expect(typeof r.caveat).toBe("string");
    expect((r.caveat as string).length).toBeGreaterThan(0);
  });
});

// ─── battery_runtime ──────────────────────────────────────────────────────────

describe("battery_runtime tool — pinned values", () => {
  it("100Ah, loadAmps 5, 50% DoD → runtimeHours 10, usableAh 50", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "battery_runtime", {
      capacityAh: 100,
      loadAmps: 5,
      systemVolts: 12,
      usableDepthPercent: 50
    });
    expect(r).toMatchObject({ runtimeHours: 10, usableAh: 50 });
    expect(r.error).toBeUndefined();
  });

  it("100Ah, loadWatts 60, 12V, 50% DoD → loadAmps 5, runtimeHours 10", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "battery_runtime", {
      capacityAh: 100,
      loadWatts: 60,
      systemVolts: 12,
      usableDepthPercent: 50
    });
    expect(r).toMatchObject({ loadAmps: 5, runtimeHours: 10 });
  });

  it("100Ah, loadAmps 10, 80% DoD → runtimeHours 8", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "battery_runtime", {
      capacityAh: 100,
      loadAmps: 10,
      systemVolts: 12,
      usableDepthPercent: 80
    });
    expect(r).toMatchObject({ runtimeHours: 8 });
  });

  it("returns a non-empty note string mentioning Peukert", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "battery_runtime", {
      capacityAh: 100,
      loadAmps: 5,
      systemVolts: 12,
      usableDepthPercent: 50
    });
    expect(typeof r.note).toBe("string");
    expect((r.note as string)).toMatch(/Peukert/);
  });
});

describe("battery_runtime tool — validation", () => {
  it("returns error when both loadAmps and loadWatts provided", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "battery_runtime", {
      capacityAh: 100,
      loadAmps: 5,
      loadWatts: 60,
      systemVolts: 12,
      usableDepthPercent: 50
    });
    expect(typeof r.error).toBe("string");
    expect((r.error as string)).toMatch(/exactly one/);
  });

  it("returns error when neither loadAmps nor loadWatts provided", () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "battery_runtime", {
      capacityAh: 100,
      systemVolts: 12,
      usableDepthPercent: 50
    });
    expect(typeof r.error).toBe("string");
    expect((r.error as string)).toMatch(/exactly one/);
  });
});

// ─── battery_bank ─────────────────────────────────────────────────────────────

describe("battery_bank tool — pinned values", () => {
  it('12V, 100Ah, 2S1P → totalVolts 24, totalAh 100, totalWh 2400, "2S1P"', () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "battery_bank", {
      cellVolts: 12,
      cellAh: 100,
      series: 2,
      parallel: 1
    });
    expect(r).toMatchObject({
      totalVolts: 24,
      totalAh: 100,
      totalWh: 2400,
      configuration: "2S1P"
    });
  });

  it('12V, 100Ah, 1S2P → totalVolts 12, totalAh 200, totalWh 2400, "1S2P"', () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "battery_bank", {
      cellVolts: 12,
      cellAh: 100,
      series: 1,
      parallel: 2
    });
    expect(r).toMatchObject({
      totalVolts: 12,
      totalAh: 200,
      totalWh: 2400,
      configuration: "1S2P"
    });
  });

  it('12V, 100Ah, 2S2P → totalVolts 24, totalAh 200, totalWh 4800, "2S2P"', () => {
    const { server, registrations } = makeStubServer();
    registerAutomotiveElectricalTools(server);
    const r = callTool(registrations, "battery_bank", {
      cellVolts: 12,
      cellAh: 100,
      series: 2,
      parallel: 2
    });
    expect(r).toMatchObject({
      totalVolts: 24,
      totalAh: 200,
      totalWh: 4800,
      configuration: "2S2P"
    });
  });
});
