import { describe, expect, it } from "vitest";
import { registerFuelEconomyTools } from "./register.js";
import { createFuelEconomyMcpServer } from "../server.js";
import type { ToolResult } from "../result.js";

type RegisteredTool = {
  config: { title?: string; description?: string; annotations?: Record<string, unknown> };
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
  "search_efficiency_vehicle",
  "get_efficiency_vehicle",
  "get_vehicle_emissions",
  "get_current_fuel_prices",
  "compare_efficiency",
  "estimate_trip_energy_cost",
  "estimate_annual_fuel_cost"
];

describe("registerFuelEconomyTools", () => {
  it("registers exactly the 7 fuel economy tools", () => {
    const server = new FakeMcpServer();
    registerFuelEconomyTools(server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer);
    expect([...server.tools.keys()]).toEqual(EXPECTED_TOOLS);
  });

  it("HTTP tools are read-only and open-world", () => {
    const server = new FakeMcpServer();
    registerFuelEconomyTools(server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer);

    const httpTools = [
      "search_efficiency_vehicle",
      "get_efficiency_vehicle",
      "get_vehicle_emissions",
      "get_current_fuel_prices",
      "compare_efficiency"
    ];

    for (const name of httpTools) {
      const tool = server.tools.get(name);
      expect(tool?.config.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    }
  });

  it("cost tools are read-only and open-world (they may fetch current fuel prices)", () => {
    const server = new FakeMcpServer();
    registerFuelEconomyTools(server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer);

    const costTools = [
      "estimate_trip_energy_cost",
      "estimate_annual_fuel_cost"
    ];

    for (const name of costTools) {
      const tool = server.tools.get(name);
      expect(tool?.config.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    }
  });

  it("all tools have title and description", () => {
    const server = new FakeMcpServer();
    registerFuelEconomyTools(server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer);

    for (const [name, tool] of server.tools) {
      expect(tool.config.title, `${name} missing title`).toBeTruthy();
      expect(tool.config.description, `${name} missing description`).toBeTruthy();
    }
  });
});

describe("createFuelEconomyMcpServer", () => {
  it("constructs an McpServer with all seven tools registered", () => {
    const server = createFuelEconomyMcpServer();
    expect(server).toBeDefined();
  });
});
