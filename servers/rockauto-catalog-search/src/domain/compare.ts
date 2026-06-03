import type { NormalizedPart, PartComparison } from "./types.js";

export function compareParts(parts: NormalizedPart[]): PartComparison {
  const sorted = [...parts].sort((left, right) => {
    if (left.price && right.price) {
      return left.price.amount - right.price.amount;
    }

    if (left.price) {
      return -1;
    }

    if (right.price) {
      return 1;
    }

    return left.brand.localeCompare(right.brand);
  });

  const cheapest = sorted.find(part => part.price);
  const unknownPriceCount = sorted.filter(part => !part.price).length;
  const summaryParts: string[] = [];

  if (cheapest?.price) {
    summaryParts.push(
      `${cheapest.brand} ${cheapest.partNumber} is the lowest listed price at ${cheapest.price.display}.`
    );
  } else {
    summaryParts.push("No option exposes a numeric price.");
  }

  if (unknownPriceCount > 0) {
    summaryParts.push(
      `${unknownPriceCount} ${unknownPriceCount === 1 ? "option does" : "options do"} not expose a numeric price.`
    );
  }

  return {
    parts: sorted,
    summary: summaryParts.join(" ")
  };
}
