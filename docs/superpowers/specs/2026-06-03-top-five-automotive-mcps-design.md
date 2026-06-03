# Top Five Automotive MCPs Design

Date: 2026-06-03

## Scope

This design defines the next five MCP servers to add to the automotive MCP
collection after the existing RockAuto, vPIC, garage memory, repair info, part
interchange, and marketplace pricing work.

The five selected servers are:

1. `vehicle-context-fitment`
2. `obd-diagnostics`
3. `fuel-economy-emissions`
4. `local-auto-services`
5. `ev-charging-range`

Live OBD diagnostics and scan-log analysis are intentionally one server. They
share schemas and evidence semantics, and splitting them would duplicate
parsers, units, DTC handling, and diagnostic summaries.

## Architecture

Each server remains independently runnable over stdio using the established
TypeScript MCP pattern. The repo should continue to place new work under
`servers/<name>/` unless the user later approves moving active work into
`packages/`.

The shared architectural pattern is:

- `src/index.ts`: server bootstrap, instructions, and tool registration.
- `src/tools/register.ts`: MCP tool definitions and schemas.
- `src/domain/`: pure domain normalization and validation.
- `src/providers/`: public API, local adapter, or file-provider adapters.
- `src/safety/`: rate limits, URL/API constraints, destructive-action guards,
  and source attribution helpers.
- `test/`: focused Vitest tests for domain behavior, provider parsing, and tool
  registry behavior.

No server should depend on scraping private pages, automating account actions,
or making unsupported safety claims.

## Data Flow

1. Vehicle identity starts with `vpic` or direct user input.
2. `vehicle-context-fitment` converts identity and user-confirmed details into
   a canonical vehicle context with confidence and missing attributes.
3. Domain servers consume that context:
   - `obd-diagnostics` attaches scan evidence.
   - `fuel-economy-emissions` attaches official EPA efficiency data.
   - `local-auto-services` attaches location-specific service options.
   - `ev-charging-range` attaches charger and range planning data.
4. Existing servers consume the same context:
   - `rockauto-catalog-search` for part lookup.
   - `repair-info` for recalls and complaints.
   - `garage-memory` for persistence.
   - `part-interchange` and `marketplace-pricing` once providers are ready.

## Server Designs

### vehicle-context-fitment

Responsibility: canonicalize vehicle profile evidence and explain what is known,
unknown, inferred, or conflicting.

Core types:

- `VehicleContext`: canonical year, make, model, engine, trim, drivetrain,
  transmission, body, emissions, market, build date, and identifiers.
- `EvidenceRecord`: source, field, value, confidence, retrievedAt, and notes.
- `FitmentQuestion`: missing attribute, reason, examples, and impact.

Key tools:

- `resolve_vehicle_context`
- `merge_vehicle_evidence`
- `list_missing_fitment_attributes`
- `explain_vehicle_confidence`
- `check_basic_fitment_context`
- `record_fitment_correction`

V1 depends on user input, vPIC output, and garage memory. Licensed ACES/PIES or
VCdb/PCdb providers are future adapters only.

### obd-diagnostics

Responsibility: normalize live OBD data and user-provided scan logs into an
evidence trail an agent can reason over.

Core types:

- `DiagnosticSession`: vehicle context, adapter metadata, scan timestamp,
  ignition/MIL state, and source.
- `DtcRecord`: code, status, module when available, description if known, and
  evidence source.
- `ReadinessSnapshot`: monitor states and inspection-readiness summary.
- `PidSample`: PID label, value, unit, timestamp, and sampling source.

Key tools:

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

V1 is read-only. Clearing codes, ECU writes, active tests, adaptations, and
manufacturer-specific commands are out of scope.

### fuel-economy-emissions

Responsibility: expose official fuel economy, emissions, and estimated cost data
with clear assumptions.

Core types:

- `EfficiencyVehicle`: FuelEconomy.gov ID, year, make, model, option text,
  engine, transmission, fuel type, drive, and class.
- `EfficiencyRating`: city/highway/combined MPG or MPGe, EPA range, annual fuel
  cost, GHG score, and smog score when available.
- `CostEstimate`: miles, energy price, fuel price, assumed efficiency, result,
  and caveats.

Key tools:

- `search_efficiency_vehicle`
- `get_efficiency_vehicle`
- `get_vehicle_emissions`
- `get_current_fuel_prices`
- `compare_efficiency`
- `estimate_trip_energy_cost`
- `estimate_annual_fuel_cost`

Primary source: https://www.fueleconomy.gov/feg/ws/index.shtml

### local-auto-services

Responsibility: find automotive service locations from public geospatial data
without inventing quality rankings.

Core types:

- `ServiceSearchRequest`: category, location, radius, limit, and filters.
- `ServiceResult`: name, coordinates, category, source tags, contact fields,
  opening-hours text, attribution, and confidence.
- `OsmQueryPlan`: generated Overpass QL, tag mapping, radius, timeout, and
  cache key.

Key tools:

- `find_auto_services`
- `find_repair_shops`
- `find_parts_stores`
- `find_tire_shops`
- `find_fuel_stations`
- `find_vehicle_inspection_sites`
- `find_towing_services`
- `explain_service_search`

Primary source: https://dev.overpass-api.de/overpass-doc/en/

### ev-charging-range

Responsibility: find charging stations and produce conservative range-margin
plans using explicit assumptions.

Core types:

- `ChargingStation`: station ID, source, coordinates, network, connectors,
  power, access rules, pricing text, and status fields when source-provided.
- `RangeAssumption`: starting charge, target reserve, EPA or user efficiency,
  weather/speed/load notes, and confidence.
- `ChargingPlan`: stops, estimated arrival SOC, risk notes, alternatives, and
  source attribution.

Key tools:

- `find_chargers`
- `get_charger_details`
- `compare_chargers`
- `estimate_range_margin`
- `plan_ev_route`
- `explain_charging_plan`

Primary sources:

- https://developer.nlr.gov/docs/transportation/alt-fuel-stations-v1/
- https://www.openchargemap.org/develop/api
- https://www.fueleconomy.gov/feg/ws/index.shtml

## Error Handling

Each server should return structured errors with:

- `code`: stable machine-readable error.
- `message`: short user-facing explanation.
- `source`: provider or subsystem.
- `retryable`: boolean.
- `nextSteps`: specific next action when useful.

Provider errors must preserve source context. Stale or partial data should be
returned with warnings instead of hidden.

## Testing

Every server should include:

- Domain tests for schema normalization and confidence/caveat behavior.
- Provider tests using fixtures, not broad live calls.
- One opt-in smoke test for the public provider where practical.
- Tool registry tests that confirm every advertised tool is registered.
- Safety tests for rate limits, URL/domain restrictions, API key handling, and
  destructive-action blocks.

## Source And License Rules

- Preserve source URLs and retrieval timestamps.
- Use environment variables for API keys.
- Respect public API rate limits and attribution requirements.
- Do not redistribute proprietary manual, SAE, ACES/PIES, VCdb/PCdb, or tire
  standard content unless licensed.
- Keep user garage, VIN, and diagnostic data local unless the user explicitly
  asks to pass it to a remote source.

## Acceptance Criteria

- The roadmap and implementation plan identify exact next server folders.
- The five chosen MCPs do not duplicate active server work.
- Each MCP has a clear v1 boundary, tool surface, data-source plan, safety
  boundary, and integration path.
- Future workers can implement each server independently without touching
  `packages/`.
