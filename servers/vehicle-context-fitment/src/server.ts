import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerVehicleContextTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "Vehicle Context & Fitment is the canonical vehicle-profile layer for the suite. It normalizes a vehicle profile from user input, vPIC decode output, and garage-memory fields the caller passes in, tracking a confidence status per attribute (confirmed/decoded/inferred/unknown/conflicting) along with the evidence behind it. Use resolve_vehicle_context to build a profile, merge_vehicle_evidence to fold in new sources and surface conflicts, list_missing_fitment_attributes to decide what to ask next, explain_vehicle_confidence for a readable summary, check_basic_fitment_context for a coarse category readiness check, and record_fitment_correction to apply a user correction. It returns CONFIDENCE and EVIDENCE only and NEVER asserts guaranteed part compatibility. It is stateless and pure: persistence is delegated to the garage-memory server.";

export function createVehicleContextMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "vehicle-context-fitment",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerVehicleContextTools(server);
  return server;
}
