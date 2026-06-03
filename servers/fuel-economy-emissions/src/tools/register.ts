import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ok } from "../result.js";
import * as fe from "../providers/fueleconomy.js";
import { normalizeVehicle, fuelEconomyGovUrl } from "../domain/efficiency.js";
import { estimateAnnualFuelCost, estimateTripEnergyCost } from "../domain/cost.js";

const EPA_CAVEAT =
  "EPA estimates only. Real-world fuel economy varies based on driving style, speed, weather, and vehicle load.";

/**
 * Resolve the current national-average price for a fuel type from a live
 * FuelEconomy.gov response. Returns null when that fuel type's price is not
 * available — we never substitute a hardcoded/stale price (the caller should
 * then ask the user to pass fuelPricePerUnit explicitly).
 */
function getFuelPriceForType(
  prices: Awaited<ReturnType<typeof fe.getFuelPrices>>,
  fuelType: string | null
): number | null {
  const t = (fuelType ?? "").toLowerCase();
  if (t.includes("electric")) return prices.electric;
  if (t.includes("diesel")) return prices.diesel;
  if (t.includes("premium")) return prices.premium;
  if (t.includes("midgrade")) return prices.midgrade;
  if (t.includes("e85") || t.includes("ethanol")) return prices.e85;
  return prices.regular;
}

