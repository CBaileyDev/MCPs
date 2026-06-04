// Live smoke test — hits the real NHTSA recalls + vPIC APIs.
//
// OPT-IN: only runs when SMOKE=1 (see `npm run smoke`). The default `npm test`
// run (and the gating CI matrix) skips this file, so the hermetic suite stays
// network-free.
//
// Anchored on a fixed, decades-old vehicle (2003 Honda Accord) whose recall set
// is effectively frozen — we assert a stable lower bound, not an exact count, so
// normal NHTSA data churn won't flake it. Transient upstream errors skip.
import { describe, expect, it } from "vitest";
import { getRecalls, getRecallsByVin } from "./client.js";

const RUN = Boolean(process.env.SMOKE);

function isTransient(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e);
  return /\b(429|502|503|504)\b/.test(m) || /timeout|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed/i.test(m);
}

interface VinRecalls {
  decoded: { make: string; model: string; modelYear: number };
  recalls: Array<Record<string, unknown>>;
}

describe.skipIf(!RUN)("repair-info live smoke", () => {
  it("decodes a VIN and returns the 2003 Accord recall set", async (ctx) => {
    let r: VinRecalls;
    try {
      r = (await getRecallsByVin("1HGCM82633A004352")) as unknown as VinRecalls;
    } catch (e) {
      if (isTransient(e)) return ctx.skip();
      throw e;
    }
    expect(r.decoded.make).toBe("HONDA");
    expect(r.decoded.model).toBe("Accord");
    expect(r.decoded.modelYear).toBe(2003);
    expect(Array.isArray(r.recalls)).toBe(true);
    // 24 recalls at last check; assert a stable floor so an added recall won't flake.
    expect(r.recalls.length).toBeGreaterThanOrEqual(20);
    expect(r.recalls[0].NHTSACampaignNumber).toBeTruthy();
  }, 30_000);

  it("returns recalls by make/model/year", async (ctx) => {
    let res: unknown;
    try {
      res = await getRecalls("Honda", "Accord", 2003);
    } catch (e) {
      if (isTransient(e)) return ctx.skip();
      throw e;
    }
    // Tolerate either a bare array or an object that wraps the array.
    const arr = Array.isArray(res)
      ? res
      : ((res as { recalls?: unknown[]; results?: unknown[]; Results?: unknown[] }).recalls ??
         (res as { results?: unknown[] }).results ??
         (res as { Results?: unknown[] }).Results);
    expect(Array.isArray(arr)).toBe(true);
    expect((arr as unknown[]).length).toBeGreaterThanOrEqual(20);
  }, 30_000);
});
