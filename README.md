# MCPs

A local-first collection of Model Context Protocol servers for connecting Claude,
Codex, and other MCP clients to useful tools and public data sources.

## Servers

| Server | Status | Purpose |
| --- | --- | --- |
| [RockAuto Catalog Search](./servers/rockauto-catalog-search) | v1 scaffold | User-requested RockAuto catalog and part search tools. |

## Repository Layout

```text
servers/
  rockauto-catalog-search/
docs/
  superpowers/
    specs/
    plans/
```

Each MCP server should live in its own folder under `servers/` with its own
README, package metadata, tests, and client configuration examples.
