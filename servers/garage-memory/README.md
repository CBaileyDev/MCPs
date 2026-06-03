# Garage Memory MCP

Remembers the user's vehicles, past searches, preferred parts brands, and
project builds across sessions, backed by a local JSON store.

Data lives at `~/.local/share/garage-memory/db.json` (override with the
`GARAGE_MEMORY_DIR` environment variable).

## Tools

| Group | Tools |
| --- | --- |
| Vehicles | `save_vehicle`, `list_vehicles`, `get_vehicle`, `update_vehicle`, `delete_vehicle` |
| Searches | `log_search`, `list_recent_searches` |
| Brands | `set_preferred_brand`, `list_preferred_brands` |
| Projects | `create_project_build`, `add_project_note`, `list_project_builds` |

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
    "garage-memory": {
      "command": "node",
      "args": ["/absolute/path/to/MCPs/servers/garage-memory/dist/index.js"],
      "env": { "GARAGE_MEMORY_DIR": "/optional/custom/path" }
    }
  }
}
```
