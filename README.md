# MCPs

A local-first collection of Model Context Protocol servers for connecting Claude,
Codex, and other MCP clients to useful tools and public data sources.

## Servers

| Server | Status | Purpose |
| --- | --- | --- |
| [RockAuto Catalog Search](./servers/rockauto-catalog-search) | v1 scaffold | User-requested RockAuto catalog and part search tools. |
| [vPIC](./servers/vpic) | ✅ Working | VIN decoding and make/model/year validation (NHTSA vPIC, no key). |
| [Garage Memory](./servers/garage-memory) | ✅ Working | Saved vehicles, past searches, preferred brands, project builds (local store). |
| [Repair Info](./servers/repair-info) | ✅ Working | Recalls, complaints, safety ratings (NHTSA) + generic maintenance schedule. |
| [Part Interchange](./servers/part-interchange) | 🔲 Scaffold | OEM ↔ aftermarket cross-reference. Needs a licensed data provider. |
| [Marketplace Pricing](./servers/marketplace-pricing) | 🔲 Scaffold | Parts price comparison. Needs marketplace API credentials (e.g. eBay). |

The two scaffolds expose their full tool surface but return a clear
"provider not configured" error until a data source is wired in. No
ToS-violating scraping is included.

## Repository Layout

```text
servers/
  rockauto-catalog-search/
  vpic/
  garage-memory/
  repair-info/
  part-interchange/
  marketplace-pricing/
docs/
  superpowers/
    specs/
    plans/
```

Each MCP server lives in its own folder under `servers/` with its own
README, package metadata, tests, and client configuration examples. Servers are
self-contained (own `package.json`, lockfile, and `tsconfig.json`); there is no
workspace root.
