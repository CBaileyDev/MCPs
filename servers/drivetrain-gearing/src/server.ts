import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDrivetrainGearingTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "drivetrain-gearing MCP provides pure deterministic gearing math: RPM ↔ speed conversions, gear speed tables, tire gearing effects, and final drive recommendations. " +
  "Results are theoretical — they ignore drivetrain loss, tire growth at speed, and slip. Verify before relying on calculations for safety-critical purposes.";

export function createDrivetrainGearingMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "drivetrain-gearing",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerDrivetrainGearingTools(server);
  return server;
}
