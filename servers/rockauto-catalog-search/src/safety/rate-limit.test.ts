import { describe, expect, it } from "vitest";
import { SequentialRateLimiter } from "./rate-limit.js";

describe("SequentialRateLimiter", () => {
  it("delays the next operation until the minimum interval has elapsed", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const limiter = new SequentialRateLimiter({
      minimumDelayMs: 1_000,
      now: () => now,
      sleep: async delayMs => {
        sleeps.push(delayMs);
        now += delayMs;
      }
    });

    await limiter.run(async () => "first");
    now = 250;
    await limiter.run(async () => "second");

    expect(sleeps).toEqual([750]);
  });

  it("runs queued operations in call order", async () => {
    const events: string[] = [];
    const limiter = new SequentialRateLimiter({
      minimumDelayMs: 0,
      now: () => 0,
      sleep: async () => undefined
    });

    const first = limiter.run(async () => {
      events.push("first");
      return "first-result";
    });
    const second = limiter.run(async () => {
      events.push("second");
      return "second-result";
    });

    expect(await Promise.all([first, second])).toEqual(["first-result", "second-result"]);
    expect(events).toEqual(["first", "second"]);
  });
});
