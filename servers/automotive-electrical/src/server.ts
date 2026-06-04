import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAutomotiveElectricalTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "automotive-electrical MCP provides deterministic 12V/24V DC automotive electrical math: " +
  "voltage drop, wire gauge selection, Ohm's law, fuse sizing, battery runtime estimation, and battery bank configuration. " +
  "All calculations are pure arithmetic with no network calls. " +
  "Results are engineering estimates. Fuse sizing, wire gauge, and battery guidance are rules-of-thumb to be verified " +
  "against actual component ratings and applicable wiring standards — not a safety guarantee.";

export function createAutomotiveElectricalMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "automotive-electrical",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerAutomotiveElectricalTools(server);
  return server;
}
