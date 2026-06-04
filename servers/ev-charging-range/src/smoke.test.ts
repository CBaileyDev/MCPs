// Live smoke test — hits the real NREL AFDC API.
//
// OPT-IN: only runs when SMOKE=1 (see `npm run smoke`). The default `npm test`
// run (and the gating CI matrix) skips this file. AFDC works with the built-in
// DEMO_KEY; the `npm run smoke` script sets AFDC_API_KEY=DEMO_KEY explicitly.
// DEMO_KEY is rate-limited, so a 429/5xx/timeout skips rather than fails.
//
// San Francisco reliably has many public chargers, so we assert a non-empty
// result with valid coordinates. The (0,0) "Null Island" check is a regression
// guard for a real past bug where bad coords slipped through.
import { describe, expect, it } from "vitest";
import { findNearest } from "./providers/afdc.js";

const RUN = Boolean(process.env.SMOKE);

function isTransient(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e);
  return /\b(429|502|503|504)\b/.test(m) || /timeout|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed/i.test(m);
}

interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

describe.skipIf(!RUN)("ev-charging live smoke", () => {
  it("finds real EV chargers near San Francisco with valid (non-Null-Island) coordinates", async (ctx) => {
    let stations: Station[];
    try {
      const r = await findNearest({ lat: 37.7749, lon: -122.4194, radiusMiles: 10, limit: 5 });
      stations = r.stations as unknown as Station[];
    } catch (e) {
      if (isTransient(e)) return ctx.skip();
      throw e;
    }
    expect(Array.isArray(stations)).toBe(true);
    expect(stations.length).toBeGreaterThanOrEqual(1);
    const s = stations[0];
    expect(typeof s.id).toBe("string");
    expect(s.name).toBeTruthy();
    expect(typeof s.lat).toBe("number");
    expect(typeof s.lon).toBe("number");
    // Regression guard: a prior bug surfaced (0,0) "Null Island" coordinates.
    expect(Math.abs(s.lat) + Math.abs(s.lon)).toBeGreaterThan(0);
  }, 45_000);
});
