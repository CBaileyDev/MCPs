import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider, type InterchangeProvider } from "./provider.js";
import { InterchangeStore } from "./store.js";
import { registerInterchangeTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "Part Interchange is a personal OEM↔aftermarket interchange database. " +
  "Use add_interchange to record known-equivalent part numbers, then cross_reference_part or " +
  "find_aftermarket_equivalents to look them up. All data is stored locally in a JSON file. " +
  "Licensed-provider cross-referencing (e.g. ACES/PIES feeds) is a future adapter — " +
  "until one is wired in, the local database is the sole source of truth. " +
  "Do not fabricate interchange data.";

export function createInterchangeMcpServer(
  provider: InterchangeProvider = getProvider(),
  store: InterchangeStore = new InterchangeStore()
): McpServer {
  const server = new McpServer(
    {
      name: "part-interchange",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerInterchangeTools(server, provider, store);
  return server;
}
