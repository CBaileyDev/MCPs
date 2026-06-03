import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerLocalAutoServicesTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "local-auto-services MCP finds nearby automotive services (repair shops, tire shops, auto parts stores, " +
  "fuel stations, vehicle inspection sites, towing) using the OpenStreetMap Overpass API. " +
  "All queries require explicit latitude/longitude — no geocoding is performed. " +
  "Results are bounded by a radius you specify (max 50 km). " +
  "Data is sourced from OpenStreetMap contributors under the ODbL licence. " +
  "No quality rankings are applied; results reflect OSM coverage which may be incomplete. " +
  "Opening hours and phone numbers may be stale — verify directly with the business. " +
  "Towing coverage in OSM is limited; see find_towing_services for details.";

export function createLocalAutoServicesMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "local-auto-services",
      version: "0.1.0",
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  registerLocalAutoServicesTools(server);
  return server;
}
