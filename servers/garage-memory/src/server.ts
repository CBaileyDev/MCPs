import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GarageStore } from "./store.js";
import { registerGarageTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "Garage Memory remembers the user's vehicles, past parts searches, preferred brands, and project builds across sessions in a local store. Use save_vehicle / list_vehicles to track the user's garage, log_search to remember what they looked up, and the project tools to track builds.";

export function createGarageMcpServer(store: GarageStore = new GarageStore()): McpServer {
  const server = new McpServer(
    {
      name: "garage-memory",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerGarageTools(server, store);
  return server;
}
