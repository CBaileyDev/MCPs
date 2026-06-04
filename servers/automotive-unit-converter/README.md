# automotive-unit-converter MCP

A pure-math MCP server for automotive unit conversions. No API key required — all results are exact arithmetic using standardised constants.

## Tools

| Tool | Description |
|---|---|
| `convert_fuel_economy` | Convert between US MPG, Imperial MPG, L/100km, and km/L. Returns all four units at once. Note: L/100km is inverse (lower = better). |
| `convert_power` | Convert between mechanical horsepower (hp/SAE), kilowatts (kw), and metric horsepower (ps/CV). PS ≠ hp — they differ by ~1.4%. |
| `convert_torque` | Convert between pound-feet (lb_ft), Newton-meters (nm), and kilogram-force-meters (kg_m). |
| `convert_pressure` | Convert between PSI, bar, kilopascals (kpa), and inches of mercury (inhg). Covers tire pressure, boost, and atmospheric readings. |
| `convert_volume` | Convert between liters, milliliters, US quarts, US gallons, Imperial quarts, and Imperial gallons. US gallon ≠ Imperial gallon. |
| `socket_size` | Given a socket size in mm or decimal inches, find the nearest standard socket in the other measurement system, the dimensional gap, and a fit verdict. |

## Socket Interchangeability

The `socket_size` verdict ("interchangeable", "usable in a pinch", "do not substitute") is a practical dimensional heuristic based on gap size — it is **not a guarantee of fit**. Always verify against the actual fastener and torque requirements.

## Usage

```json
{
  "mcpServers": {
    "automotive-unit-converter": {
      "command": "automotive-unit-converter-mcp"
    }
  }
}
```
