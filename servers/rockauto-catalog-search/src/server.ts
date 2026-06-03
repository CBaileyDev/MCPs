import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RockAutoHttpProvider } from "./catalog/http-provider.js";
import type { RockAutoCatalogProvider } from "./catalog/provider.js";
import { registerRockAutoTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "RockAuto Catalog Search is read-only and catalog/search only. Use targeted user-requested lookups. Do not log in, automate carts, checkout, CAPTCHA, account pages, order status, or bulk crawling. Always report source URLs and fetchedAt timestamps from live results.";

export function createRockAutoMcpServer(provider: RockAutoCatalogProvider = new RockAutoHttpProvider()): McpServer {
  const server = new McpServer(
    {
      name: "rockauto-catalog-search",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerRockAutoTools(server, provider);
  return server;
}
