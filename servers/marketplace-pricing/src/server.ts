import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProviders, type MarketplaceProvider } from "./provider.js";
import { registerPricingTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "Marketplace Pricing compares parts prices across marketplaces. This server is scaffolded: until a provider with API credentials (e.g. eBay) is wired in, tools return a clear 'not configured' error. Do not fabricate prices or listings.";

export function createPricingMcpServer(
  providers: MarketplaceProvider[] = getProviders()
): McpServer {
  const server = new McpServer(
    {
      name: "marketplace-pricing",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerPricingTools(server, providers);
  return server;
}
