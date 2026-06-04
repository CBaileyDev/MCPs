import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTowingPayloadMathTools } from "./register.js";

// ─── stub server that captures tool registrations ─────────────────────────────

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

describe("registerTowingPayloadMathTools", () => {
  it("registers exactly 4 tools", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    expect(registrations).toHaveLength(4);
    const names = registrations.map(r => r.name);
    expect(names).toContain("tongue_weight");
    expect(names).toContain("payload_check");
    expect(names).toContain("towing_headroom");
    expect(names).toContain("tow_setup_check");
  });
});

// ─── tongue_weight tool ───────────────────────────────────────────────────────

describe("tongue_weight tool — pinned: trailer 5000, tonguePercent 12 → weight 600, in range", () => {
  it("tongueWeightLb = 600.0", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "tongue_weight", {
      trailerWeightLb: 5000,
      tonguePercent: 12,
      unit: "lb"
    });
    expect(r.tongueWeightLb).toBe(600.0);
  });

  it("classification = 'in range'", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "tongue_weight", {
      trailerWeightLb: 5000,
      tonguePercent: 12,
      unit: "lb"
    });
    expect(r.classification).toBe("in range");
  });
});

describe("tongue_weight tool — pinned: trailer 5000, tongueWeightLb 600 → percent 12.0, in range", () => {
  it("tonguePercent = 12.0", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "tongue_weight", {
      trailerWeightLb: 5000,
      tongueWeightLb: 600,
      unit: "lb"
    });
    expect(r.tonguePercent).toBe(12.0);
  });

  it("classification = 'in range'", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "tongue_weight", {
      trailerWeightLb: 5000,
      tongueWeightLb: 600,
      unit: "lb"
    });
    expect(r.classification).toBe("in range");
  });
});

describe("tongue_weight tool — pinned: trailer 5000, tonguePercent 8 → weight 400, too light", () => {
  it("tongueWeightLb = 400.0", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "tongue_weight", {
      trailerWeightLb: 5000,
      tonguePercent: 8,
      unit: "lb"
    });
    expect(r.tongueWeightLb).toBe(400.0);
  });

  it("classification = 'too light — trailer sway risk'", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "tongue_weight", {
      trailerWeightLb: 5000,
      tonguePercent: 8,
      unit: "lb"
    });
    expect(r.classification).toBe("too light — trailer sway risk");
  });
});

describe("tongue_weight tool — neither input → error field", () => {
  it("returns error when neither tongueWeightLb nor tonguePercent provided", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "tongue_weight", {
      trailerWeightLb: 5000,
      unit: "lb"
    });
    expect(typeof r.error).toBe("string");
    expect(r.tongueWeightLb).toBeUndefined();
  });
});

describe("tongue_weight tool — both inputs → error field", () => {
  it("returns error when both tongueWeightLb and tonguePercent provided", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "tongue_weight", {
      trailerWeightLb: 5000,
      tongueWeightLb: 600,
      tonguePercent: 12,
      unit: "lb"
    });
    expect(typeof r.error).toBe("string");
  });
});

describe("tongue_weight tool — structuredContent fields", () => {
  it("result includes tongueWeightLb, tonguePercent, classification, guidelineNote, unit, inputs", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "tongue_weight", {
      trailerWeightLb: 5000,
      tonguePercent: 12,
      unit: "lb"
    });
    expect(typeof r.tongueWeightLb).toBe("number");
    expect(typeof r.tonguePercent).toBe("number");
    expect(typeof r.classification).toBe("string");
    expect(typeof r.guidelineNote).toBe("string");
    expect(r.unit).toBe("lb");
    expect(r.inputs).toBeTruthy();
  });
});

// ─── payload_check tool ───────────────────────────────────────────────────────

describe("payload_check tool — pinned: capacity 1500, pax 800, tongue 600 → used 1400, remaining 100, over false", () => {
  it("usedPayloadLb = 1400", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "payload_check", {
      payloadCapacityLb: 1500,
      passengersAndCargoLb: 800,
      tongueWeightLb: 600,
      otherHitchLoadLb: 0,
      unit: "lb"
    });
    expect(r.usedPayloadLb).toBe(1400);
  });

  it("remainingPayloadLb = 100", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "payload_check", {
      payloadCapacityLb: 1500,
      passengersAndCargoLb: 800,
      tongueWeightLb: 600,
      otherHitchLoadLb: 0,
      unit: "lb"
    });
    expect(r.remainingPayloadLb).toBe(100);
  });

  it("over = false", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "payload_check", {
      payloadCapacityLb: 1500,
      passengersAndCargoLb: 800,
      tongueWeightLb: 600,
      otherHitchLoadLb: 0,
      unit: "lb"
    });
    expect(r.over).toBe(false);
  });
});

describe("payload_check tool — pinned: capacity 1500, pax 1000, tongue 600 → used 1600, remaining -100, over true", () => {
  it("usedPayloadLb = 1600, remainingPayloadLb = -100, over = true", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "payload_check", {
      payloadCapacityLb: 1500,
      passengersAndCargoLb: 1000,
      tongueWeightLb: 600,
      otherHitchLoadLb: 0,
      unit: "lb"
    });
    expect(r.usedPayloadLb).toBe(1600);
    expect(r.remainingPayloadLb).toBe(-100);
    expect(r.over).toBe(true);
  });
});

