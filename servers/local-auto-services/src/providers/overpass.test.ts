import { afterEach, describe, expect, it, vi } from "vitest";
import { createOverpassClient, buildCacheKey, buildOverpassQL } from "./overpass.js";
import { TtlCache } from "../safety/cache.js";
import { SequentialRateLimiter } from "../safety/rate-limit.js";
import type { ServiceResult } from "../domain/normalize.js";

/**
 * Real-shaped Overpass API fixture — one node and one way-with-center.
 */
const FIXTURE_RESPONSE = {
  version: 0.6,
  generator: "Overpass API",
  elements: [
    {
      type: "node",
      id: 2523660944,
      lat: 40.702026,
      lon: -73.9929402,
      tags: {
        name: "New Xcell Auto Repair",
        shop: "car_repair",
        phone: "+1-718-555-0100",
        opening_hours: "Mo-Fr 08:00-18:00",
        "addr:housenumber": "123",
        "addr:street": "Main St",
        "addr:city": "Brooklyn",
        "addr:state": "NY",
      },
    },
    {
      type: "way",
      id: 987654321,
      // ways don't have top-level lat/lon; they have center when out center is used
      center: { lat: 40.71, lon: -73.99 },
      tags: {
        name: "Brooklyn Auto Parts",
        shop: "car_parts",
        website: "https://example.com",
      },
    },
  ],
};

function makeFreshClient() {
  // Inject a no-op sleep so rate limiter never stalls tests.
  const limiter = new SequentialRateLimiter({
    minimumDelayMs: 0,
    sleep: () => Promise.resolve(),
  });
  const cache = new TtlCache<ServiceResult[]>({ ttlMs: 5 * 60 * 1_000 });
  return createOverpassClient({ cache, limiter });
}

function mockFetch(json: unknown): void {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => json,
  })) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe("buildOverpassQL", () => {
  it("includes [out:json] and around: filter", () => {
    const ql = buildOverpassQL(["repair"], { lat: 40.71, lon: -74.0, radiusMeters: 5000 }, 20);
    expect(ql).toContain("[out:json]");
    expect(ql).toContain("around:5000,40.71,-74");
    expect(ql).toContain("out center 20");
  });

  it("de-duplicates selectors (towing and repair both map to shop=car_repair)", () => {
    const ql = buildOverpassQL(
      ["repair", "towing"],
      { lat: 40.71, lon: -74.0, radiusMeters: 5000 },
      20
    );
    // shop=car_repair should appear only once in the union, not doubled.
    const count = (ql.match(/shop=car_repair/g) ?? []).length;
    // Appears in node + way + relation = 3 times for one unique selector.
    expect(count).toBe(3);
  });

  it("emits node, way, and relation clauses for each selector", () => {
    const ql = buildOverpassQL(["fuel"], { lat: 40.71, lon: -74.0, radiusMeters: 1000 }, 10);
    expect(ql).toContain("node[amenity=fuel]");
    expect(ql).toContain("way[amenity=fuel]");
    expect(ql).toContain("relation[amenity=fuel]");
  });
});

describe("createOverpassClient.query", () => {
  it("sends POST with User-Agent header and QL contains [out:json] and around:", async () => {
    mockFetch(FIXTURE_RESPONSE);

    const client = makeFreshClient();
    const bounds = { lat: 40.71, lon: -74.0, radiusMeters: 2000 };
    await client.query(["repair"], bounds, 20);

    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe("POST");

    // Headers check
    const headers = init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBeTruthy();
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    // Body contains URL-encoded QL
    const body = init?.body as string;
    const decoded = decodeURIComponent(body.replace(/^data=/, ""));
    expect(decoded).toContain("[out:json]");
    expect(decoded).toContain("around:");
  });

  it("normalizes a node (top-level lat/lon) correctly", async () => {
    mockFetch(FIXTURE_RESPONSE);

    const client = makeFreshClient();
    const { results } = await client.query(["repair", "parts"], { lat: 40.71, lon: -74.0, radiusMeters: 2000 }, 20);

    const node = results.find((r) => r.osmType === "node" && r.osmId === 2523660944);
    expect(node).toBeDefined();
    expect(node!.lat).toBe(40.702026);
    expect(node!.lon).toBe(-73.9929402);
    expect(node!.name).toBe("New Xcell Auto Repair");
    expect(node!.phone).toBe("+1-718-555-0100");
    expect(node!.address).toBe("123 Main St, Brooklyn, NY");
  });

  it("normalizes a way (center coordinates) correctly", async () => {
    mockFetch(FIXTURE_RESPONSE);

    const client = makeFreshClient();
    const { results } = await client.query(["repair", "parts"], { lat: 40.71, lon: -74.0, radiusMeters: 2000 }, 20);

    const way = results.find((r) => r.osmType === "way" && r.osmId === 987654321);
    expect(way).toBeDefined();
    expect(way!.lat).toBe(40.71);
    expect(way!.lon).toBe(-73.99);
    expect(way!.name).toBe("Brooklyn Auto Parts");
    expect(way!.website).toBe("https://example.com");
  });

  it("caches results — a second identical call does not call fetch again", async () => {
    mockFetch(FIXTURE_RESPONSE);

    const client = makeFreshClient();
    const bounds = { lat: 40.71, lon: -74.0, radiusMeters: 3000 };
    const categories = ["repair"] as const;
    const limit = 20;

    await client.query([...categories], bounds, limit);
    await client.query([...categories], bounds, limit);

    // fetch should only have been called once; the second call hit the cache.
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
  });

  it("returns attribution in results", async () => {
    mockFetch(FIXTURE_RESPONSE);

    const client = makeFreshClient();
    const { attribution } = await client.query(
      ["repair"],
      { lat: 40.71, lon: -74.0, radiusMeters: 1000 },
      20
    );
    expect(attribution).toContain("OpenStreetMap");
    expect(attribution).toContain("ODbL");
  });
});

describe("buildCacheKey", () => {
  it("produces identical keys for identical inputs", () => {
    const a = buildCacheKey(["repair", "fuel"], { lat: 40.71, lon: -74.0, radiusMeters: 5000 }, 20);
    const b = buildCacheKey(["fuel", "repair"], { lat: 40.71, lon: -74.0, radiusMeters: 5000 }, 20);
    // Categories are sorted, so order shouldn't matter.
    expect(a).toBe(b);
  });

  it("produces different keys for different radii", () => {
    const a = buildCacheKey(["repair"], { lat: 40.71, lon: -74.0, radiusMeters: 1000 }, 20);
    const b = buildCacheKey(["repair"], { lat: 40.71, lon: -74.0, radiusMeters: 5000 }, 20);
    expect(a).not.toBe(b);
  });
});
