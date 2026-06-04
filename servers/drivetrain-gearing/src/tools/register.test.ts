import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDrivetrainGearingTools } from "./register.js";

describe("registerDrivetrainGearingTools", () => {
  it("registers exactly 5 tools", () => {
    const names: string[] = [];
    const stubServer = {
      registerTool: (name: string) => names.push(name)
    } as unknown as McpServer;

    registerDrivetrainGearingTools(stubServer);

    expect(names).toHaveLength(5);
    expect(names).toContain("speed_from_rpm");
    expect(names).toContain("rpm_from_speed");
    expect(names).toContain("gear_speed_table");
    expect(names).toContain("tire_gearing_effect");
    expect(names).toContain("recommend_final_drive");
  });
});
