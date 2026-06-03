# Part Interchange MCP (scaffold)

Cross-references OEM and aftermarket part numbers. The tool surface is
implemented, but **no data provider is wired in** — there is no free/official
interchange API, so real data requires a licensed catalog/feed.

## Tools

| Tool | Purpose |
| --- | --- |
| `cross_reference_part` | Cross-reference a part number to OEM + aftermarket equivalents. |
| `find_aftermarket_equivalents` | Find aftermarket equivalents for an OEM number. |

Until configured, both tools return a clear "provider not configured" error.

## Wiring a provider

Implement `InterchangeProvider` in `src/provider.ts` (e.g. backed by an
ACES/PIES feed or a licensed dataset) and return it from `getProvider()`.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```
