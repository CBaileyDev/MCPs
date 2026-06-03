# Repair Info MCP

Recalls, complaints, and safety ratings from the free
[NHTSA API](https://api.nhtsa.gov), plus a generic maintenance schedule.

## Tools

| Tool | Purpose |
| --- | --- |
| `get_recalls` | Official NHTSA safety recalls for a make/model/year. |
| `get_complaints` | NHTSA consumer complaints for a make/model/year. |
| `get_safety_ratings` | NHTSA NCAP crash-test star ratings. |
| `get_maintenance_schedule` | Generic, manufacturer-agnostic service intervals. |

> **Scope note.** Maintenance intervals are **generic guidance**, not the OEM
> schedule (which is proprietary). Full service-procedure text and TSB content
> are also proprietary and are intentionally **not** provided here.

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
    "repair-info": {
      "command": "node",
      "args": ["/absolute/path/to/MCPs/servers/repair-info/dist/index.js"]
    }
  }
}
```
