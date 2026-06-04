# vPIC MCP

VIN decoding and make/model/year validation, backed by the free
[NHTSA vPIC API](https://vpic.nhtsa.dot.gov/api/) (no API key required).

## Tools

| Tool | Purpose |
| --- | --- |
| `decode_vin` | Decode a full 17-char VIN (optionally with model year). |
| `validate_vin` | **Offline** pre-flight (no API call): universal format check (17 chars, legal charset, no I/O/Q) + North American check digit, reported separately. |
| `decode_vin_batch` | Decode up to 50 VINs in one request. |
| `get_all_makes` | List all makes known to vPIC. |
| `get_models_for_make_year` | List models for a make in a model year. |
| `get_vehicle_types_for_make` | List vehicle types for a make. |
| `decode_wmi` | Decode a 3-char World Manufacturer Identifier. |
| `validate_make_model_year` | Validate a year/make/model and return canonical spelling. |

Read-only. All data comes from NHTSA, except `validate_vin`, which is a fully
offline/local computation (handy as a pre-flight before spending an API call on
a mistyped VIN).

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
    "vpic": {
      "command": "node",
      "args": ["/absolute/path/to/MCPs/servers/vpic/dist/index.js"]
    }
  }
}
```
