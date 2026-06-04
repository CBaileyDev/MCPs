# Top Five Automotive MCPs Implementation Plan

> **STATUS: ✅ COMPLETE (2026-06-03).** All five servers implemented under `servers/`,
> each self-contained in the repo house style (zod v4, `registerTool` idiom,
> co-located `src/**/*.test.ts`). Aggregate: **38 tools, 228 tests**, all
> typecheck/build/test green and verified over the live MCP stdio handshake.
> Deviations from the original plan: tests are co-located in `src/` (matching the
> existing servers) rather than a separate `test/` dir; OBD live serial is a
> mocked pure-TS boundary (no `serialport`/native dep) with log-parsing as the
> v1 focus; FuelEconomy.gov is read as JSON via the `Accept` header; `plan_ev_route`
> is an honest feasibility estimate over provided distances, not road routing.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next five automotive MCP servers: vehicle context/fitment, OBD diagnostics, fuel economy/emissions, local auto services, and EV charging/range.

**Architecture:** Implement five independent TypeScript stdio MCP servers under `servers/`, each with pure domain logic, provider adapters, safety helpers, Vitest coverage, and README/client examples. Build in order so later servers can consume vehicle context, fuel economy data, and geospatial patterns from earlier work.

**Tech Stack:** Node 20+, TypeScript, `@modelcontextprotocol/sdk`, Zod, Vitest, public APIs, local files/adapters, and environment-variable API keys.

---

## Scope And Ownership

This plan is a build queue, not one monolithic feature. Each server should be
implemented and committed independently. Do not edit `packages/` unless the user
explicitly approves it in a later turn.

Future server folders:

- `servers/vehicle-context-fitment/`
- `servers/obd-diagnostics/`
- `servers/fuel-economy-emissions/`
- `servers/local-auto-services/`
- `servers/ev-charging-range/`

Existing integration targets:

- `servers/rockauto-catalog-search/`
- `servers/vpic/`
- `servers/garage-memory/`
- `servers/repair-info/`
- `servers/part-interchange/`
- `servers/marketplace-pricing/`

## Task 1: vehicle-context-fitment MCP

**Files:**

- Create: `servers/vehicle-context-fitment/package.json`
- Create: `servers/vehicle-context-fitment/tsconfig.json`
- Create: `servers/vehicle-context-fitment/vitest.config.ts`
- Create: `servers/vehicle-context-fitment/README.md`
- Create: `servers/vehicle-context-fitment/src/index.ts`
- Create: `servers/vehicle-context-fitment/src/domain/types.ts`
- Create: `servers/vehicle-context-fitment/src/domain/normalize.ts`
- Create: `servers/vehicle-context-fitment/src/domain/confidence.ts`
- Create: `servers/vehicle-context-fitment/src/tools/register.ts`
- Create: `servers/vehicle-context-fitment/test/normalize.test.ts`
- Create: `servers/vehicle-context-fitment/test/confidence.test.ts`
- Create: `servers/vehicle-context-fitment/test/tools.test.ts`

- [ ] **Step 1: Write failing normalization tests**

Create tests that prove a partial profile produces explicit unknowns:

```ts
import { describe, expect, it } from "vitest";
import { normalizeVehicleContext } from "../src/domain/normalize.js";

describe("normalizeVehicleContext", () => {
  it("keeps unknown fitment-critical fields explicit", () => {
    const result = normalizeVehicleContext({
      year: 2020,
      make: "Toyota",
      model: "Camry",
      engine: "2.5L L4",
    });

    expect(result.vehicle.year).toBe(2020);
    expect(result.vehicle.make).toBe("Toyota");
    expect(result.vehicle.model).toBe("Camry");
    expect(result.vehicle.engine).toBe("2.5L L4");
    expect(result.vehicle.drivetrain.status).toBe("unknown");
    expect(result.missingAttributes).toContain("drivetrain");
  });
});
```

Run:

```bash
cd servers/vehicle-context-fitment
npm test -- normalize.test.ts
```

Expected: fail because the server does not exist yet.

- [ ] **Step 2: Implement the minimal domain model**

