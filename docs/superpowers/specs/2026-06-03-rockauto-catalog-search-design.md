# RockAuto Catalog Search MCP Design

## Goal

Build a catalog/search-only MCP server that lets Claude, Codex, and other MCP
clients perform targeted RockAuto research for vehicles, categories, part
numbers, fitment, pricing, and comparison workflows.

## Scope

V1 includes only public catalog and search workflows. It does not log in, read
account data, modify carts, place orders, automate checkout, bypass CAPTCHA, or
perform broad crawling. Every lookup must be tied to a user-requested query.

## Architecture

The repo is a parent `MCPs` collection with one server folder per MCP. The
RockAuto server is a TypeScript package using the official MCP SDK over stdio
for local Claude/Codex usage. A future Streamable HTTP entrypoint can reuse the
same tool registry and provider layer.

The server has four boundaries:

- `tools`: MCP tool registration and input/output schemas.
- `catalog`: RockAuto-facing provider interface plus the HTTP provider.
- `safety`: rate limiting, URL validation, and user-agent/caching policy.
- `domain`: normalized vehicle, category, part, and comparison models.

## V1 Tools

- `search_vehicle`: search for vehicle candidates by year, make, and model.
- `list_vehicle_options`: return known engines/options for a vehicle candidate.
- `list_part_categories`: list part category names for a vehicle.
- `search_parts`: search parts for a vehicle and category or part type.
- `search_part_number`: search the public catalog by part number.
- `get_part_details`: normalize details for one RockAuto part/detail URL.
- `compare_parts`: compare normalized parts by price, brand, fitment, and notes.
- `explain_fitment`: explain fitment confidence and missing vehicle details.

## Safety And Compliance

The server must:

- Use targeted, user-requested requests only.
- Rate-limit outbound requests.
- Cache repeated responses for a short TTL.
- Return source URLs and timestamps with all live results.
- Reject unsupported account, cart, checkout, login, CAPTCHA, and bulk export requests.
- Keep server instructions explicit so clients understand the constraints.

## Testing

Tests cover tool input validation, compare/explain logic, rate limiting behavior,
and provider parsing with static fixtures. Live RockAuto tests are opt-in and
excluded from default CI/local verification.

## Future MCPs

Next high-value MCPs in this direction:

- NHTSA/vPIC MCP for VIN decoding and vehicle validation.
- OEM/interchange MCP for part-number cross references.
- Marketplace comparison MCP for allowed price comparisons.
- Repair information MCP for service intervals, recalls, and TSB lookup.
- Garage memory MCP for saved vehicles and build/project context.
