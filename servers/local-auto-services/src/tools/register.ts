import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ok } from "../result.js";
import { validateGeoQuery } from "../safety/geo.js";
import {
  queryServices,
  buildCacheKey,
  buildOverpassQL,
  AGGREGATE_CATEGORIES,
} from "../providers/overpass.js";
import { CATEGORY_TAGS, TOWING_CAVEAT, INSPECTION_CAVEAT, isSupportedCategory } from "../domain/categories.js";
import type { ServiceCategory } from "../domain/categories.js";

const geoInput = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().positive().max(50_000).default(5_000),
  limit: z.number().int().positive().max(50).default(20),
};

const findAnnotations = { readOnlyHint: true as const, openWorldHint: true as const };

async function execFind(
  categories: ServiceCategory[],
  latitude: number,
  longitude: number,
  radiusMeters: number,
  limit: number,
  caveat?: string
) {
  const geoResult = validateGeoQuery(latitude, longitude, radiusMeters);
  if (!geoResult.valid) {
    return ok({ error: geoResult.reason });
  }

  const bounds = { lat: latitude, lon: longitude, radiusMeters };
  const { results, ql, cacheKey, attribution, tagsUsed } = await queryServices(
    categories,
    bounds,
    limit
  );

  return ok({
    count: results.length,
    results,
    tagsUsed,
    ql,
    cacheKey,
    attribution,
    ...(caveat ? { caveat } : {}),
    dataNotes: [
      "Data from OpenStreetMap — may be incomplete or out of date.",
      "Opening hours and phone numbers should be verified directly with the business.",
      "No quality ranking is applied; results are returned in OSM element order.",
    ],
  });
}

export function registerLocalAutoServicesTools(server: McpServer): void {
  // 1. find_auto_services
  server.registerTool(
    "find_auto_services",
    {
      title: "Find Auto Services",
      description:
        "Find nearby automotive services (repair shops, tire shops, auto parts stores, and fuel stations) in one query via OpenStreetMap. Returns results within the specified radius. Does not include vehicle inspection or towing (see dedicated tools). Data is sourced from OpenStreetMap contributors and may be incomplete.",
      inputSchema: geoInput,
      annotations: findAnnotations,
    },
    async ({ latitude, longitude, radiusMeters, limit }) =>
      execFind(AGGREGATE_CATEGORIES, latitude, longitude, radiusMeters, limit)
  );

  // 2. find_repair_shops
  server.registerTool(
    "find_repair_shops",
    {
      title: "Find Auto Repair Shops",
      description:
        "Find nearby auto repair shops (OSM tag: shop=car_repair) via OpenStreetMap. Results may include general mechanics, body shops, and specialty repair services.",
      inputSchema: geoInput,
      annotations: findAnnotations,
    },
    async ({ latitude, longitude, radiusMeters, limit }) =>
      execFind(["repair"], latitude, longitude, radiusMeters, limit)
  );

  // 3. find_parts_stores
  server.registerTool(
    "find_parts_stores",
    {
      title: "Find Auto Parts Stores",
      description:
        "Find nearby auto parts stores (OSM tag: shop=car_parts) via OpenStreetMap.",
      inputSchema: geoInput,
      annotations: findAnnotations,
    },
    async ({ latitude, longitude, radiusMeters, limit }) =>
      execFind(["parts"], latitude, longitude, radiusMeters, limit)
  );

  // 4. find_tire_shops
  server.registerTool(
    "find_tire_shops",
    {
      title: "Find Tire Shops",
      description:
        "Find nearby tire shops (OSM tag: shop=tyres) via OpenStreetMap.",
      inputSchema: geoInput,
      annotations: findAnnotations,
    },
    async ({ latitude, longitude, radiusMeters, limit }) =>
      execFind(["tires"], latitude, longitude, radiusMeters, limit)
  );

  // 5. find_fuel_stations
  server.registerTool(
    "find_fuel_stations",
    {
      title: "Find Fuel Stations",
      description:
        "Find nearby fuel / gas stations (OSM tag: amenity=fuel) via OpenStreetMap.",
      inputSchema: geoInput,
      annotations: findAnnotations,
    },
    async ({ latitude, longitude, radiusMeters, limit }) =>
      execFind(["fuel"], latitude, longitude, radiusMeters, limit)
  );

  // 6. find_vehicle_inspection_sites
  server.registerTool(
    "find_vehicle_inspection_sites",
    {
      title: "Find Vehicle Inspection Sites",
      description:
        "Find nearby vehicle inspection sites (OSM tag: amenity=vehicle_inspection) via OpenStreetMap. Coverage is sparse in many regions — check local DMV or state resources for complete listings.",
      inputSchema: geoInput,
      annotations: findAnnotations,
    },
    async ({ latitude, longitude, radiusMeters, limit }) =>
      execFind(["inspection"], latitude, longitude, radiusMeters, limit, INSPECTION_CAVEAT)
  );

  // 7. find_towing_services
  server.registerTool(
    "find_towing_services",
    {
      title: "Find Towing Services",
      description:
        "Attempt to find towing / roadside assistance services near a location via OpenStreetMap. " +
        "IMPORTANT: OSM has no well-established towing tag. Results show auto repair shops (shop=car_repair) that may offer towing. Coverage of dedicated tow operators is limited. Always call ahead.",
      inputSchema: geoInput,
      annotations: findAnnotations,
    },
    async ({ latitude, longitude, radiusMeters, limit }) =>
      execFind(["towing"], latitude, longitude, radiusMeters, limit, TOWING_CAVEAT)
  );

  // 8. explain_service_search
  server.registerTool(
    "explain_service_search",
    {
      title: "Explain Service Search",
      description:
        "Show the Overpass QL query, OSM tag mappings, radius, and cache key that would be used for a given search — WITHOUT executing the query. Useful for debugging or understanding what data will be returned.",
      inputSchema: {
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radiusMeters: z.number().positive().max(50_000).default(5_000),
        limit: z.number().int().positive().max(50).default(20),
        category: z
          .string()
          .optional()
          .describe(
            "Optional category to explain (repair, tires, parts, fuel, inspection, towing). " +
              "Omit for the aggregate (repair + tires + parts + fuel) query."
          ),
      },
      annotations: { readOnlyHint: true as const, openWorldHint: false as const },
    },
    async ({ latitude, longitude, radiusMeters, limit, category }) => {
      const geoResult = validateGeoQuery(latitude, longitude, radiusMeters);
      if (!geoResult.valid) {
        return ok({ error: geoResult.reason });
      }

      let categories: ServiceCategory[];
      if (category) {
        if (!isSupportedCategory(category)) {
          return ok({
            error: `Unknown category "${category}". Supported: repair, tires, parts, fuel, inspection, towing.`,
          });
        }
        categories = [category as ServiceCategory];
      } else {
        categories = AGGREGATE_CATEGORIES;
      }

      const bounds = { lat: latitude, lon: longitude, radiusMeters };
      const ql = buildOverpassQL(categories, bounds, limit);
      const cacheKey = buildCacheKey(categories, bounds, limit);

      const tagsUsed: Record<string, Array<{ key: string; value: string }>> = {};
      for (const cat of categories) {
        tagsUsed[cat] = CATEGORY_TAGS[cat];
      }

      return ok({
        categories,
        tagsUsed,
        ql,
        cacheKey,
        bounds: { latitude, longitude, radiusMeters },
        limit,
        endpoint: process.env["OVERPASS_ENDPOINT"] ?? "https://overpass-api.de/api/interpreter",
        note: "Query not executed. Use find_auto_services or a category-specific tool to fetch live data.",
      });
    }
  );
}
