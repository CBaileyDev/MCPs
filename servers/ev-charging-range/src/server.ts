import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEvChargingTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "EV Charging Range MCP provides conservative EV range-margin estimates and charging station lookup (NREL AFDC + Open Charge Map). " +
  "All range estimates include explicit assumptions and caveats — they are conservative approximations, not guarantees. " +
  "Station availability is source-reported and may be stale; always verify before relying on it. " +
  "The plan_ev_route tool is a feasibility estimate only, NOT real road routing — it cannot perform turn-by-turn navigation or calculate actual road distances. " +
  "Do NOT perform any payment, reservation, or account actions.";

export function createEvChargingMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "ev-charging-range",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerEvChargingTools(server);
  return server;
}
