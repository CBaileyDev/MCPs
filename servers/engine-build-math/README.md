# engine-build-math MCP

Pure-math MCP server for engine builder calculations. No API key required; all results are deterministic arithmetic.

## Tools

| Tool | Description |
|------|-------------|
| `displacement` | Calculates total engine displacement (ci, cc, liters) from bore, stroke, and cylinder count |
| `compression_ratio` | Calculates compression ratio from bore/stroke plus clearance volumes (chamber, gasket, deck, piston) |
| `bore_stroke_ratio` | Calculates bore-to-stroke ratio and classifies engine character (oversquare / square / undersquare) |
| `mean_piston_speed` | Calculates mean piston speed (ft/min and m/s) from stroke and RPM |
| `engine_airflow_cfm` | Calculates engine airflow demand in CFM from displacement, RPM, and volumetric efficiency |
| `injector_flow_convert` | Converts injector flow between cc/min and lb/hr (both directions, returns both units); accounts for fuel density |
| `injector_size_required` | Calculates the minimum injector flow rating (lb/hr and cc/min) needed to support a target horsepower, given cylinders, BSFC, and duty cycle |
| `injector_max_hp` | Calculates the maximum horsepower an injector set can support at a given flow rating, cylinder count, BSFC, and duty cycle |

## Notes

- **No API key required** — all calculations are pure arithmetic using exact constants.
- **Theoretical results only** — values do not account for real-world factors such as dynamic compression ratio, port flow efficiency, cam timing effects, or combustion chamber geometry variations.
- `1 cubic inch = 16.387064 cc`; `1 inch = 25.4 mm`; swept volume = `(π/4) × bore² × stroke`.
- `pistonCc` in `compression_ratio` is signed: positive = dish (adds clearance), negative = dome (subtracts clearance).
- Volumetric efficiency > 1.0 is valid in `engine_airflow_cfm` for forced induction scenarios.
