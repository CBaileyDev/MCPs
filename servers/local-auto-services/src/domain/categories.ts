/** A single OSM tag selector (key=value filter). */
export interface OsmTagSelector {
  key: string;
  value: string;
}

/**
 * Supported service categories.
 * "towing" uses a best-effort mapping — see TOWING_CAVEAT.
 */
export const SUPPORTED_CATEGORIES = [
  "repair",
  "tires",
  "parts",
  "fuel",
  "inspection",
  "towing",
] as const;

export type ServiceCategory = (typeof SUPPORTED_CATEGORIES)[number];

/** Human-readable label for each category. */
export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  repair: "Auto Repair Shop",
  tires: "Tire Shop",
  parts: "Auto Parts Store",
  fuel: "Fuel Station",
  inspection: "Vehicle Inspection",
  towing: "Towing / Roadside Assistance",
};

/**
 * OSM tag selectors for each category.
 * Each selector produces a filter like `[key=value]` in Overpass QL.
 */
export const CATEGORY_TAGS: Record<ServiceCategory, OsmTagSelector[]> = {
  repair: [{ key: "shop", value: "car_repair" }],
  tires: [{ key: "shop", value: "tyres" }],
  parts: [{ key: "shop", value: "car_parts" }],
  fuel: [{ key: "amenity", value: "fuel" }],
  inspection: [{ key: "amenity", value: "vehicle_inspection" }],
  // Towing has no established OSM tag. We query car_repair as best-effort.
  // The tool output always includes TOWING_CAVEAT.
  towing: [{ key: "shop", value: "car_repair" }],
};

/**
 * Categories included in the aggregate find_auto_services tool.
 * Inspection and towing are omitted from the aggregate due to sparse/ambiguous coverage.
 */
export const AGGREGATE_CATEGORIES: ServiceCategory[] = ["repair", "tires", "parts", "fuel"];

/**
 * Caveat text for towing results — always included in towing tool output.
 */
export const TOWING_CAVEAT =
  "Note: OpenStreetMap has no well-established tag for dedicated towing services. " +
  "These results show auto repair shops (shop=car_repair), which may offer towing/roadside assistance. " +
  "Coverage of dedicated tow operators in OSM is limited. Always call ahead to confirm towing availability.";

/**
 * Caveat text for inspection results.
 */
export const INSPECTION_CAVEAT =
  "Note: vehicle inspection site coverage (amenity=vehicle_inspection) is sparse in many regions. " +
  "Results may be incomplete. Check with local DMV or state resources for official inspection stations.";

export function isSupportedCategory(value: string): value is ServiceCategory {
  return (SUPPORTED_CATEGORIES as readonly string[]).includes(value);
}
