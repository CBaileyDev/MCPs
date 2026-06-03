# Top Five Next Automotive MCPs Roadmap

Date: 2026-06-03

## Decision Summary

Build these five next, in this order:

1. `vehicle-context-fitment`
2. `obd-diagnostics`
3. `fuel-economy-emissions`
4. `local-auto-services`
5. `ev-charging-range`

This ranking favors MCPs that make the whole automotive stack more powerful, not
only the easiest public API wrappers. The live OBD and scan-log ideas should be
one server because they share the same data model: diagnostic trouble codes,
readiness monitors, freeze frames, PIDs, timestamps, units, and evidence trails.
Combining them frees a slot for `vehicle-context-fitment`, which is the backbone
that lets RockAuto search, VIN decoding, garage memory, repair info, pricing,
and interchange reason about the same exact vehicle.

## Current Coverage

These areas already exist or appear in progress and should be treated as
integration targets, not duplicate next builds:

- `rockauto-catalog-search`: public RockAuto vehicle, category, part, and part
  number research.
- `vpic`: VIN, WMI, make/model/year, and NHTSA vehicle identity lookup.
- `garage-memory`: saved vehicles, preferred brands, project notes, and recent
  searches.
- `repair-info`: NHTSA recalls, complaints, safety ratings, and generic
  maintenance guidance.
- `part-interchange`: scaffold for OEM and aftermarket cross-reference, pending
  licensed or configured data.
- `marketplace-pricing`: parts marketplace pricing area, pending active
  completion.

Do not edit `packages/` unless the user explicitly clears it. Future work should
use `servers/<server-name>/` until the workspace ownership settles.

## Ranking Criteria

The ranking uses six criteria:

- Immediate user utility: Does it answer common car-owner and builder questions?
- Agent leverage: Does it help Claude or Codex decide what to do next?
- Data availability: Can v1 work from public, local, or user-provided data?
- Implementation risk: Can it ship without scraping, legal issues, or vague AI
  conclusions?
- Composability: Does it make current MCPs more useful?
- Long-term power: Can it grow into a stronger system with licensed providers,
  user corrections, and historical garage data?

## 1. Vehicle Context And Fitment MCP

### Purpose

Create the canonical vehicle context layer for the whole repo. A VIN or
year/make/model is not enough for parts and repair decisions. Agents need a
single profile that tracks engine, trim, drivetrain, body, transmission,
emissions package, market, build date, and user-confirmed attributes.

### Why It Is First

RockAuto, interchange, repair, pricing, and garage memory all become more useful
when they share one exact vehicle profile. This MCP reduces false fitment
confidence and tells the agent which missing detail must be confirmed before
ordering parts or recommending work.

### V1 Boundary

- Normalize a vehicle profile from user input, VIN/vPIC results, and garage
  memory fields.
- Track confidence per attribute: confirmed, decoded, inferred, unknown, or
  conflicting.
- Produce a missing-fitment-questions list, such as engine, drivetrain, body, or
  emissions family.
- Store no proprietary fitment database in v1.
- Explain fitment confidence without claiming guaranteed compatibility.

### V2 And V3

- V2: Add provider interfaces for ACES/PIES/VCdb/PCdb or other licensed
  catalogs, without baking any provider into the domain model.
- V2: Add production splits, submodel constraints, region constraints, and
  confidence-scored compatibility checks.
- V3: Learn from user corrections, install outcomes, returns, substitutions,
  and marketplace/RockAuto evidence.

### Tool Surface

- `resolve_vehicle_context`
- `merge_vehicle_evidence`
- `list_missing_fitment_attributes`
- `explain_vehicle_confidence`
- `check_basic_fitment_context`
- `record_fitment_correction`

### Data Sources

- Existing `vpic` MCP for VIN identity.
- Existing `garage-memory` MCP for user-confirmed attributes.
- User-provided build sheets, door placards, registration details, or manual
  notes.
- Future licensed fitment providers through an adapter interface.

### Composability

- RockAuto receives better vehicle inputs and safer caveats.
- Part interchange can reject alternatives that do not fit the confirmed
  context.
- Marketplace pricing can filter incompatible listings.
- Repair info can target recalls and complaints more accurately.
- Garage memory becomes the durable source for user-confirmed attributes.

### Safety And Policy

- Return confidence and evidence, not absolute guarantees.
- Do not imply a part fits when required attributes are unknown.
- Do not scrape private or login-only catalog data.

### Success Criteria

- Given a VIN and a partial user description, the MCP returns a canonical
  profile with explicit unknowns.
- Given conflicting inputs, the MCP keeps both evidence records and asks for the
  smallest useful clarification.
- Existing servers can consume the profile without knowing the evidence
  internals.

## 2. OBD Diagnostics MCP

### Purpose

Let agents work with real vehicle diagnostic evidence: live OBD-II adapter data,
user-supplied scan reports, and CSV logs from tools such as Torque, OBD Fusion,
or Car Scanner.

### Why It Is Second

The most common automotive workflow is "my check engine light is on." This MCP
turns the stack from passive lookup into diagnostic triage. It can run fully
local and can still be useful when no adapter is connected by analyzing
user-provided logs.

