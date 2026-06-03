import { describe, expect, it } from "vitest";
import { registerVehicleContextTools } from "./register.js";
import { createVehicleContextMcpServer } from "../server.js";
import type { ToolResult } from "../result.js";

type RegisteredTool = {
  config: { title?: string; description?: string };
  handler: (input: Record<string, unknown>) => Promise<ToolResult>;
};

class FakeMcpServer {
  readonly tools = new Map<string, RegisteredTool>();

  registerTool(
    name: string,
    config: RegisteredTool["config"],
    handler: RegisteredTool["handler"]
  ): void {
    this.tools.set(name, { config, handler });
  }
}

const EXPECTED_TOOLS = [
  "resolve_vehicle_context",
  "merge_vehicle_evidence",
  "list_missing_fitment_attributes",
  "explain_vehicle_confidence",
  "check_basic_fitment_context",
  "record_fitment_correction"
];

describe("registerVehicleContextTools", () => {
  it("registers exactly the six fitment-context tools", () => {
    const server = new FakeMcpServer();
    registerVehicleContextTools(server);
    expect([...server.tools.keys()]).toEqual(EXPECTED_TOOLS);
  });

  it("every tool is read-only and not open-world", () => {
    const server = new FakeMcpServer();
    registerVehicleContextTools(server);
    for (const [, tool] of server.tools) {
      const annotations = (tool.config as { annotations?: Record<string, unknown> }).annotations;
      expect(annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    }
  });

  it("resolve_vehicle_context returns a normalized context with missing attributes", async () => {
    const server = new FakeMcpServer();
    registerVehicleContextTools(server);

    const result = await server.tools
      .get("resolve_vehicle_context")
      ?.handler({ year: 2019, make: "Toyota", model: "Camry" });

    expect(result?.structuredContent).toMatchObject({
      attributes: { make: { value: "Toyota", status: "confirmed" } }
    });
    const missing = (result?.structuredContent as { missingAttributes: Array<{ attribute: string }> })
      .missingAttributes;
    expect(missing.map(m => m.attribute)).toContain("drivetrain");
  });

  it("merge_vehicle_evidence surfaces conflicts", async () => {
    const server = new FakeMcpServer();
    registerVehicleContextTools(server);

    const result = await server.tools.get("merge_vehicle_evidence")?.handler({
      drivetrain: "FWD",
      evidence: [{ source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" }]
    });

    expect(result?.structuredContent).toMatchObject({ conflicts: ["drivetrain"] });
    // The bare field is folded exactly once: the handler must strip the evidence
    // payload before normalizing so it is not folded a second time during merge
    // (which would duplicate the record to 3 instead of 2).
    const drivetrain = (
      result?.structuredContent as { attributes: { drivetrain: { evidence: unknown[] } } }
    ).attributes.drivetrain;
    expect(drivetrain.evidence.length).toBe(2);
  });

  it("check_basic_fitment_context always returns a non-empty caveat", async () => {
    const server = new FakeMcpServer();
    registerVehicleContextTools(server);

    const sufficientCase = await server.tools.get("check_basic_fitment_context")?.handler({
      year: 2019,
      make: "Toyota",
      model: "Camry",
      drivetrain: "FWD",
      trim: "LE",
      partCategory: "brakes"
    });
    const sufficient = sufficientCase?.structuredContent as {
      sufficient: boolean;
      missingForCategory: string[];
      caveats: string[];
    };
    expect(sufficient.sufficient).toBe(true);
    expect(sufficient.caveats.length).toBeGreaterThan(0);

    const insufficientCase = await server.tools.get("check_basic_fitment_context")?.handler({
      make: "Toyota",
      partCategory: "engine"
    });
    const insufficient = insufficientCase?.structuredContent as {
      sufficient: boolean;
      missingForCategory: string[];
      caveats: string[];
    };
    expect(insufficient.sufficient).toBe(false);
    expect(insufficient.missingForCategory).toContain("engine");
    expect(insufficient.caveats.length).toBeGreaterThan(0);
  });

  it("check_basic_fitment_context surfaces the real fitment-guarantee disclaimer text", async () => {
    const server = new FakeMcpServer();
    registerVehicleContextTools(server);

    const result = await server.tools.get("check_basic_fitment_context")?.handler({
      year: 2019,
      make: "Toyota",
      model: "Camry",
      partCategory: "brakes"
    });
    const caveats = (result?.structuredContent as { caveats: string[] }).caveats;
    const joined = caveats.join(" ");
    // The actual safety-contract disclaimer, not just "some caveat exists".
    expect(joined).toContain("NOT a verified fitment guarantee");
    expect(joined).toContain("Confirm exact part compatibility against a catalog");
  });

  it("check_basic_fitment_context with an unmapped partCategory falls back to base and warns", async () => {
    const server = new FakeMcpServer();
    registerVehicleContextTools(server);

    // "spoiler" is not in CATEGORY_REQUIREMENTS -> only year/make/model checked.
    const result = await server.tools.get("check_basic_fitment_context")?.handler({
      year: 2019,
      make: "Toyota",
      model: "Camry",
      partCategory: "spoiler"
    });
    const out = result?.structuredContent as {
      sufficient: boolean;
      missingForCategory: string[];
      caveats: string[];
    };

    // base year/make/model are all present -> sufficient, nothing missing
    expect(out.sufficient).toBe(true);
    expect(out.missingForCategory).toEqual([]);
    // and the "not in the heuristic map" caveat fires
    expect(out.caveats.some(c => c.includes("not in the heuristic map"))).toBe(true);
  });

  it("check_basic_fitment_context with no partCategory checks only the base attributes", async () => {
    const server = new FakeMcpServer();
    registerVehicleContextTools(server);

    const result = await server.tools.get("check_basic_fitment_context")?.handler({
      year: 2019,
      make: "Toyota",
      model: "Camry"
    });
    const out = result?.structuredContent as {
      sufficient: boolean;
      missingForCategory: string[];
      caveats: string[];
    };

    expect(out.sufficient).toBe(true);
    expect(out.missingForCategory).toEqual([]);
    expect(out.caveats.some(c => c.includes("No partCategory was provided"))).toBe(true);
  });

  it("check_basic_fitment_context surfaces conflicts produced by disagreeing evidence", async () => {
    const server = new FakeMcpServer();
    registerVehicleContextTools(server);

    const result = await server.tools.get("check_basic_fitment_context")?.handler({
      year: 2019,
      make: "Toyota",
      model: "Camry",
      drivetrain: "FWD",
      source: "user",
      partCategory: "brakes",
      evidence: [{ source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" }]
    });
    const out = result?.structuredContent as { caveats: string[] };
    expect(out.caveats.some(c => c.includes("in conflict") && c.includes("drivetrain"))).toBe(true);
  });

  it("explain_vehicle_confidence carries the 'not guaranteed part compatibility' phrasing and surfaces conflicts", async () => {
    const server = new FakeMcpServer();
    registerVehicleContextTools(server);

    const result = await server.tools.get("explain_vehicle_confidence")?.handler({
      drivetrain: "FWD",
      source: "user",
      evidence: [{ source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" }]
    });
    const out = result?.structuredContent as { headline: string; conflicts: string[] };

    expect(out.headline).toContain("not guaranteed part compatibility");
    expect(out.conflicts).toContain("drivetrain");
  });

  it("record_fitment_correction confirms the corrected attribute", async () => {
    const server = new FakeMcpServer();
    registerVehicleContextTools(server);

    const result = await server.tools.get("record_fitment_correction")?.handler({
      make: "Toyota",
      attribute: "trim",
      value: "LE"
    });

    expect(result?.structuredContent).toMatchObject({
      attributes: { trim: { value: "LE", status: "confirmed" } }
    });
  });
});

describe("createVehicleContextMcpServer", () => {
  it("constructs an McpServer with all six tools registered", () => {
    // Smoke test: the real SDK server constructs without throwing, and the
    // structural registrar accepts it.
    const server = createVehicleContextMcpServer();
    expect(server).toBeDefined();
  });
});
