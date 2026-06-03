import { fetchJson } from "../http.js";
import { CATEGORY_TAGS, AGGREGATE_CATEGORIES, type ServiceCategory } from "../domain/categories.js";
import { normalizeElement, type OverpassElement, type ServiceResult } from "../domain/normalize.js";
import { TtlCache } from "../safety/cache.js";
import { SequentialRateLimiter } from "../safety/rate-limit.js";
import { OSM_ATTRIBUTION } from "../domain/normalize.js";

const DEFAULT_ENDPOINT =
  process.env["OVERPASS_ENDPOINT"] ?? "https://overpass-api.de/api/interpreter";

const USER_AGENT = "local-auto-services-mcp (https://github.com/CBaileyDev/MCPs)";

/** ODbL attribution string to include in every response. */
export const ATTRIBUTION =
  OSM_ATTRIBUTION +
  " | This service uses the Overpass API (https://overpass-api.de/). " +
  "Data may be incomplete or out of date. Opening hours and phone numbers should be verified directly.";

export interface OverpassResponse {
  elements: OverpassElement[];
}

export interface QueryBounds {
  lat: number;
  lon: number;
  radiusMeters: number;
}

export interface OverpassQueryResult {
  results: ServiceResult[];
  ql: string;
  cacheKey: string;
  attribution: string;
  tagsUsed: Record<ServiceCategory, Array<{ key: string; value: string }>>;
}

/**
 * Build the cache key for a query.
 * Exported so explain_service_search can display the exact key without executing the query.
 */
export function buildCacheKey(
  categories: ServiceCategory[],
  bounds: QueryBounds,
  limit: number
): string {
  const cats = [...categories].sort().join(",");
  return `${cats}|${bounds.lat.toFixed(6)},${bounds.lon.toFixed(6)},${bounds.radiusMeters}|${limit}`;
}

/**
 * Build the Overpass QL for a set of categories + bounds.
 * Always uses [out:json][timeout:25]; queries both nodes and ways/relations; uses `out center N`.
 */
export function buildOverpassQL(
  categories: ServiceCategory[],
  bounds: QueryBounds,
  limit: number
): string {
  const { lat, lon, radiusMeters } = bounds;
  const around = `around:${radiusMeters},${lat},${lon}`;

  // Collect all unique tag selectors for these categories.
  const selectors: Array<{ key: string; value: string }> = [];
  for (const cat of categories) {
    for (const sel of CATEGORY_TAGS[cat]) {
      // Avoid exact duplicates (e.g. towing and repair both map to shop=car_repair).
      if (!selectors.some((s) => s.key === sel.key && s.value === sel.value)) {
        selectors.push(sel);
      }
    }
  }

  // Build a union over nodes, ways, and relations for each selector.
  const unionParts: string[] = [];
  for (const sel of selectors) {
    const filter = `[${sel.key}=${sel.value}](${around})`;
    unionParts.push(`  node${filter};`);
    unionParts.push(`  way${filter};`);
    unionParts.push(`  relation${filter};`);
  }

  return `[out:json][timeout:25];\n(\n${unionParts.join("\n")}\n);\nout center ${limit};`;
}

/**
 * OverpassClient encapsulates the cache and rate limiter so tests can inject fresh instances.
 */
export interface OverpassClientOptions {
  cache?: TtlCache<ServiceResult[]>;
  limiter?: SequentialRateLimiter;
  endpoint?: string;
}

export function createOverpassClient(options: OverpassClientOptions = {}) {
  const cache =
    options.cache ??
    new TtlCache<ServiceResult[]>({ ttlMs: 5 * 60 * 1_000 /* 5 minutes */ });
  const limiter =
    options.limiter ??
    new SequentialRateLimiter({ minimumDelayMs: 1_000 /* 1 second between requests */ });
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;

  async function query(
    categories: ServiceCategory[],
    bounds: QueryBounds,
    limit: number
  ): Promise<OverpassQueryResult> {
    const ql = buildOverpassQL(categories, bounds, limit);
    const key = buildCacheKey(categories, bounds, limit);

    // Check the cache BEFORE hitting the rate limiter.
    const cached = cache.get(key);
    if (cached) {
      const tagsUsed = buildTagsUsed(categories);
      return { results: cached, ql, cacheKey: key, attribution: ATTRIBUTION, tagsUsed };
    }

    const results = await limiter.run(async () => {
      const body = new URLSearchParams({ data: ql }).toString();
      const response = await fetchJson<OverpassResponse>(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body,
        timeoutMs: 30_000,
      });

      // Normalize elements — skip any without coordinates.
      const normalized: ServiceResult[] = [];
      for (const el of response.elements) {
        // Assign the most specific category from the element's tags.
        const cat = detectCategory(el.tags ?? {}, categories);
        const result = normalizeElement(el, cat);
        if (result) normalized.push(result);
      }
      return normalized;
    });

    cache.set(key, results);

    const tagsUsed = buildTagsUsed(categories);
    return { results, ql, cacheKey: key, attribution: ATTRIBUTION, tagsUsed };
  }

  return { query, buildCacheKey };
}

/** Build a tagsUsed map for the given categories. */
function buildTagsUsed(
  categories: ServiceCategory[]
): Record<ServiceCategory, Array<{ key: string; value: string }>> {
  const out = {} as Record<ServiceCategory, Array<{ key: string; value: string }>>;
  for (const cat of categories) {
    out[cat] = CATEGORY_TAGS[cat];
  }
  return out;
}

/**
 * Detect which category best matches the element's tags.
 * Falls back to the first category when no tag match is found.
 */
function detectCategory(
  tags: Record<string, string>,
  categories: ServiceCategory[]
): ServiceCategory {
  for (const cat of categories) {
    for (const sel of CATEGORY_TAGS[cat]) {
      if (tags[sel.key] === sel.value) return cat;
    }
  }
  return categories[0];
}

// Module-level default client singleton (used by tools).
const defaultClient = createOverpassClient();

export async function queryServices(
  categories: ServiceCategory[],
  bounds: QueryBounds,
  limit: number
): Promise<OverpassQueryResult> {
  return defaultClient.query(categories, bounds, limit);
}

export { AGGREGATE_CATEGORIES };