### V1 Boundary

- Support local serial/USB/Bluetooth ELM327-style adapters where the host OS
  exposes a serial port.
- Parse user-supplied scan text and CSV logs.
- Read generic emissions-related DTCs, MIL status, readiness monitors, freeze
  frame snapshots, and a small safe set of live PIDs.
- Normalize units and timestamps.
- Provide evidence summaries, not repair certainty.
- Do not include a broad copied SAE PID or DTC table unless licensed.
- Do not clear codes in v1.

### V2 And V3

- V2: Add opt-in `clear_dtcs` with destructive-action confirmation and explicit
  warnings.
- V2: Add diagnostic workflows that correlate DTCs with recalls, complaints,
  likely parts, service history, and readiness status.
- V3: Add trend analysis across garage history and repeated scan sessions.

### Tool Surface

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

### Data Sources

- Local OBD adapter over serial transport.
- User-provided scan report text or CSV files.
- Public library references such as python-OBD for implementation approach:
  https://python-obd.readthedocs.io/en/latest/
- Existing `repair-info`, `rockauto-catalog-search`, `part-interchange`,
  `marketplace-pricing`, and `garage-memory` MCPs for downstream workflows.

### Composability

- Vehicle context identifies the exact vehicle.
- Repair info checks recalls, complaints, and safety data for context.
- RockAuto and interchange can find candidate parts only after evidence is
  summarized.
- Garage memory stores scan sessions and recurring symptoms.
- Pricing estimates possible parts cost after a diagnostic hypothesis is formed.

### Safety And Policy

- Treat diagnostic output as evidence, not a definitive repair order.
- Avoid manufacturer-specific commands unless the user provides supported,
  lawful documentation.
- Keep code clearing, ECU writes, adaptations, and active tests out of v1.
- Require explicit confirmation before any future destructive or state-changing
  tool.

### Success Criteria

- A user can connect an adapter and get DTCs, readiness, and freeze-frame data.
- A user can upload a scan log and get normalized events and units.
- The MCP can explain what evidence exists, what is missing, and what server
  should be queried next.

## 3. Fuel Economy, Emissions, And TCO MCP

### Purpose

Wrap official fuel economy, emissions, fuel price, and cost data so agents can
compare vehicles, estimate trip or ownership cost, and contextualize hybrid/EV
efficiency.

### Why It Is Third

It has strong public data availability and low implementation risk. It also
serves both ownership and buying workflows, and it helps the EV charging server
estimate range and energy cost.

### V1 Boundary

- Use FuelEconomy.gov JSON/XML web services and downloadable data.
- Search year/make/model/options and return FuelEconomy.gov vehicle IDs.
- Return MPG, MPGe, fuel type, EPA range, fuel cost, GHG score, smog score where
  available, and source timestamps.
- Estimate annual fuel cost and trip energy cost from official values and user
  mileage assumptions.
- Do not claim real-world MPG guarantees.

### V2 And V3

- V2: Add bulk CSV cache for faster local lookup.
- V2: Add state/utility energy cost inputs and EIA integration if an API key is
  configured.
- V3: Compare EPA values against garage-recorded fuel logs and OBD telemetry.

### Tool Surface

- `search_efficiency_vehicle`
- `get_efficiency_vehicle`
- `get_vehicle_emissions`
- `get_current_fuel_prices`
- `compare_efficiency`
- `estimate_trip_energy_cost`
- `estimate_annual_fuel_cost`

### Data Sources

- FuelEconomy.gov web services:
  https://www.fueleconomy.gov/feg/ws/index.shtml
- FuelEconomy.gov downloads:
  https://www.fueleconomy.gov/feg/download.shtml
- EPA fuel economy context:
  https://www.epa.gov/fueleconomy
- Optional future EIA energy prices:
  https://www.eia.gov/opendata/

### Composability

- Vehicle context maps year/make/model/options to the right efficiency record.
- Garage memory stores annual miles and user fuel-cost assumptions.
- EV charging uses MPGe/range fields for charger planning.
- Marketplace vehicle valuation can include fuel-cost deltas later.

### Safety And Policy

- Always label EPA data as official estimates.
- Preserve source URLs and retrieval timestamps.
- Make clear that weather, speed, load, tires, battery health, and driving style
  affect real-world results.

### Success Criteria

- A user can search a vehicle and retrieve official economy and emissions data.
- The MCP can compare two candidate vehicles with transparent assumptions.
- The MCP can estimate trip or annual cost and cite its source fields.

## 4. Local Auto Services MCP

### Purpose

Find nearby automotive services using public geospatial data: repair shops, tire
shops, parts stores, fuel stations, car washes, inspection stations, towing, and
parking.

### Why It Is Fourth

It is broadly useful even when the user is not doing a repair at home. It also
connects the agent from "what should I do?" to "where can I do it?" using public
data instead of proprietary local-search APIs.

### V1 Boundary

- Query OpenStreetMap through bounded Overpass API requests.
- Require a location, bounding box, or radius.
- Support category-specific searches with conservative OSM tag mappings.
- Return names, coordinates, tags, opening-hours strings, contact fields, and
  source attribution.
