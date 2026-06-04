# Architecture

This repo is a collection of independent automotive [MCP](https://modelcontextprotocol.io)
servers. There is **no workspace root** — each server under `servers/<name>/` is
fully self-contained and shippable on its own.

## Conventions (the "house style")

Every server follows the same shape so they read alike and can be built/tested
in isolation:

- **Package:** own `package.json` (scope `@cbaileydev/<name>-mcp`, `bin` =
  `<name>-mcp`), own `package-lock.json`, own standalone `tsconfig.json`, own
  `vitest.config.ts`.
- **Stack:** TypeScript (ESM, `NodeNext`), `@modelcontextprotocol/sdk`, `zod`
  (imported as `zod/v4`), `vitest`. Node 20+.
- **Source layout:**
  - `src/index.ts` — stdio bootstrap (`StdioServerTransport`).
  - `src/server.ts` — `create<Name>McpServer()` + `SERVER_INSTRUCTIONS`.
  - `src/tools/register.ts` — tool definitions via
    `server.registerTool(name, { title, description, inputSchema, annotations }, handler)`.
  - `src/domain/` — pure, testable logic (no I/O).
  - `src/providers/` — external API / local-file adapters (where applicable).
  - `src/safety/` — rate limits, caching, bounds/URL validation, guards.
  - `*.test.ts` co-located in `src/` (vitest matches `src/**/*.test.ts`).
- **Shared helpers, copied not packaged:** `src/result.ts` (the `ok()` tool-result
  helper) and `src/http.ts` (a `fetchJson`/`seg` helper) are byte-identical
  copies across servers rather than a shared dependency — this keeps every server
  independently installable. Keep them in sync when changed.

## Design principles

- **Free/public data or pure computation first.** Servers lean on free APIs
  (NHTSA vPIC, NHTSA recalls, FuelEconomy.gov, OpenStreetMap Overpass, NREL AFDC)
  or pure math (tire fitment, gearing, unit conversion, electrical, vehicle-
  context confidence). Proprietary data
  (OEM service schedules, part interchange, live marketplace pricing) is behind
  provider interfaces and clearly marked when unconfigured.
- **Never fabricate.** Tools return evidence, confidence, and explicit
  assumptions — not guarantees. Missing data is surfaced, not invented (e.g. no
  hardcoded fuel-price or charger-coordinate fallbacks; no "guaranteed fit").
- **Respect sources.** Attribution + retrieval context is preserved; outbound
  HTTP sends a descriptive User-Agent and respects rate limits.
- **No ToS-violating scraping** and **no destructive actions** (OBD is read-only;
  catalog tools are search-only).

## How the servers relate

They are separate processes and do not call each other; composition happens at
the MCP client/agent layer. The intended data flow:

1. **Identity** — `vpic` (VIN/make/model/year) and `vehicle-context-fitment`
   (one canonical profile with per-attribute confidence + what's missing).
2. **Domain servers** consume that identity: `repair-info` (recalls/complaints/
   ratings + maintenance), `fuel-economy-emissions`, `tire-wheel-fitment`,
   `drivetrain-gearing`, `obd-diagnostics` (scan-log evidence),
   `local-auto-services`, `ev-charging-range`. `automotive-unit-converter`
   (shop-manual unit conversions) and `automotive-electrical` (12V/24V DC wiring,
   fuse, and battery math) are stateless helpers that need no identity.
3. **Persistence** — `garage-memory` stores vehicles, searches, preferred
   brands, and project builds locally so results feel personalized.
4. **Parts** — `rockauto-catalog-search`, `part-interchange`,
   `marketplace-pricing` (the latter two need data providers/credentials).

## CI

`.github/workflows/ci.yml` fans out across every server in a matrix and runs
`npm ci → typecheck → build → test`. Tests are hermetic (network mocked), so CI
needs no secrets and stays deterministic.

Live **smoke tests** for the networked servers are opt-in and run separately via
[`.github/workflows/smoke.yml`](../.github/workflows/smoke.yml) (weekly + manual
dispatch). They hit the real APIs to catch upstream drift (a moved endpoint, a
changed response shape), assert only stable facts, skip on transient upstream
errors, and are kept out of the gating matrix. See
[SMOKE-TESTS.md](./SMOKE-TESTS.md).

See [USING-WITH-CLIENTS.md](./USING-WITH-CLIENTS.md) to wire the servers into a
client, and [`roadmaps/`](./roadmaps/) / [`superpowers/specs/`](./superpowers/specs/)
for design history.
