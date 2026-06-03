import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  getProviders,
  ProviderNotConfiguredError,
  summarize,
  type Listing,
  type MarketplaceProvider
} from "../provider.js";
import { ok } from "../result.js";

async function searchAll(
  providers: MarketplaceProvider[],
  query: string,
  limit: number
): Promise<Listing[]> {
  const results = await Promise.allSettled(providers.map(p => p.searchListings(query, limit)));
  const listings: Listing[] = [];
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") listings.push(...r.value);
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
  }
  // If nothing came back and every provider errored, surface the (likely
  // "not configured") error rather than an empty result.
  if (listings.length === 0 && errors.length > 0) {
    throw new ProviderNotConfiguredError(errors.join(" | "));
  }
  return listings;
}

export function registerPricingTools(
  server: McpServer,
  providers: MarketplaceProvider[] = getProviders()
): void {
  server.registerTool(
    "search_listings",
    {
      title: "Search Listings",
      description:
        "Search configured marketplaces for parts matching a query. Requires a configured provider (e.g. eBay).",
      inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ query, limit }) => ok(await searchAll(providers, query, limit ?? 20))
  );

  server.registerTool(
    "compare_prices",
    {
      title: "Compare Prices",
      description:
        "Search configured marketplaces and return lowest + median price plus all listings. Requires a configured provider (e.g. eBay).",
      inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ query, limit }) => ok(summarize(query, await searchAll(providers, query, limit ?? 20)))
  );
}
