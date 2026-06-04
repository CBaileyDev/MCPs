// Live smoke test — hits the real FuelEconomy.gov API.
//
// OPT-IN: only runs when SMOKE=1 (see `npm run smoke`). The default `npm test`
// run (and the gating CI matrix) skips this file.
//
// EPA ratings for a past model year are fixed, so walking 2012 Honda Accord to a
// vehicle record and asserting a positive combined MPG is stable. We assert the
// SHAPE of fuel prices (numeric-or-null keys), never the volatile dollar amounts.
// Transient upstream errors skip.
import { describe, expect, it } from "vitest";
import { getFuelPrices, getMakes, getModels, getOptions, getVehicle } from "./providers/fueleconomy.js";
import { normalizeVehicle } from "./domain/efficiency.js";

const RUN = Boolean(process.env.SMOKE);

function isTransient(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e);
  return /\b(429|502|503|504)\b/.test(m) || /timeout|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed/i.test(m);
}

describe.skipIf(!RUN)("fuel-economy live smoke", () => {
  it("lists 2012 makes including Honda", async (ctx) => {
    let makes: Array<{ text: string; value: string }>;
    try {
      makes = await getMakes(2012);
    } catch (e) {
      if (isTransient(e)) return ctx.skip();
      throw e;
    }
    expect(Array.isArray(makes)).toBe(true);
    expect(makes.some((m) => m.text === "Honda" || m.value === "Honda")).toBe(true);
  }, 30_000);

  it("walks 2012 Honda Accord to an EPA vehicle record with a positive combined MPG", async (ctx) => {
    let combinedMpg: unknown;
    let make: string;
    try {
      const models = await getModels(2012, "Honda");
      expect(models.some((m) => m.text === "Accord" || m.value === "Accord")).toBe(true);
      const options = await getOptions(2012, "Honda", "Accord");
      expect(options.length).toBeGreaterThan(0);
      const vehicle = normalizeVehicle(await getVehicle(options[0].vehicleId), options[0].vehicleId);
      make = vehicle.make;
      combinedMpg = vehicle.efficiencyRating.combinedMpg;
    } catch (e) {
      if (isTransient(e)) return ctx.skip();
      throw e;
    }
    expect(make.toLowerCase()).toContain("honda");
    expect(typeof combinedMpg).toBe("number");
    expect(combinedMpg as number).toBeGreaterThan(0);
  }, 45_000);

  it("returns fuel-price fields as numeric-or-null (shape only, never the volatile amounts)", async (ctx) => {
    let prices: Record<string, unknown>;
    try {
      prices = (await getFuelPrices()) as unknown as Record<string, unknown>;
    } catch (e) {
      if (isTransient(e)) return ctx.skip();
      throw e;
    }
    for (const key of ["regular", "premium", "diesel", "electric"]) {
      expect(key in prices).toBe(true);
      expect(prices[key] === null || typeof prices[key] === "number").toBe(true);
    }
  }, 30_000);
});
