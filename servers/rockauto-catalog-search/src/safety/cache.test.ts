import { describe, expect, it } from "vitest";
import { TtlCache } from "./cache.js";

describe("TtlCache", () => {
  it("returns cached values before expiration", () => {
    let now = 1_000;
    const cache = new TtlCache<string>({ ttlMs: 500, now: () => now });

    cache.set("vehicle:camry", "cached result");
    now = 1_400;

    expect(cache.get("vehicle:camry")).toBe("cached result");
  });

  it("drops cached values after expiration", () => {
    let now = 1_000;
    const cache = new TtlCache<string>({ ttlMs: 500, now: () => now });

    cache.set("vehicle:camry", "cached result");
    now = 1_501;

    expect(cache.get("vehicle:camry")).toBeUndefined();
  });
});
