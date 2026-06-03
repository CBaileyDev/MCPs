# Marketplace Pricing MCP (scaffold)

Compares parts prices across marketplaces (eBay Motors, Amazon, etc.). The tool
surface and aggregation logic are implemented, but **no provider is wired in by
default** — each marketplace needs its own API credentials and has its own Terms
of Service.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_listings` | Search configured marketplaces for matching parts. |
| `compare_prices` | Aggregate listings into lowest + median price. |

Until a provider is configured, both tools return a clear "not configured" error.

## Wiring eBay

1. Create an eBay developer app at <https://developer.ebay.com/>.
2. Set `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`.
3. Register `new EbayProvider()` from `getProviders()` in `src/provider.ts`
   (adapter sketch in `src/ebay.ts`).

Amazon (Product Advertising API) and local-store providers are intentionally not
implemented due to credential and ToS constraints. No scraping is included.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```
