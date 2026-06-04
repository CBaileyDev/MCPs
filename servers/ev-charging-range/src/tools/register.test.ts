import { describe, expect, it } from "vitest";
import { registerEvChargingTools } from "./register.js";
import { createEvChargingMcpServer } from "../server.js";
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
  "find_chargers",
  "get_charger_details",
  "compare_chargers",
  "estimate_range_margin",
  "plan_ev_route",
  "explain_charging_plan"
];

describe("registerEvChargingTools", () => {
  it("registers exactly the six EV charging tools in order", () => {
    const server = new FakeMcpServer();
    registerEvChargingTools(server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer);
    expect([...server.tools.keys()]).toEqual(EXPECTED_TOOLS);
  });

  it("estimate_range_margin and explain_charging_plan are readOnly and NOT open-world", () => {
    const server = new FakeMcpServer();
    registerEvChargingTools(server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer);
    for (const name of ["estimate_range_margin", "explain_charging_plan"]) {
      const tool = server.tools.get(name);
      expect(tool?.config.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    }
  });

  it("find_chargers, get_charger_details, compare_chargers, plan_ev_route are readOnly and open-world", () => {
    const server = new FakeMcpServer();
    registerEvChargingTools(server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer);
    for (const name of ["find_chargers", "get_charger_details", "compare_chargers", "plan_ev_route"]) {
      const tool = server.tools.get(name);
      expect(tool?.config.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    }
  });

  it("all tools have a title and description", () => {
    const server = new FakeMcpServer();
    registerEvChargingTools(server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer);
    for (const [name, tool] of server.tools) {
      expect(tool.config.title, `${name} should have a title`).toBeTruthy();
      expect(tool.config.description, `${name} should have a description`).toBeTruthy();
    }
  });
});

describe("createEvChargingMcpServer", () => {
  it("constructs an McpServer without throwing", () => {
    const server = createEvChargingMcpServer();
    expect(server).toBeDefined();
  });
});
