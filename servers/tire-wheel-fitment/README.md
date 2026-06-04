# Tire & Wheel Fitment MCP

Pure, deterministic tire and wheel math — no API key, no network. Parse tire
sizes, derive real-world dimensions, check speedometer error, decode load/speed
ratings, suggest diameter-matched replacements, and work wheel offset ↔
backspacing with poke/clearance changes.

## Tools

| Tool | Purpose |
| --- | --- |
| `parse_tire_size` | Parse a metric (e.g. `225/45R17`) or flotation (e.g. `33x12.50R15`) size into its components. |
| `calculate_tire_dimensions` | Overall diameter, section width, sidewall height, circumference, revolutions/mile. |
| `compare_tire_sizes` | Diameter / width / sidewall deltas between two sizes. |
| `speedometer_error` | Speedometer error % when changing tire size (indicated vs. actual speed). |
| `decode_service_description` | Decode a load index / speed symbol (e.g. `94W`) into load (kg, lb) and max speed (km/h, mph). |
| `suggest_replacement_sizes` | Rank alternative sizes within a diameter tolerance (plus-sizing supported). |
| `convert_wheel_offset` | Wheel offset (mm) ↔ backspacing (in) for a given width. Positive offset = more backspacing, less poke. `lipAllowanceIn` defaults to 0.5". |
| `wheel_fitment_change` | How far the outer lip moves (poke) and how inner-lip clearance changes when switching wheel width/offset (mm, lip-independent). |

All tools are read-only and pure computation. Results are theoretical — verify
load/speed ratings on the tire and confirm clearances on the vehicle.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Client config

```json
{
  "mcpServers": {
    "tire-wheel-fitment": {
      "command": "node",
      "args": ["/absolute/path/to/MCPs/servers/tire-wheel-fitment/dist/index.js"]
    }
  }
}
```
