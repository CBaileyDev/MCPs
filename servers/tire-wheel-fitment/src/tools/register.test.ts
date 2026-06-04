import { describe, expect, it } from "vitest";
import { registerTireWheelFitmentTools } from "./register.js";
import type { ToolResult } from "../result.js";

type RegisteredTool = {
  config: { title?: string; description?: string; annotations?: Record<string, unknown> };
  handler: (input: Record<string, unknown>) => ToolResult;
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
  "parse_tire_size",
  "calculate_tire_dimensions",
  "compare_tire_sizes",
  "speedometer_error",
  "decode_service_description",
  "suggest_replacement_sizes"
];

describe("registerTireWheelFitmentTools", () => {
  it("registers exactly the six tire/wheel tools", () => {
    const server = new FakeMcpServer();
    registerTireWheelFitmentTools(server as never);
    expect([...server.tools.keys()]).toEqual(EXPECTED_TOOLS);
  });

  it("every tool is readOnlyHint:true and openWorldHint:false", () => {
    const server = new FakeMcpServer();
    registerTireWheelFitmentTools(server as never);
    for (const [, tool] of server.tools) {
      expect(tool.config.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    }
  });
});