- Do not rank businesses by invented quality.
- Do not use Nominatim heavily; if geocoding is added, throttle it and set an
  identifying user agent.

### V2 And V3

- V2: Add route-adjacent service search for trips.
- V2: Add deduplication, category confidence, and stale-data warnings.
- V3: Add user preference memory, service outcomes, and regional inspection
  rule lookups.

### Tool Surface

- `find_auto_services`
- `find_repair_shops`
- `find_parts_stores`
- `find_tire_shops`
- `find_fuel_stations`
- `find_vehicle_inspection_sites`
- `find_towing_services`
- `explain_service_search`

### Data Sources

- Overpass API manual:
  https://dev.overpass-api.de/overpass-doc/en/
- Overpass QL reference:
  https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL
- OpenStreetMap map features:
  https://wiki.openstreetmap.org/wiki/Map_features

### Composability

- Garage memory can store preferred shops and avoid disliked categories.
- OBD diagnostics can suggest nearby inspection or repair services after a
  readiness or no-start scenario.
- RockAuto workflows can find local alternatives when shipping is slow.
- EV charging can reuse geospatial normalization and route-adjacent logic.

### Safety And Policy

- Respect public Overpass server capacity with small radii, caching, and rate
  limits.
- Include OSM attribution and ODbL notes in outputs.
- Treat opening hours and phone numbers as possibly stale.

### Success Criteria

- A user can ask for nearby tire shops or parts stores and get bounded,
  attributed results.
- Queries stay within configured radius and rate limits.
- The MCP explains which OSM tags drove each match.

## 5. EV Charging And Range MCP

### Purpose

Plan EV charging stops and range margins from public charging-station data,
official efficiency data, and route assumptions.

### Why It Is Fifth

EV support is high-value and public-source feasible, but it is more specialized
than the first four. It should build on the fuel economy and local services
servers rather than reinvent their data models.

### V1 Boundary

- Find chargers by location, radius, connector, network, power level, and access
  restrictions.
- Use official/public station APIs and return source timestamps.
- Estimate simple range margin from EPA range or user-provided consumption.
- Do not claim live charger availability unless the source explicitly provides
  live status.
- Do not plan payment, reservation, or account actions.

### V2 And V3

- V2: Add route-based charging using AFDC/NLR nearby-route support or an
  external routing provider.
- V2: Add weather, elevation, speed, payload, and battery-health adjustment
  inputs as explicit assumptions.
- V3: Add learned vehicle-specific consumption from garage fuel/energy logs and
  OBD telemetry.

### Tool Surface

- `find_chargers`
- `get_charger_details`
- `compare_chargers`
- `estimate_range_margin`
- `plan_ev_route`
- `explain_charging_plan`

### Data Sources

- Alternative Fuel Stations API:
  https://developer.nlr.gov/docs/transportation/alt-fuel-stations-v1/
- Open Charge Map API:
  https://www.openchargemap.org/develop/api
- FuelEconomy.gov web services:
  https://www.fueleconomy.gov/feg/ws/index.shtml

### Composability

- Fuel economy provides EPA range and MPGe.
- Local services provides geospatial query patterns and OSM fallback.
- Garage memory stores preferred networks, adapters, and vehicle-specific
  consumption.
- Vehicle context identifies connector and vehicle efficiency assumptions.

### Safety And Policy

- Use API keys through environment variables only.
- Preserve attribution and fair-use constraints.
- Warn when availability is unknown or station data may be stale.
- Avoid charging account automation in v1.

### Success Criteria

- A user can find chargers for a route or local radius with clear connector and
  network metadata.
- The MCP returns conservative range-margin estimates with listed assumptions.
- The MCP never fabricates live availability.

## Deferred But Strong Candidates

- `manuals-fluids-specs`: important, but public APIs are fragmented. Best v1 is
  local user-provided manual/PDF indexing plus OEM links, not broad scraping.
- `tire-wheel-fitment`: useful, but safety-sensitive and best with a licensed
  provider. Use NHTSA TireWise guidance and user placard data in the meantime:
  https://www.nhtsa.gov/equipment/tires
- `fluids-consumables-planner`: fold the v1 version into garage memory and
  vehicle context until OEM schedules and capacities are available.
- `automotive-orchestrator`: build after at least three of the five above ship.
  It should route across MCPs and preserve source attribution, not become a
  data source itself.
- `vehicle-history-title-risk`: high value for buying workflows, but real title
  history needs NMVTIS-approved or paid-provider access.

## Recommended Build Order

1. Ship `vehicle-context-fitment` v1 so every future MCP can share the same
   vehicle profile.
2. Ship `obd-diagnostics` v1 with log analysis before live clearing or active
   tests.
3. Ship `fuel-economy-emissions` v1 using FuelEconomy.gov web services.
4. Ship `local-auto-services` v1 using bounded Overpass queries.
5. Ship `ev-charging-range` v1 using AFDC/NLR, Open Charge Map, and fuel
   economy range fields.

After that, build `automotive-orchestrator` as a composition MCP that calls the
others, compares source answers, and returns a sourced next-action plan.
