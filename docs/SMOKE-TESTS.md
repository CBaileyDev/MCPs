# Live smoke tests

The unit tests in this repo are **hermetic** — every network call is mocked, so
the gating CI matrix needs no secrets and is deterministic. That hermeticity has
a blind spot: it cannot tell you when an upstream API *moves* or *changes shape*.
This actually happened once, when NREL migrated its AFDC API to a new domain.

The smoke suite closes that gap. It exercises the **networked** servers against
their real public APIs and asserts a few **stable** facts, so a failure means the
upstream very likely drifted — not that a vehicle gained a recall overnight.

| Server | Real API hit | What it asserts (stable) |
| --- | --- | --- |
| `vpic` | NHTSA vPIC | VIN `1HGCM82633A004352` → Honda Accord 2003; make list > 100; a known make/model/year validates |
| `repair-info` | NHTSA recalls + vPIC | Same VIN decodes to the 2003 Accord; recall count ≥ 20 (a floor, not the exact 24); recalls carry a campaign number |
| `fuel-economy-emissions` | FuelEconomy.gov | 2012 Honda → Accord → a vehicle record with a positive combined MPG; fuel-price fields are numeric-or-null (never the volatile dollar amounts) |
| `local-auto-services` | OpenStreetMap Overpass | Downtown Pittsburgh returns coordinate-bearing repair-shop results |
| `ev-charging-range` | NREL AFDC (`DEMO_KEY`) | San Francisco returns real stations with valid, non-`(0,0)` coordinates |

## Running them

```bash
# every networked server, with a pass/fail summary:
bash scripts/smoke.sh

# or one server on its own:
cd servers/vpic && npm run smoke
```

Each server also exposes the suite as an opt-in npm script (`npm run smoke`),
which sets `SMOKE=1`. Without that flag the smoke file is **skipped**, which is
why `npm test` and the CI matrix never touch the network.

## Design rules (why it doesn't cry wolf)

- **Stable anchors only.** Old vehicles, response shapes, presence/floors — never
  live fuel prices, live charger availability, or exact result counts.
- **Transient = skip, not fail.** Any `429/5xx/timeout` (an overloaded Overpass,
  a `DEMO_KEY` rate-limit) skips the test. Only a `4xx`, a malformed response, or
  missing-where-data-should-exist fails — those are real drift.
- **Non-gating.** Smoke runs via [`.github/workflows/smoke.yml`](../.github/workflows/smoke.yml)
  on a weekly schedule and on manual dispatch — separate from the hermetic
  [`ci.yml`](../.github/workflows/ci.yml) so a flaky upstream can never turn the
  push/PR pipeline red.

## When a smoke run goes red

Treat it as an upstream-drift alert. Reproduce locally with `npm run smoke` in
the affected server, inspect the real response, and adjust the provider/parser
(as was done for the NREL domain migration) — not the assertion, unless the
assertion itself was wrong.
