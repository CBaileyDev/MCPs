import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRepairInfoTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "Repair Info provides official NHTSA recalls, complaints, and safety ratings for a make/model/year, plus a GENERIC maintenance schedule. The maintenance schedule is rule-of-thumb guidance, not OEM-specific; full service procedures and TSB text are proprietary and not provided. Always surface the maintenance disclaimer.";

export function createRepairInfoMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "repair-info",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerRepairInfoTools(server);
  return server;
}
