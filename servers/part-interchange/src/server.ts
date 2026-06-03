import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider, type InterchangeProvider } from "./provider.js";
import { registerInterchangeTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "Part Interchange cross-references OEM and aftermarket part numbers. This server is scaffolded: until a licensed data provider is wired in, tools return a clear 'not configured' error. Do not fabricate interchange data.";

export function createInterchangeMcpServer(
  provider: InterchangeProvider = getProvider()
): McpServer {
  const server = new McpServer(
    {
      name: "part-interchange",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerInterchangeTools(server, provider);
  return server;
}
