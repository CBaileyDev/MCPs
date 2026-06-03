import { describe, expect, it } from "vitest";
import { registerLocalAutoServicesTools } from "./register.js";
import { createLocalAutoServicesMcpServer } from "../server.js";
import type { ToolResult } from "../result.js";

type RegisteredTool = {
  config: {
    title?: string;
    description?: string;
    annotations?: Record<string, unknown>;
  };
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
  "find_auto_services",
  "find_repair_shops",
  "find_parts_stores",
  "find_tire_shops",
  "find_fuel_stations",
  "find_vehicle_inspection_sites",
  "find_towing_services",
  "explain_service_search",
];

const FIND_TOOLS = EXPECTED_TOOLS.filter((t) => t.startsWith("find_"));
const EXPLAIN_TOOLS = EXPECTED_TOOLS.filter((t) => t.startsWith("explain_"));

describe("registerLocalAutoServicesTools", () => {
  it("registers exactly the 8 tools in the correct order", () => {
    const server = new FakeMcpServer();
    registerLocalAutoServicesTools(server as unknown as Parameters<typeof registerLocalAutoServicesTools>[0]);
    expect([...server.tools.keys()]).toEqual(EXPECTED_TOOLS);
  });

  it("all find_* tools are readOnly and openWorld", () => {
    const server = new FakeMcpServer();
    registerLocalAutoServicesTools(server as unknown as Parameters<typeof registerLocalAutoServicesTools>[0]);
    for (const name of FIND_TOOLS) {
      const tool = server.tools.get(name);
      expect(tool).toBeDefined();
      expect(tool!.config.annotations).toMatchObject({
        readOnlyHint: true,
        openWorldHint: true,
      });
    }
  });

  it("explain_service_search is readOnly and NOT openWorld", () => {
    const server = new FakeMcpServer();
    registerLocalAutoServicesTools(server as unknown as Parameters<typeof registerLocalAutoServicesTools>[0]);
    for (const name of EXPLAIN_TOOLS) {
      const tool = server.tools.get(name);
      expect(tool).toBeDefined();
      expect(tool!.config.annotations).toMatchObject({
        readOnlyHint: true,
        openWorldHint: false,
      });
    }
  });

  it("every tool has a non-empty title and description", () => {
    const server = new FakeMcpServer();
    registerLocalAutoServicesTools(server as unknown as Parameters<typeof registerLocalAutoServicesTools>[0]);
    for (const [name, tool] of server.tools) {
      expect(tool.config.title, `${name} missing title`).toBeTruthy();
      expect(tool.config.description, `${name} missing description`).toBeTruthy();
    }
  });
});

describe("createLocalAutoServicesMcpServer", () => {
  it("constructs an McpServer without throwing", () => {
    const server = createLocalAutoServicesMcpServer();
    expect(server).toBeDefined();
  });
});

describe("explain_service_search handler (network-free)", () => {
  it("returns ql and cacheKey without executing a query", async () => {
    const server = new FakeMcpServer();
    registerLocalAutoServicesTools(server as unknown as Parameters<typeof registerLocalAutoServicesTools>[0]);

    const handler = server.tools.get("explain_service_search")?.handler;
    expect(handler).toBeDefined();

    const result = await handler!({
      latitude: 40.71,
      longitude: -74.0,
      radiusMeters: 5000,
      limit: 20,
      category: "repair",
    });

    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc["ql"]).toContain("[out:json]");
    expect(sc["ql"]).toContain("around:");
    expect(typeof sc["cacheKey"]).toBe("string");
    expect(sc["categories"]).toEqual(["repair"]);
    expect(sc["note"]).toContain("not executed");
  });

  it("returns an error for an unsupported category", async () => {
    const server = new FakeMcpServer();
    registerLocalAutoServicesTools(server as unknown as Parameters<typeof registerLocalAutoServicesTools>[0]);

    const handler = server.tools.get("explain_service_search")?.handler;
    const result = await handler!({
      latitude: 40.71,
      longitude: -74.0,
      radiusMeters: 5000,
      limit: 20,
      category: "car_wash",
    });

    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc["error"]).toMatch(/Unknown category/);
  });

  it("defaults to aggregate categories when no category is provided", async () => {
    const server = new FakeMcpServer();
    registerLocalAutoServicesTools(server as unknown as Parameters<typeof registerLocalAutoServicesTools>[0]);

    const handler = server.tools.get("explain_service_search")?.handler;
    const result = await handler!({
      latitude: 40.71,
      longitude: -74.0,
      radiusMeters: 5000,
      limit: 20,
    });

    const sc = result.structuredContent as Record<string, unknown>;
    const categories = sc["categories"] as string[];
    expect(categories).toContain("repair");
    expect(categories).toContain("fuel");
    expect(categories).not.toContain("inspection");
  });
});
