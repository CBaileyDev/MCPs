# automotive-electrical MCP

A pure-math MCP server for 12V/24V DC automotive electrical calculations. No API key required — all calculations are deterministic arithmetic.

## Tools

| Tool | Description |
|------|-------------|
| `voltage_drop` | Calculate voltage drop and end voltage for a 2-wire DC run given AWG, amps, and run length |
| `recommend_wire_gauge` | Find the smallest wire gauge that keeps voltage drop within a specified percentage limit |
| `ohms_law` | Compute all four Ohm's law quantities (V, I, R, P) from any two known inputs |
| `fuse_size` | Recommend the smallest standard automotive blade-fuse rating for a continuous load |
| `battery_runtime` | Estimate how long a battery bank will power a given load at a specified depth of discharge |
| `battery_bank` | Calculate total voltage, amp-hours, watt-hours, and cell count for series/parallel battery banks |

## Notes

- No API key or network access required — all results are pure arithmetic.
- AWG resistance values are for copper at ~20-25°C; aluminum uses a 1.64× approximation.
- Standard automotive blade fuse sizes supported: 1, 2, 3, 4, 5, 7.5, 10, 15, 20, 25, 30, 35, 40 A.

## Safety Caveat

Results are engineering estimates and rules-of-thumb. Fuse sizing, wire gauge recommendations, and battery guidance must be verified against actual component ratings and applicable wiring standards before use. This server does not provide code-compliant electrical specifications and is not a substitute for professional electrical engineering advice.
