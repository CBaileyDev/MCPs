# Recipes: composing the servers

The servers are separate processes and **do not call each other** — composition
happens at the MCP client/agent layer. An agent with several of these servers
connected can chain their tools into end-to-end workflows. These recipes show
the data flow for common automotive tasks; each arrow is "feed this output into
that tool."

The natural backbone is **identity → domain → persistence**: establish what the
vehicle is (`vpic`, `vehicle-context-fitment`), answer a question with the domain
servers, then optionally remember it (`garage-memory`).

---

## 1. Vet a used car from its VIN

> "Here's the VIN of a car I'm considering — anything I should know?"

```
vpic.validate_vin (vin)                      → offline pre-flight: catch a mistyped VIN before any API call
vpic.decode_vin (vin)
  → make / model / year / engine / plant
repair-info.get_recalls_by_vin (vin)         → open safety recalls
repair-info.get_safety_ratings (mk/md/yr)    → NCAP crash-test stars
repair-info.get_complaints (mk/md/yr)        → common owner-reported problems
fuel-economy-emissions.search_efficiency_vehicle → get_efficiency_vehicle
  → EPA MPG / annual fuel cost / emissions
garage-memory.save_vehicle                   → keep it for later comparison
```

## 2. Plus-size wheels and tires safely

> "Can I fit 275/40R20 on my car, and what does it do to my speedo and gearing?"

```
tire-wheel-fitment.parse_tire_size (current + proposed)
tire-wheel-fitment.calculate_tire_dimensions → overall diameter, sidewall, circumference
tire-wheel-fitment.suggest_replacement_sizes → diameter-matched alternatives
tire-wheel-fitment.speedometer_error         → % speedo error from the size change
tire-wheel-fitment.convert_wheel_offset      → offset(mm) ↔ backspacing(in) for the new wheels
tire-wheel-fitment.wheel_fitment_change      → how much more they poke / inner clearance vs. stock
drivetrain-gearing.tire_gearing_effect       → effective final-drive change, restoring ratio
local-auto-services.find_tire_shops (lat/lon) → where to buy / mount
garage-memory.create_project_build           → record the wheel/tire plan
```

## 3. Chase down a check-engine light

> "My scan tool dumped a log with a P0301 — what now?"

```
obd-diagnostics.ingest_scan_log (csv/text)   → normalized samples + DTCs
obd-diagnostics.obd_read_dtcs                → decoded codes + affected subsystem
obd-diagnostics.summarize_diagnostic_evidence
obd-diagnostics.suggest_next_diagnostic_steps
repair-info.get_complaints / get_recalls     → is this a known pattern for the vehicle?
part-interchange.cross_reference_part         → OEM ↔ aftermarket numbers for the fix
rockauto-catalog-search.search_part_number    → catalog availability
marketplace-pricing.compare_prices            → price the part (needs marketplace creds)
```

## 4. Check an EV road trip is feasible

> "Can my EV make this 180-mile leg, and where would I charge?"

```
vehicle-context-fitment.resolve_vehicle_context → best-known vehicle profile
ev-charging-range.estimate_range_margin       → conservative margin vs. reserve
  (batteryKwh / epaRangeMiles / efficiency come from the profile or the user)
ev-charging-range.plan_ev_route               → per-leg feasibility (NOT navigation)
ev-charging-range.find_chargers (lat/lon)     → stations near the tight legs
ev-charging-range.explain_charging_plan       → plain-language summary + caveats
local-auto-services.find_auto_services        → food/fuel/repair near a stop
```

## 5. Wire an accessory (winch, light bar, compressor)

> "I'm adding a 60 A winch 12 ft from the battery — what wire and fuse?"

```
automotive-electrical.recommend_wire_gauge (amps, lengthFeet, maxDropPercent)
automotive-electrical.voltage_drop            → confirm drop % on the chosen gauge
automotive-electrical.fuse_size (continuousAmps) → smallest standard fuse that protects the wire
automotive-electrical.battery_runtime         → how long the load runs on the battery
automotive-unit-converter.socket_size         → metric ↔ fractional socket for the lugs
automotive-unit-converter.convert_torque      → terminal torque spec in your unit
```

## 6. Spec an engine build

> "4.00 bore, 3.48 stroke, 64cc heads — what's my displacement, CR, and carb size?"

```
engine-build-math.displacement (bore/stroke/cylinders) → ci / cc / liters
engine-build-math.compression_ratio (+ chamber/gasket/deck/piston cc) → static CR
engine-build-math.mean_piston_speed (stroke, rpm)      → RPM stress check
engine-build-math.engine_airflow_cfm (cid, rpm, VE)    → carb/intake CFM target
engine-build-math.injector_size_required (hp, cyl)     → fuel-injector size (lb/hr + cc/min)
automotive-unit-converter.convert_power                → quoted PS ↔ SAE hp ↔ kW
garage-memory.create_project_build + add_project_note  → record the combo
```

## 7. Check a tow setup is within limits

> "Can my truck safely pull this 7,000 lb trailer with the family aboard?"

```
towing-payload-math.tongue_weight (trailer wt, %)      → tongue weight + 10–15% sway check
towing-payload-math.payload_check                      → do tongue + passengers + cargo fit payload?
towing-payload-math.towing_headroom (GCWR, truck, trailer) → room left under GCWR
towing-payload-math.tow_setup_check                    → all three at once, and the binding limit
```

All ratings (GVWR, GCWR, payload) come from the door-jamb label and the
manufacturer's towing guide — the server does the math on weights you supply.

---

## Building the canonical vehicle profile (the glue for 1, 2, 4)

`vehicle-context-fitment` is the optional identity hub. Feed it evidence from
`vpic` and the user, and it produces one profile with **per-attribute
confidence** and a list of what's missing or conflicting:

```
vpic.decode_vin → vehicle-context-fitment.merge_vehicle_evidence
vehicle-context-fitment.resolve_vehicle_context        → best-known profile + confidence
vehicle-context-fitment.list_missing_fitment_attributes → what to ask the user next
vehicle-context-fitment.record_fitment_correction      → user overrides win
```

Downstream servers (`tire-wheel-fitment`, `ev-charging-range`, `repair-info`)
then consume that single profile instead of re-deriving the vehicle each time.

> Tooling note: these servers never fabricate. When a profile attribute is
> unknown, it is surfaced as missing rather than guessed — so a recipe may pause
> to ask the user for the one fact that unblocks the rest of the chain.
