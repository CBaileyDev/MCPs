import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEngineBuildMathTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "engine-build-math MCP provides deterministic engine-builder math: displacement, compression ratio, " +
  "bore/stroke ratio, mean piston speed, and airflow (CFM). " +
  "All results are theoretical and use exact arithmetic with standardised constants. " +
  "They do NOT account for real-world factors such as dynamic compression ratio, port flow efficiency, " +
  "cam timing, or combustion chamber shape variations.";

export function createEngineBuildMathMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "engine-build-math",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerEngineBuildMathTools(server);
  return server;
}
