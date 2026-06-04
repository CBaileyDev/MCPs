# Using these servers with an MCP client

Each server is a standalone stdio MCP server. To use one, build it once and point
your MCP client (Claude Code/Desktop, Cursor, etc.) at its built entrypoint.

## Build first

Each server is self-contained, so build the ones you want:

```bash
# from the repo root, build every server:
for d in servers/*/; do (cd "$d" && npm install && npm run build); done
```

(or just `cd servers/<name> && npm install && npm run build` for a single one.)

## Combined configuration

Replace `/ABS/PATH/TO/MCPs` with the absolute path to your clone. All of these
work with **no API key**:

```jsonc
{
  "mcpServers": {
    "vpic": {
      "command": "node",
      "args": ["/ABS/PATH/TO/MCPs/servers/vpic/dist/index.js"]
    },
    "garage-memory": {
      "command": "node",
      "args": ["/ABS/PATH/TO/MCPs/servers/garage-memory/dist/index.js"]
    },
    "repair-info": {
      "command": "node",
      "args": ["/ABS/PATH/TO/MCPs/servers/repair-info/dist/index.js"]
    },
    "vehicle-context-fitment": {
      "command": "node",
      "args": ["/ABS/PATH/TO/MCPs/servers/vehicle-context-fitment/dist/index.js"]
    },
    "obd-diagnostics": {
      "command": "node",
      "args": ["/ABS/PATH/TO/MCPs/servers/obd-diagnostics/dist/index.js"]
    },
    "fuel-economy-emissions": {
      "command": "node",
      "args": ["/ABS/PATH/TO/MCPs/servers/fuel-economy-emissions/dist/index.js"]
    },
    "local-auto-services": {
      "command": "node",
      "args": ["/ABS/PATH/TO/MCPs/servers/local-auto-services/dist/index.js"]
    },
    "tire-wheel-fitment": {
      "command": "node",
      "args": ["/ABS/PATH/TO/MCPs/servers/tire-wheel-fitment/dist/index.js"]
    },
    "drivetrain-gearing": {
      "command": "node",
      "args": ["/ABS/PATH/TO/MCPs/servers/drivetrain-gearing/dist/index.js"]
    },
    "automotive-unit-converter": {
      "command": "node",
      "args": ["/ABS/PATH/TO/MCPs/servers/automotive-unit-converter/dist/index.js"]
    },
    "part-interchange": {
      "command": "node",
      "args": ["/ABS/PATH/TO/MCPs/servers/part-interchange/dist/index.js"]
    },
    "ev-charging-range": {
      "command": "node",
      "args": ["/ABS/PATH/TO/MCPs/servers/ev-charging-range/dist/index.js"],
      "env": {
        "AFDC_API_KEY": "DEMO_KEY"
      }
    }
  }
}
```

## Per-server configuration notes

| Server | Key/env needed | Notes |
| --- | --- | --- |
| vpic, repair-info, fuel-economy-emissions, local-auto-services, tire-wheel-fitment, drivetrain-gearing, automotive-unit-converter | none | Free public data or pure math. |
| garage-memory | none | Set `GARAGE_MEMORY_DIR` to change the local store path. |
| part-interchange | none | Local personal interchange database — record your own OEM↔aftermarket cross-refs with `add_interchange`. Set `PART_INTERCHANGE_DIR` to change the store path. Licensed-provider lookup is a future adapter. |
| vehicle-context-fitment, obd-diagnostics | none | Pure/local. OBD v1 parses scan logs; live hardware is a mock. |
| ev-charging-range | `AFDC_API_KEY` (free; `DEMO_KEY` works for light use). Optional `OPEN_CHARGE_MAP_API_KEY` to add Open Charge Map. | |
| marketplace-pricing | `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` (eBay Browse API) | Returns "not configured" until set. |
| rockauto-catalog-search | none | Reads RockAuto's public catalog pages; inherently fragile. |

You do not need to enable all of them. Start with `vpic`, `repair-info`,
`fuel-economy-emissions`, `local-auto-services`, and `tire-wheel-fitment` —
they work immediately with zero setup.
