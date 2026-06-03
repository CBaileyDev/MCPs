import type { ServiceCategory } from "./categories.js";

/** OSM attribution string required by ODbL. */
export const OSM_ATTRIBUTION =
  "Data © OpenStreetMap contributors, available under the Open Database Licence (ODbL). " +
  "https://www.openstreetmap.org/copyright";

export interface ServiceResult {
  /** Unique identifier: `${osmType}/${osmId}` */
  id: string;
  name: string | null;
  category: ServiceCategory;
  lat: number;
  lon: number;
  /** Raw OSM tags for the element. */
  tags: Record<string, string>;
  phone?: string;
  website?: string;
  openingHours?: string;
  /** Human-readable address built from addr:* tags when available. */
  address?: string;
  source: "openstreetmap";
  osmType: "node" | "way" | "relation";
  osmId: number;
  attribution: string;
}

/** Raw element shape returned by the Overpass API. */
export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  /** Present on `node` elements. */
  lat?: number;
  /** Present on `node` elements. */
  lon?: number;
  /** Present on `way`/`relation` elements when `out center` is used. */
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Build a human-readable address from OSM addr:* tags.
 * Returns undefined when no address tags are present.
 */
function buildAddress(tags: Record<string, string>): string | undefined {
  const parts: string[] = [];
  const housenumber = tags["addr:housenumber"];
  const street = tags["addr:street"];
  const city = tags["addr:city"];
  const state = tags["addr:state"];
  const postcode = tags["addr:postcode"];

  if (housenumber && street) {
    parts.push(`${housenumber} ${street}`);
  } else if (street) {
    parts.push(street);
  }
  if (city) parts.push(city);
  if (state) parts.push(state);
  if (postcode) parts.push(postcode);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

/**
 * Normalize an Overpass element into a ServiceResult.
 * Tolerant of missing tags and sparse data.
 */
export function normalizeElement(
  element: OverpassElement,
  category: ServiceCategory
): ServiceResult | null {
  // Extract coordinates — nodes have top-level lat/lon; ways/relations use center.
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  if (lat === undefined || lon === undefined) {
    // Can't place the element on a map — skip it.
    return null;
  }

  const tags = element.tags ?? {};

  return {
    id: `${element.type}/${element.id}`,
    name: tags["name"] ?? null,
    category,
    lat,
    lon,
    tags,
    phone: tags["phone"] ?? tags["contact:phone"] ?? undefined,
    website: tags["website"] ?? tags["contact:website"] ?? tags["url"] ?? undefined,
    openingHours: tags["opening_hours"] ?? undefined,
    address: buildAddress(tags),
    source: "openstreetmap",
    osmType: element.type,
    osmId: element.id,
    attribution: OSM_ATTRIBUTION,
  };
}
