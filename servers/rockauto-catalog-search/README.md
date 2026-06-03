# RockAuto Catalog Search MCP

Catalog/search-only MCP server for targeted RockAuto research.

## V1 Boundary

This server is for public catalog research only:

- vehicle search
- vehicle option lookup
- part category lookup
- part search
- part number search
- part detail normalization
- part comparison
- fitment explanation

It does not log in, manage carts, place orders, automate checkout, bypass
CAPTCHA, or run broad catalog crawls.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Tools

- `search_vehicle`
- `list_vehicle_options`
- `list_part_categories`
- `search_parts`
- `search_part_number`
- `get_part_details`
- `compare_parts`
- `explain_fitment`

## Current Parser Depth

The live provider parses vehicle engine/carcode options and top-level part
categories from public RockAuto catalog HTML. Part search and part-number search
return normalized page-level results with source URLs and timestamps; line-item
brand/price/warehouse parsing is the next parser milestone.

## Local MCP Usage

After building:

```bash
npm run build
```

Codex:

```bash
codex mcp add rockauto-catalog-search -- node /Users/carterbarker/MCPs/servers/rockauto-catalog-search/dist/index.js
```

Claude Code:

```bash
claude mcp add --transport stdio rockauto-catalog-search -- node /Users/carterbarker/MCPs/servers/rockauto-catalog-search/dist/index.js
```

## Server Instructions

The server advertises instructions that constrain usage to explicit
user-requested catalog and search lookups. Use returned source URLs and
timestamps when reporting live catalog data.
