# vPIC MCP

VIN decoding and make/model/year validation, backed by the free
[NHTSA vPIC API](https://vpic.nhtsa.dot.gov/api/) (no API key required).

## Tools

| Tool | Purpose |
| --- | --- |
| `decode_vin` | Decode a full 17-char VIN (optionally with model year). |
| `decode_vin_batch` | Decode up to 50 VINs in one request. |
| `get_all_makes` | List all makes known to vPIC. |
| `get_models_for_make_year` | List models for a make in a model year. |
| `get_vehicle_types_for_make` | List vehicle types for a make. |
| `decode_wmi` | Decode a 3-char World Manufacturer Identifier. |
| `validate_make_model_year` | Validate a year/make/model and return canonical spelling. |

Read-only; all data comes from NHTSA.

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
