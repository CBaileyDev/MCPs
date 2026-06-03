import { describe, expect, it } from "vitest";
import { summarize, type Listing } from "./provider.js";

function listing(price: number): Listing {
  return { title: `item ${price}`, price, currency: "USD", url: "https://x", marketplace: "ebay" };
}

describe("summarize", () => {
  it("sorts by price and reports the lowest", () => {
    const result = summarize("brake pads", [listing(40), listing(20), listing(30)]);
    expect(result.lowest?.price).toBe(20);
    expect(result.listings.map(l => l.price)).toEqual([20, 30, 40]);
  });

  it("computes an odd-length median", () => {
    expect(summarize("q", [listing(10), listing(20), listing(30)]).median).toBe(20);
  });

  it("computes an even-length median as the mean of the middle two", () => {
    expect(summarize("q", [listing(10), listing(20), listing(30), listing(40)]).median).toBe(25);
  });

  it("handles an empty result set", () => {
    const result = summarize("q", []);
    expect(result.lowest).toBeUndefined();
    expect(result.median).toBeUndefined();
  });
});