Create `src/domain/types.ts` with `VehicleContext`, `VehicleAttribute`, and
`MissingAttribute` types. Create `src/domain/normalize.ts` with
`normalizeVehicleContext(input)`. Keep it pure and provider-free.

- [ ] **Step 3: Verify domain tests pass**

Run:

```bash
cd servers/vehicle-context-fitment
npm test -- normalize.test.ts
```

Expected: pass.

- [ ] **Step 4: Add confidence and conflict tests**

Test conflicting evidence, such as two different engines from two sources, and
assert that both records remain visible with a conflict warning.

- [ ] **Step 5: Implement tool registration**

Register:

- `resolve_vehicle_context`
- `merge_vehicle_evidence`
- `list_missing_fitment_attributes`
- `explain_vehicle_confidence`
- `check_basic_fitment_context`
- `record_fitment_correction`

Keep v1 local and provider-free. Tool outputs must include confidence and
source/evidence fields.

- [ ] **Step 6: Verify**

Run:

```bash
cd servers/vehicle-context-fitment
npm test
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add servers/vehicle-context-fitment
git commit -m "feat: add vehicle context fitment MCP"
```

## Task 2: obd-diagnostics MCP

**Files:**

- Create: `servers/obd-diagnostics/package.json`
- Create: `servers/obd-diagnostics/tsconfig.json`
- Create: `servers/obd-diagnostics/vitest.config.ts`
- Create: `servers/obd-diagnostics/README.md`
- Create: `servers/obd-diagnostics/src/index.ts`
- Create: `servers/obd-diagnostics/src/domain/dtc.ts`
- Create: `servers/obd-diagnostics/src/domain/readiness.ts`
- Create: `servers/obd-diagnostics/src/domain/logs.ts`
- Create: `servers/obd-diagnostics/src/providers/serial.ts`
- Create: `servers/obd-diagnostics/src/providers/log-file.ts`
- Create: `servers/obd-diagnostics/src/safety/actions.ts`
- Create: `servers/obd-diagnostics/src/tools/register.ts`
- Create: `servers/obd-diagnostics/test/dtc.test.ts`
- Create: `servers/obd-diagnostics/test/logs.test.ts`
- Create: `servers/obd-diagnostics/test/safety.test.ts`
- Create: `servers/obd-diagnostics/test/tools.test.ts`

- [ ] **Step 1: Write failing scan-log parser tests**

Use a small CSV fixture with timestamp, PID label, value, and unit. Assert that
the parser normalizes rows and rejects unknown units without crashing.

- [ ] **Step 2: Implement the local log provider first**

Build `ingest_scan_log` and `normalize_scan_log` before live adapter support.
This gives useful v1 behavior without hardware.

- [ ] **Step 3: Add DTC and readiness domain tests**

Assert that DTC records preserve code, source, status, module, and unknown
description fields. Assert readiness summaries are evidence-only and do not
claim a vehicle will pass inspection.

- [ ] **Step 4: Implement serial provider as an adapter boundary**

Create a serial interface that can be mocked in tests. Keep ELM327 commands
read-only in v1. Do not implement `clear_dtcs`.

- [ ] **Step 5: Register tools**

Register:

- `obd_list_adapters`
- `obd_connect`
- `obd_get_status`
- `obd_read_dtcs`
- `obd_read_readiness`
- `obd_read_freeze_frame`
- `obd_read_live_pids`
- `ingest_scan_log`
- `normalize_scan_log`
- `summarize_diagnostic_evidence`
- `suggest_next_diagnostic_steps`

- [ ] **Step 6: Verify**

Run:

```bash
cd servers/obd-diagnostics
npm test
npm run typecheck
npm run build
```

Expected: all pass. Live adapter smoke tests must be opt-in and skipped by
default.

- [ ] **Step 7: Commit**

```bash
git add servers/obd-diagnostics
git commit -m "feat: add OBD diagnostics MCP"
```

## Task 3: fuel-economy-emissions MCP

**Files:**

