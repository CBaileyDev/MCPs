import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTowingPayloadMathTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "towing-payload-math MCP provides deterministic towing and payload arithmetic: tongue-weight " +
  "calculation and classification, payload check (accounting for tongue weight against payload capacity), " +
  "GCWR headroom calculation, and a consolidated tow-setup check that runs all three checks at once. " +
  "IMPORTANT: This server does arithmetic only — it does NOT know any vehicle's ratings. " +
  "GVWR, GCWR, curb weight, payload capacity, and tongue-weight ratings come from the vehicle's " +
  "door-jamb label and the manufacturer's towing guide. Supply those numbers; this server does the math.";

export function createTowingPayloadMathMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "towing-payload-math",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerTowingPayloadMathTools(server);
  return server;
}
