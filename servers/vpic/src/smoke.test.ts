// Live smoke test — hits the real NHTSA vPIC API.
//
// OPT-IN: only runs when SMOKE=1 (see `npm run smoke`). The default `npm test`
// run (and the gating CI matrix) skips this file, so the hermetic suite stays
// network-free and needs no secrets.
//
// Assertions use STABLE facts (a fixed VIN's decode, a make-count floor) so the
// test catches API drift or an outage — not normal data churn. Any upstream
// transient (429/5xx/timeout) skips rather than fails, so it never cries wolf.
import { describe, expect, it } from "vitest";
import { decodeVin, getAllMakes, validateMakeModelYear } from "./client.js";

const RUN = Boolean(process.env.SMOKE);

function isTransient(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e);
  return /\b(429|502|503|504)\b/.test(m) || /timeout|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed/i.test(m);
}

describe.skipIf(!RUN)("vpic live smoke", () => {
  it("decodes a known VIN to Honda Accord 2003", async (ctx) => {
    let r: Record<string, unknown>;
    try {
      r = (await decodeVin("1HGCM82633A004352")) as Record<string, unknown>;
    } catch (e) {
      if (isTransient(e)) return ctx.skip();
      throw e;
    }
    expect(r.Make).toBe("HONDA");
    expect(r.Model).toBe("Accord");
    expect(String(r.ModelYear)).toBe("2003");
  }, 30_000);

  it("lists a large, stable set of makes", async (ctx) => {
    let makes: unknown[];
    try {
      makes = (await getAllMakes()) as unknown[];
    } catch (e) {
      if (isTransient(e)) return ctx.skip();
      throw e;
    }
    expect(Array.isArray(makes)).toBe(true);
    // vPIC knows thousands of makes; a low floor catches an empty/broken response.
    expect(makes.length).toBeGreaterThan(100);
  }, 30_000);

  it("validates Honda Accord 2003 as a real make/model/year", async (ctx) => {
    let r: Record<string, unknown>;
    try {
      r = (await validateMakeModelYear("Honda", "Accord", 2003)) as Record<string, unknown>;
    } catch (e) {
      if (isTransient(e)) return ctx.skip();
      throw e;
    }
    expect(r.valid).toBe(true);
  }, 30_000);
});
