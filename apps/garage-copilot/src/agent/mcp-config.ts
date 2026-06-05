/**
 * Generate the combined MCP-client configuration that wires every server in
 * this repo into one Claude session — the "connect the brain to the car" step.
 *
 * Pure: given the absolute path to the repo root, it returns the config object
 * an MCP client (Claude Desktop/Code, etc.) expects. The CLI prints it; tests
 * assert its shape. Paths point at each server's built `dist/index.js`.
 */

/** One server entry in an mcpServers config. */
export type McpServerEntry = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export type McpConfig = { mcpServers: Record<string, McpServerEntry> };

/** Servers in this repo, with any default env needed to run key-free. */
const SERVERS: Array<{ name: string; env?: Record<string, string> }> = [
  { name: "vpic" },
  { name: "garage-memory" },
  { name: "repair-info" },
  { name: "part-interchange" },
  { name: "vehicle-context-fitment" },
  { name: "obd-diagnostics" },
  { name: "fuel-economy-emissions" },
  { name: "local-auto-services" },
  { name: "ev-charging-range", env: { AFDC_API_KEY: "DEMO_KEY" } },
  { name: "tire-wheel-fitment" },
  { name: "drivetrain-gearing" },
  { name: "automotive-unit-converter" },
  { name: "automotive-electrical" },
  { name: "engine-build-math" },
  { name: "towing-payload-math" },
  { name: "rockauto-catalog-search" },
  { name: "marketplace-pricing" }
];

/** Join a repo root and a server path into an absolute entrypoint, POSIX-style. */
function entrypoint(repoRoot: string, server: string): string {
  const root = repoRoot.replace(/\/+$/, "");
  return `${root}/servers/${server}/dist/index.js`;
}

/**
 * Build the combined config. `repoRoot` should be the absolute path to the
 * cloned MCPs repository. By default every key-free server is included; pass a
 * subset of names to limit it.
 */
export function buildMcpConfig(repoRoot: string, only?: string[]): McpConfig {
  if (typeof repoRoot !== "string" || repoRoot.trim() === "") {
    throw new Error("buildMcpConfig: repoRoot (absolute path to the MCPs repo) is required");
  }
  const wanted = only ? new Set(only) : undefined;
  const mcpServers: Record<string, McpServerEntry> = {};
  for (const server of SERVERS) {
    if (wanted && !wanted.has(server.name)) continue;
    const entry: McpServerEntry = { command: "node", args: [entrypoint(repoRoot, server.name)] };
    if (server.env) entry.env = { ...server.env };
    mcpServers[server.name] = entry;
  }
  return { mcpServers };
}

/** All server names known to the generator. */
export function knownServers(): string[] {
  return SERVERS.map(s => s.name);
}

/** Render the config as pretty JSON. */
export function renderMcpConfig(repoRoot: string, only?: string[]): string {
  return JSON.stringify(buildMcpConfig(repoRoot, only), null, 2);
}