export function registerFuelEconomyTools(server: McpServer): void {
  server.registerTool(
    "search_efficiency_vehicle",
    {
      title: "Search Efficiency Vehicle",
      description: `Progressive vehicle lookup via FuelEconomy.gov.
- Provide { year } only → returns list of makes.
- Provide { year, make } → returns list of models for that make.
- Provide { year, make, model } → returns list of trim/option variants with vehicleId for each.
Use vehicleId with get_efficiency_vehicle to retrieve full details.`,
      inputSchema: {
        year: z.number().int().min(1984).max(2030),
        make: z.string().optional(),
        model: z.string().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ year, make, model }) => {
      const retrievedAt = new Date().toISOString();
      const sourceUrl = "https://www.fueleconomy.gov/ws/rest/vehicle/menu";
      if (make && model) {
        const options = await fe.getOptions(year, make, model);
        return ok({ type: "options", year, make, model, options, sourceUrl, retrievedAt });
      }
      if (make) {
        const models = await fe.getModels(year, make);
        return ok({ type: "models", year, make, models, sourceUrl, retrievedAt });
      }
      const makes = await fe.getMakes(year);
      return ok({ type: "makes", year, makes, sourceUrl, retrievedAt });
    }
  );

  server.registerTool(
    "get_efficiency_vehicle",
    {
      title: "Get Efficiency Vehicle",
      description:
        "Retrieve full efficiency and emissions data for a specific vehicle by its FuelEconomy.gov vehicle ID. Returns normalized MPG/MPGe, CO2, GHG score, estimated annual fuel cost, and source attribution. All values are EPA official estimates.",
      inputSchema: {
        vehicleId: z.string().min(1)
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ vehicleId }) => {
      const raw = await fe.getVehicle(vehicleId);
      const vehicle = normalizeVehicle(raw, vehicleId);
      const retrievedAt = new Date().toISOString();
      return ok({
        vehicle,
        sourceUrl: fuelEconomyGovUrl(vehicleId),
        retrievedAt,
        caveat: EPA_CAVEAT
      });
    }
  );

  server.registerTool(
    "get_vehicle_emissions",
    {
      title: "Get Vehicle Emissions",
      description:
        "Retrieve emissions data for a vehicle by its FuelEconomy.gov vehicle ID. Returns CO2 tailpipe g/mile, EPA GHG score (1–10 higher is better), fuel type, SmartWay score, and smog rating where available. Derived from the EPA vehicle record.",
      inputSchema: {
        vehicleId: z.string().min(1)
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ vehicleId }) => {
      const raw = await fe.getVehicle(vehicleId);
      const vehicle = normalizeVehicle(raw, vehicleId);
      const retrievedAt = new Date().toISOString();
      return ok({
        vehicleId,
        fuelType: vehicle.fuelType,
        emissions: vehicle.emissions,
        sourceUrl: fuelEconomyGovUrl(vehicleId),
        retrievedAt,
        caveat: EPA_CAVEAT,
        note: "Emissions data sourced from EPA vehicle record. Tailpipe CO2 reflects official EPA test cycle estimates."
      });
    }
  );

  server.registerTool(
    "get_current_fuel_prices",
    {
      title: "Get Current Fuel Prices",
      description:
        "Retrieve current national average fuel prices from FuelEconomy.gov. Includes regular, midgrade, premium, diesel, E85, CNG, LPG, and electricity prices. Prices are updated periodically by the EPA/DOE.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => {
      const prices = await fe.getFuelPrices();
      const retrievedAt = new Date().toISOString();
      return ok({
        prices,
        retrievedAt,
        sourceUrl: "https://www.fueleconomy.gov/ws/rest/fuelprices",
        note: "National average prices from FuelEconomy.gov (EPA/DOE). Electricity price is $/kWh; all others are $/gallon."
      });
    }
  );

  server.registerTool(
    "compare_efficiency",
    {
      title: "Compare Efficiency",
      description:
        "Side-by-side comparison of 2–5 vehicles by their FuelEconomy.gov vehicle IDs. Returns MPG/MPGe, CO2 g/mile, EPA GHG score, and estimated annual fuel cost for each vehicle. All values are EPA official estimates.",
      inputSchema: {
        vehicleIds: z.array(z.string().min(1)).min(2).max(5)
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ vehicleIds }) => {
      const results = await Promise.all(
        vehicleIds.map(async id => {
          const raw = await fe.getVehicle(id);
          const vehicle = normalizeVehicle(raw, id);
          return {
            vehicleId: id,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            fuelType: vehicle.fuelType,
            cityMpg: vehicle.efficiencyRating.cityMpg,
            highwayMpg: vehicle.efficiencyRating.highwayMpg,
            combinedMpg: vehicle.efficiencyRating.combinedMpg,
            co2TailpipeGpm: vehicle.emissions.co2TailpipeGpm,
            ghgScore: vehicle.emissions.ghgScore,
            estAnnualFuelCost: vehicle.estAnnualFuelCost,
            sourceUrl: fuelEconomyGovUrl(id)
          };
        })
      );
      const retrievedAt = new Date().toISOString();
      return ok({
        comparison: results,
        retrievedAt,
        caveat: "EPA estimates; real-world fuel economy and emissions vary by driving conditions, speed, weather, and vehicle load. Figures are for comparison purposes only."
      });
    }
  );

  server.registerTool(
    "estimate_trip_energy_cost",
    {
      title: "Estimate Trip Energy Cost",
      description: `Estimate the fuel/energy cost for a specific trip.
Provide trip miles plus EITHER mpg (gasoline) OR kwhPer100mi (electric), and optionally a fuelPricePerUnit.
If fuelPricePerUnit is omitted, the current national average is fetched from FuelEconomy.gov.
Returns cost, all assumptions used in the calculation, and caveats.`,
      inputSchema: {
        miles: z.number().positive(),
        mpg: z.number().positive().optional(),
        kwhPer100mi: z.number().positive().optional(),
        fuelPricePerUnit: z.number().positive().optional(),
        fuelType: z.string().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ miles, mpg, kwhPer100mi, fuelPricePerUnit, fuelType }) => {
      let priceUsed = fuelPricePerUnit;
      let priceSource = "user-provided";

      if (priceUsed === undefined) {
        const prices = await fe.getFuelPrices();
        const resolvedFuelType = fuelType ?? (kwhPer100mi !== undefined ? "Electricity" : "Regular");
        const livePrice = getFuelPriceForType(prices, resolvedFuelType);
        if (livePrice == null) {
          throw new Error(
            `No current national-average price is available for "${resolvedFuelType}" from FuelEconomy.gov. Pass fuelPricePerUnit explicitly.`
          );
        }
        priceUsed = livePrice;
        priceSource = "FuelEconomy.gov national average";
      }

      const result = estimateTripEnergyCost({ miles, mpg, kwhPer100mi, fuelPricePerUnit: priceUsed });
      return ok({
        ...result,
        assumptions: { ...result.assumptions, priceSource }
      });
    }
  );

  server.registerTool(
    "estimate_annual_fuel_cost",
    {
      title: "Estimate Annual Fuel Cost",
      description: `Estimate the annual fuel/energy cost for a vehicle.
Provide annual miles plus EITHER mpg (gasoline) OR kwhPer100mi (electric), and optionally a fuelPricePerUnit.
If fuelPricePerUnit is omitted, the current national average is fetched from FuelEconomy.gov.
Returns cost, all assumptions used in the calculation, and caveats.`,
      inputSchema: {
        annualMiles: z.number().positive(),
        mpg: z.number().positive().optional(),
        kwhPer100mi: z.number().positive().optional(),
        fuelPricePerUnit: z.number().positive().optional(),
        fuelType: z.string().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ annualMiles, mpg, kwhPer100mi, fuelPricePerUnit, fuelType }) => {
      let priceUsed = fuelPricePerUnit;
      let priceSource = "user-provided";

      if (priceUsed === undefined) {
        const prices = await fe.getFuelPrices();
        const resolvedFuelType = fuelType ?? (kwhPer100mi !== undefined ? "Electricity" : "Regular");
        const livePrice = getFuelPriceForType(prices, resolvedFuelType);
        if (livePrice == null) {
          throw new Error(
            `No current national-average price is available for "${resolvedFuelType}" from FuelEconomy.gov. Pass fuelPricePerUnit explicitly.`
          );
        }
        priceUsed = livePrice;
        priceSource = "FuelEconomy.gov national average";
      }

      const result = estimateAnnualFuelCost({ annualMiles, mpg, kwhPer100mi, fuelPricePerUnit: priceUsed });
      return ok({
        ...result,
        assumptions: { ...result.assumptions, priceSource }
      });
    }
  );
}
