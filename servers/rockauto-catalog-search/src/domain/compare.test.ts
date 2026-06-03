import { describe, expect, it } from "vitest";
import { compareParts } from "./compare.js";
import type { NormalizedPart } from "./types.js";

const basePart: NormalizedPart = {
  id: "part-1",
  brand: "ACME",
  partNumber: "12345",
  title: "Brake Pad",
  price: { amount: 10, currency: "USD", display: "$10.00" },
  availability: "In stock",
  fitmentNotes: [],
  sourceUrl: "https://www.rockauto.com/en/moreinfo.php?pk=1",
  fetchedAt: "2026-06-03T00:00:00.000Z"
};

describe("compareParts", () => {
  it("orders parts by price and explains the cheapest option", () => {
    const result = compareParts([
      { ...basePart, id: "expensive", brand: "Brand B", price: { amount: 24.5, currency: "USD", display: "$24.50" } },
      { ...basePart, id: "cheap", brand: "Brand A", price: { amount: 8.99, currency: "USD", display: "$8.99" } }
    ]);

    expect(result.parts.map(part => part.id)).toEqual(["cheap", "expensive"]);
    expect(result.summary).toContain("Brand A 12345 is the lowest listed price at $8.99.");
  });

  it("keeps parts without numeric prices after priced parts", () => {
    const result = compareParts([
      { ...basePart, id: "unknown", price: null },
      { ...basePart, id: "priced", price: { amount: 11.25, currency: "USD", display: "$11.25" } }
    ]);

    expect(result.parts.map(part => part.id)).toEqual(["priced", "unknown"]);
    expect(result.summary).toContain("1 option does not expose a numeric price.");
  });
});