describe("payload_check tool — structuredContent fields", () => {
  it("result includes breakdown, note, unit, inputs", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "payload_check", {
      payloadCapacityLb: 1500,
      passengersAndCargoLb: 800,
      tongueWeightLb: 600,
      otherHitchLoadLb: 0,
      unit: "lb"
    });
    expect(r.breakdown).toBeTruthy();
    expect(typeof r.note).toBe("string");
    expect(r.unit).toBe("lb");
    expect(r.inputs).toBeTruthy();
  });
});

// ─── towing_headroom tool ─────────────────────────────────────────────────────

describe("towing_headroom tool — pinned: gcwr 15000, loadedTruck 7000, trailer 5000", () => {
  it("combinedWeightLb = 12000", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "towing_headroom", {
      gcwrLb: 15000,
      loadedTruckWeightLb: 7000,
      trailerWeightLb: 5000,
      unit: "lb"
    });
    expect(r.combinedWeightLb).toBe(12000);
  });

  it("remainingWithinGcwrLb = 3000", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "towing_headroom", {
      gcwrLb: 15000,
      loadedTruckWeightLb: 7000,
      trailerWeightLb: 5000,
      unit: "lb"
    });
    expect(r.remainingWithinGcwrLb).toBe(3000);
  });

  it("maxTrailerAtThisLoadLb = 8000", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "towing_headroom", {
      gcwrLb: 15000,
      loadedTruckWeightLb: 7000,
      trailerWeightLb: 5000,
      unit: "lb"
    });
    expect(r.maxTrailerAtThisLoadLb).toBe(8000);
  });

  it("over = false", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "towing_headroom", {
      gcwrLb: 15000,
      loadedTruckWeightLb: 7000,
      trailerWeightLb: 5000,
      unit: "lb"
    });
    expect(r.over).toBe(false);
  });
});

describe("towing_headroom tool — structuredContent fields", () => {
  it("result includes note, unit, inputs", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "towing_headroom", {
      gcwrLb: 15000,
      loadedTruckWeightLb: 7000,
      trailerWeightLb: 5000,
      unit: "lb"
    });
    expect(typeof r.note).toBe("string");
    expect(r.unit).toBe("lb");
    expect(r.inputs).toBeTruthy();
  });
});

// ─── tow_setup_check tool ────────────────────────────────────────────────────

describe("tow_setup_check tool — pinned: gvwr 7500, curb 5500, gcwr 15000, pax 800, trailer 5000, tongue 600", () => {
  function setup() {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    return callTool(registrations, "tow_setup_check", {
      gvwrLb: 7500,
      curbWeightLb: 5500,
      gcwrLb: 15000,
      passengersAndCargoLb: 800,
      trailerWeightLb: 5000,
      tongueWeightLb: 600,
      unit: "lb"
    });
  }

  it("payloadCapacityLb = 2000", () => {
    expect(setup().payloadCapacityLb).toBe(2000);
  });

  it("usedPayloadLb = 1400", () => {
    expect(setup().usedPayloadLb).toBe(1400);
  });

  it("loadedTruckWeightLb = 6900", () => {
    expect(setup().loadedTruckWeightLb).toBe(6900);
  });

  it("remainingPayloadLb = 600, payloadOk = true", () => {
    const r = setup();
    expect(r.remainingPayloadLb).toBe(600);
    expect(r.payloadOk).toBe(true);
  });

  it("combinedWeightLb = 11900", () => {
    expect(setup().combinedWeightLb).toBe(11900);
  });

  it("remainingWithinGcwrLb = 3100, gcwrOk = true", () => {
    const r = setup();
    expect(r.remainingWithinGcwrLb).toBe(3100);
    expect(r.gcwrOk).toBe(true);
  });

  it("tonguePercent = 12.0, tongueOk = true", () => {
    const r = setup();
    expect(r.tonguePercent).toBe(12.0);
    expect(r.tongueOk).toBe(true);
  });

  it("overall = true", () => {
    expect(setup().overall).toBe(true);
  });
});

describe("tow_setup_check tool — failing constraint is named", () => {
  it("payload fail → bindingConstraint includes 'payload'", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "tow_setup_check", {
      gvwrLb: 6000,
      curbWeightLb: 5500,
      gcwrLb: 15000,
      passengersAndCargoLb: 800,
      trailerWeightLb: 5000,
      tongueWeightLb: 600,
      unit: "lb"
    });
    expect(r.overall).toBe(false);
    expect((r.bindingConstraint as string).toLowerCase()).toMatch(/payload/);
  });
});

describe("tow_setup_check tool — structuredContent fields", () => {
  it("result includes all required fields", () => {
    const { server, registrations } = makeStubServer();
    registerTowingPayloadMathTools(server);
    const r = callTool(registrations, "tow_setup_check", {
      gvwrLb: 7500,
      curbWeightLb: 5500,
      gcwrLb: 15000,
      passengersAndCargoLb: 800,
      trailerWeightLb: 5000,
      tongueWeightLb: 600,
      unit: "lb"
    });
    expect(typeof r.payloadOk).toBe("boolean");
    expect(typeof r.gcwrOk).toBe("boolean");
    expect(typeof r.tongueOk).toBe("boolean");
    expect(typeof r.overall).toBe("boolean");
    expect(typeof r.bindingConstraint).toBe("string");
    expect(typeof r.note).toBe("string");
    expect(r.unit).toBe("lb");
    expect(r.inputs).toBeTruthy();
  });
});
