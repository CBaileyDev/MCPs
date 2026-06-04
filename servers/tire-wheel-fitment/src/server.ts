import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTireWheelFitmentTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "tire-wheel-fitment MCP provides pure deterministic tire and wheel math: size parsing, derived dimensions (sidewall, overall diameter, circumference, revs/mile), speedometer error, load/speed index decoding, and safe replacement-size suggestions. All calculations are geometry-only — this server never invents vehicle-specific data such as placard tire pressure. Diameter and clearance results are guidance; always verify physical fitment and clearance before installing tires or wheels on a vehicle.";

export function createTireWheelFitmentMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "tire-wheel-fitment",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerTireWheelFitmentTools(server);
  return server;
}
