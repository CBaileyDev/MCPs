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
| [Part Interchange](./servers/part-interchange) | ✅ Working | OEM ↔ aftermarket cross-reference via a local personal interchange store (record/list/remove your own cross-refs). Licensed-provider lookup is a future adapter. |
| [Marketplace Pricing](./servers/marketplace-pricing) | 🔲 Scaffold | Parts price comparison. Needs marketplace API credentials (e.g. eBay). |
| [Vehicle Context & Fitment](./servers/vehicle-context-fitment) | ✅ Working | Canonical vehicle profile with per-attribute confidence and missing/conflicting fitment attributes (local). |
| [OBD Diagnostics](./servers/obd-diagnostics) | ✅ Working | Scan-log parsing + mocked OBD-II adapter: DTCs, readiness, freeze frames, PIDs (read-only, no native deps). |
| [Fuel Economy & Emissions](./servers/fuel-economy-emissions) | ✅ Working | MPG/MPGe, emissions, and trip/annual cost (FuelEconomy.gov, no key). |
| [Local Auto Services](./servers/local-auto-services) | ✅ Working | Nearby repair/tire/parts/fuel/inspection/towing via OpenStreetMap Overpass (no key). |
| [EV Charging & Range](./servers/ev-charging-range) | ✅ Working | EV charger lookup (NREL AFDC + Open Charge Map) + conservative range planning. AFDC works with `DEMO_KEY`. |
| [Tire & Wheel Fitment](./servers/tire-wheel-fitment) | ✅ Working | Pure tire/wheel math: size parsing, dimensions, speedometer error, load/speed-index decode, safe replacement sizing (no keys). |
| [Drivetrain Gearing](./servers/drivetrain-gearing) | ✅ Working | Pure gearing math: speed↔RPM from gear/final-drive/tire, gear-speed table, tire-size gearing effect, recommended final drive (no keys). |
| [Automotive Unit Converter](./servers/automotive-unit-converter) | ✅ Working | Pure conversions for the units shop manuals use: fuel economy (incl. the L/100km reciprocal), power (hp/kW/PS), torque, pressure, volume (US vs Imperial), and mm↔fractional-inch socket sizing (no keys). |
| [Automotive Electrical](./servers/automotive-electrical) | ✅ Working | Pure 12V/24V DC math: wire-gauge voltage drop + recommended gauge (AWG table), Ohm's law solver, fuse sizing, battery runtime, and series/parallel battery banks (no keys). |
| [Engine Build Math](./servers/engine-build-math) | ✅ Working | Pure engine-builder math: displacement, compression ratio (the inch+cc unit-mix), bore/stroke ratio, mean piston speed, and airflow/CFM (no keys). |

`marketplace-pricing` is a scaffold: it exposes its full tool surface but
returns a clear "provider not configured" error until marketplace API
credentials (e.g. eBay) are set. No ToS-violating scraping is included.

## Repository Layout

```text
servers/
  rockauto-catalog-search/
  vpic/
  garage-memory/
  repair-info/
  part-interchange/
  marketplace-pricing/
  vehicle-context-fitment/
  obd-diagnostics/
  fuel-economy-emissions/
  local-auto-services/
  ev-charging-range/
  tire-wheel-fitment/
  drivetrain-gearing/
  automotive-unit-converter/
  automotive-electrical/
  engine-build-math/
docs/
  roadmaps/
  superpowers/
    specs/
    plans/
```

Each MCP server lives in its own folder under `servers/` with its own
README, package metadata, tests, and client configuration examples. Servers are
self-contained (own `package.json`, lockfile, and `tsconfig.json`); there is no
workspace root.

## Documentation

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — conventions, design principles, and how the servers relate.
- [docs/USING-WITH-CLIENTS.md](./docs/USING-WITH-CLIENTS.md) — build the servers and wire them into an MCP client (combined config).
- [docs/SMOKE-TESTS.md](./docs/SMOKE-TESTS.md) — opt-in live smoke tests that hit the real APIs to catch upstream drift.
- CI: every server is built and tested on each push via [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) (hermetic, no secrets). A separate, non-gating [`smoke.yml`](./.github/workflows/smoke.yml) runs the live smoke tests weekly and on demand.
