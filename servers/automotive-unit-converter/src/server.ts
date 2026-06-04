import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAutomotiveUnitConverterTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "automotive-unit-converter MCP provides deterministic automotive unit conversions: fuel economy, power, torque, pressure, volume, and socket-size lookup. " +
  "Results are exact arithmetic using standardised constants; socket-size interchangeability verdicts are a practical heuristic based on dimensional gap, not a guarantee of fit.";

export function createAutomotiveUnitConverterMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "automotive-unit-converter",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerAutomotiveUnitConverterTools(server);
  return server;
}
