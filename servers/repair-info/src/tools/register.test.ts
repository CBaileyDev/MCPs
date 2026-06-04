import { describe, expect, it } from "vitest";
import { registerRepairInfoTools } from "./register.js";
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
  "get_recalls",
  "get_complaints",
  "get_safety_ratings",
  "get_maintenance_schedule",
  "get_recalls_by_vin"
];

describe("registerRepairInfoTools", () => {
  it("registers exactly 5 tools", () => {
    const server = new FakeMcpServer();
    registerRepairInfoTools(server as never);
    expect(server.tools.size).toBe(5);
  });

  it("registers all expected tool names", () => {
    const server = new FakeMcpServer();
    registerRepairInfoTools(server as never);
    const names = [...server.tools.keys()];
    for (const expected of EXPECTED_TOOLS) {
      expect(names).toContain(expected);
    }
  });

  it("every tool has a non-empty title and description", () => {
    const server = new FakeMcpServer();
    registerRepairInfoTools(server as never);
    for (const [name, tool] of server.tools) {
      expect(tool.config.title, `${name} should have a title`).toBeTruthy();
      expect(tool.config.description, `${name} should have a description`).toBeTruthy();
    }
  });

  it("NHTSA tools are readOnly and openWorld", () => {
    const server = new FakeMcpServer();
    registerRepairInfoTools(server as never);
    const openWorldTools = ["get_recalls", "get_complaints", "get_safety_ratings", "get_recalls_by_vin"];
    for (const name of openWorldTools) {
      const tool = server.tools.get(name);
      expect(tool, `${name} should be registered`).toBeDefined();
      expect(tool!.config.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    }
  });

  it("get_maintenance_schedule is readOnly and NOT openWorld", () => {
    const server = new FakeMcpServer();
    registerRepairInfoTools(server as never);
    const tool = server.tools.get("get_maintenance_schedule");
    expect(tool).toBeDefined();
    expect(tool!.config.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
  });

  it("get_recalls_by_vin description mentions VIN decoding via NHTSA", () => {
    const server = new FakeMcpServer();
    registerRepairInfoTools(server as never);
    const tool = server.tools.get("get_recalls_by_vin");
    expect(tool).toBeDefined();
    expect(tool!.config.description).toMatch(/VIN/i);
    expect(tool!.config.description).toMatch(/vPIC|NHTSA/i);
  });
});
