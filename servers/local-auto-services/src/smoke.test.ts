// Live smoke test — hits the real OpenStreetMap Overpass API.
//
// OPT-IN: only runs when SMOKE=1 (see `npm run smoke`). The default `npm test`
// run (and the gating CI matrix) skips this file.
//
// Overpass is a free, frequently-overloaded public endpoint — 429/504/timeout is
// routine and is NOT our drift, so those skip. We assert on the result SHAPE
// (an array of coordinate-bearing OSM results) for a dense city center, which is
// stable. A 4xx or a malformed response still fails (that would be real drift).
import { describe, expect, it } from "vitest";
import { queryServices } from "./providers/overpass.js";

const RUN = Boolean(process.env.SMOKE);

function isTransient(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e);
  return /\b(429|502|503|504)\b/.test(m) || /timeout|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed/i.test(m);
}

describe.skipIf(!RUN)("local-auto-services live smoke", () => {
  it("finds repair shops near downtown Pittsburgh (tolerant of Overpass overload)", async (ctx) => {
    let results: Array<Record<string, unknown>>;
    try {
      const r = await queryServices(["repair"], { lat: 40.4406, lon: -79.9959, radiusMeters: 8_000 }, 10);
      results = r.results as unknown as Array<Record<string, unknown>>;
    } catch (e) {
      if (isTransient(e)) return ctx.skip();
      throw e;
    }
    expect(Array.isArray(results)).toBe(true);
    // A major city center has mapped car-repair shops; empty here means breakage.
    expect(results.length).toBeGreaterThanOrEqual(1);
    const first = results[0];
    expect(typeof first.lat).toBe("number");
    expect(typeof first.lon).toBe("number");
    expect(first.source).toBe("openstreetmap");
  }, 60_000);
});
