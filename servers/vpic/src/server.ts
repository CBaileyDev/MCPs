import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerVpicTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "vPIC MCP decodes VINs and validates make/model/year against NHTSA's free public vPIC API. Read-only. Prefer decode_vin for full VIN strings and validate_make_model_year to confirm a year/make/model combination and its canonical spelling.";

export function createVpicMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "vpic",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerVpicTools(server);
  return server;
}