- Create: `servers/fuel-economy-emissions/package.json`
- Create: `servers/fuel-economy-emissions/tsconfig.json`
- Create: `servers/fuel-economy-emissions/vitest.config.ts`
- Create: `servers/fuel-economy-emissions/README.md`
- Create: `servers/fuel-economy-emissions/src/index.ts`
- Create: `servers/fuel-economy-emissions/src/domain/efficiency.ts`
- Create: `servers/fuel-economy-emissions/src/domain/cost.ts`
- Create: `servers/fuel-economy-emissions/src/providers/fueleconomy.ts`
- Create: `servers/fuel-economy-emissions/src/safety/http.ts`
- Create: `servers/fuel-economy-emissions/src/tools/register.ts`
- Create: `servers/fuel-economy-emissions/test/efficiency.test.ts`
- Create: `servers/fuel-economy-emissions/test/cost.test.ts`
- Create: `servers/fuel-economy-emissions/test/provider.test.ts`
- Create: `servers/fuel-economy-emissions/test/tools.test.ts`

- [ ] **Step 1: Write failing cost-estimate tests**

Test annual and trip cost calculations with explicit fuel price, miles, and MPG
or kWh/100mi inputs. Assert assumptions are returned with the result.

- [ ] **Step 2: Implement pure cost domain**

Implement `estimateAnnualFuelCost` and `estimateTripEnergyCost` with no HTTP
dependency.

- [ ] **Step 3: Add FuelEconomy.gov provider fixture tests**

Use fixture responses for:

- `/ws/rest/vehicle/menu/year`
- `/ws/rest/vehicle/menu/make`
- `/ws/rest/vehicle/menu/model`
- `/ws/rest/vehicle/menu/options`
- `/ws/rest/vehicle/{id}`
- `/ws/rest/vehicle/emissions/{id}`
- `/ws/rest/fuelprices`

- [ ] **Step 4: Implement provider**

Use JSON endpoints, timeout protection, TTL cache, and source URL attribution.
Primary documentation: `https://www.fueleconomy.gov/feg/ws/index.shtml`.

- [ ] **Step 5: Register tools**

Register:

- `search_efficiency_vehicle`
- `get_efficiency_vehicle`
- `get_vehicle_emissions`
- `get_current_fuel_prices`
- `compare_efficiency`
- `estimate_trip_energy_cost`
- `estimate_annual_fuel_cost`

- [ ] **Step 6: Verify**

Run:

```bash
cd servers/fuel-economy-emissions
npm test
npm run typecheck
npm run build
```

Expected: all pass. One live smoke test may be added behind an environment flag.

- [ ] **Step 7: Commit**

```bash
git add servers/fuel-economy-emissions
git commit -m "feat: add fuel economy emissions MCP"
```

## Task 4: local-auto-services MCP

**Files:**

- Create: `servers/local-auto-services/package.json`
- Create: `servers/local-auto-services/tsconfig.json`
- Create: `servers/local-auto-services/vitest.config.ts`
- Create: `servers/local-auto-services/README.md`
- Create: `servers/local-auto-services/src/index.ts`
- Create: `servers/local-auto-services/src/domain/categories.ts`
- Create: `servers/local-auto-services/src/domain/normalize.ts`
- Create: `servers/local-auto-services/src/providers/overpass.ts`
- Create: `servers/local-auto-services/src/safety/geo.ts`
- Create: `servers/local-auto-services/src/tools/register.ts`
- Create: `servers/local-auto-services/test/categories.test.ts`
- Create: `servers/local-auto-services/test/normalize.test.ts`
- Create: `servers/local-auto-services/test/geo.test.ts`
- Create: `servers/local-auto-services/test/tools.test.ts`

- [ ] **Step 1: Write failing category mapping tests**

Assert category mappings generate bounded Overpass queries for repair shops,
parts stores, tire shops, fuel stations, inspection sites, and towing services.

- [ ] **Step 2: Implement query builder**

Build Overpass QL from category, latitude, longitude, radius, and limit. Reject
queries without a bounded radius or bounding box.

- [ ] **Step 3: Add provider fixture tests**

