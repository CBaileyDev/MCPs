import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFuelEconomyTools } from "./tools/register.js";

export const SERVER_INSTRUCTIONS =
  "FuelEconomy.gov MCP provides EPA-official fuel economy and emissions data for vehicles. " +
  "All MPG/MPGe figures are EPA estimates — real-world results vary by driving style, speed, weather, and vehicle load. " +
  "Data sourced from https://www.fueleconomy.gov. " +
  "Use search_efficiency_vehicle for progressive make/model/trim lookup, then get_efficiency_vehicle for full details. " +
  "Use compare_efficiency to compare 2–5 vehicles side-by-side. " +
  "Use estimate_annual_fuel_cost or estimate_trip_energy_cost for cost projections with explicit assumptions.";

export function createFuelEconomyMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "fuel-economy-emissions",
      version: "0.1.0"
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  );

  registerFuelEconomyTools(server);
  return server;
}