Normalize OSM nodes, ways, and relations into `ServiceResult` with attribution,
coordinates, tags, and confidence.

- [ ] **Step 4: Implement Overpass provider**

Use timeouts, small default radius, TTL cache, and a configurable endpoint.
Primary documentation: `https://dev.overpass-api.de/overpass-doc/en/`.

- [ ] **Step 5: Register tools**

Register:

- `find_auto_services`
- `find_repair_shops`
- `find_parts_stores`
- `find_tire_shops`
- `find_fuel_stations`
- `find_vehicle_inspection_sites`
- `find_towing_services`
- `explain_service_search`

- [ ] **Step 6: Verify**

Run:

```bash
cd servers/local-auto-services
npm test
npm run typecheck
npm run build
```

Expected: all pass. Live Overpass smoke tests must be opt-in.

- [ ] **Step 7: Commit**

```bash
git add servers/local-auto-services
git commit -m "feat: add local auto services MCP"
```

## Task 5: ev-charging-range MCP

**Files:**

- Create: `servers/ev-charging-range/package.json`
- Create: `servers/ev-charging-range/tsconfig.json`
- Create: `servers/ev-charging-range/vitest.config.ts`
- Create: `servers/ev-charging-range/README.md`
- Create: `servers/ev-charging-range/src/index.ts`
- Create: `servers/ev-charging-range/src/domain/chargers.ts`
- Create: `servers/ev-charging-range/src/domain/range.ts`
- Create: `servers/ev-charging-range/src/providers/afdc.ts`
- Create: `servers/ev-charging-range/src/providers/open-charge-map.ts`
- Create: `servers/ev-charging-range/src/safety/api-keys.ts`
- Create: `servers/ev-charging-range/src/tools/register.ts`
- Create: `servers/ev-charging-range/test/chargers.test.ts`
- Create: `servers/ev-charging-range/test/range.test.ts`
- Create: `servers/ev-charging-range/test/providers.test.ts`
- Create: `servers/ev-charging-range/test/tools.test.ts`

- [ ] **Step 1: Write failing range-margin tests**

Assert the range estimator returns arrival margin, reserve status, and every
assumption used. Test weather/speed/load adjustments as explicit optional
inputs, not hidden model behavior.

- [ ] **Step 2: Implement pure range domain**

Implement range and charging-stop calculations independent of station APIs.

- [ ] **Step 3: Add station provider fixture tests**

Use AFDC/NLR and Open Charge Map fixture responses. Normalize connector,
network, coordinates, access, power, status, and source fields.

- [ ] **Step 4: Implement providers**

Use environment variables for API keys:

- `AFDC_API_KEY`
- `OPEN_CHARGE_MAP_API_KEY`

Primary documentation:

- `https://developer.nlr.gov/docs/transportation/alt-fuel-stations-v1/`
- `https://www.openchargemap.org/develop/api`

- [ ] **Step 5: Register tools**

Register:

- `find_chargers`
- `get_charger_details`
- `compare_chargers`
- `estimate_range_margin`
- `plan_ev_route`
- `explain_charging_plan`

- [ ] **Step 6: Verify**

Run:

```bash
cd servers/ev-charging-range
npm test
npm run typecheck
npm run build
```

Expected: all pass. Live API smoke tests must be opt-in and must skip when keys
are unset.

- [ ] **Step 7: Commit**

```bash
git add servers/ev-charging-range
git commit -m "feat: add EV charging range MCP"
```

## Final Integration Check

- [ ] **Step 1: Update root README server list**

Add links to the new servers only after each server exists and passes tests.

- [ ] **Step 2: Run repository checks**

Run each server's checks:

```bash
for dir in servers/vehicle-context-fitment servers/obd-diagnostics servers/fuel-economy-emissions servers/local-auto-services servers/ev-charging-range; do
  (cd "$dir" && npm test && npm run typecheck && npm run build)
done
```

Expected: all pass.

- [ ] **Step 3: Push**

```bash
git status --short
git push
```

Expected: only intentional committed work is pushed. No unapproved `packages/`
changes are included.
