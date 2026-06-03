import { describe, expect, it } from "vitest";
import {
  CATEGORY_TAGS,
  SUPPORTED_CATEGORIES,
  AGGREGATE_CATEGORIES,
  isSupportedCategory,
} from "./categories.js";

describe("CATEGORY_TAGS", () => {
  it("has an entry for every supported category", () => {
    for (const cat of SUPPORTED_CATEGORIES) {
      expect(CATEGORY_TAGS[cat]).toBeDefined();
      expect(CATEGORY_TAGS[cat].length).toBeGreaterThan(0);
    }
  });

  it("repair maps to shop=car_repair", () => {
    expect(CATEGORY_TAGS["repair"]).toContainEqual({ key: "shop", value: "car_repair" });
  });

  it("tires maps to shop=tyres", () => {
    expect(CATEGORY_TAGS["tires"]).toContainEqual({ key: "shop", value: "tyres" });
  });

  it("parts maps to shop=car_parts", () => {
    expect(CATEGORY_TAGS["parts"]).toContainEqual({ key: "shop", value: "car_parts" });
  });

  it("fuel maps to amenity=fuel", () => {
    expect(CATEGORY_TAGS["fuel"]).toContainEqual({ key: "amenity", value: "fuel" });
  });

  it("inspection maps to amenity=vehicle_inspection", () => {
    expect(CATEGORY_TAGS["inspection"]).toContainEqual({
      key: "amenity",
      value: "vehicle_inspection",
    });
  });

  it("towing uses a best-effort mapping (shop=car_repair) due to no established OSM tag", () => {
    // Towing should map to car_repair as a best-effort fallback.
    expect(CATEGORY_TAGS["towing"]).toContainEqual({ key: "shop", value: "car_repair" });
  });
});

describe("AGGREGATE_CATEGORIES", () => {
  it("includes repair, tires, parts, fuel", () => {
    expect(AGGREGATE_CATEGORIES).toContain("repair");
    expect(AGGREGATE_CATEGORIES).toContain("tires");
    expect(AGGREGATE_CATEGORIES).toContain("parts");
    expect(AGGREGATE_CATEGORIES).toContain("fuel");
  });

  it("does not include inspection or towing (sparse / ambiguous coverage)", () => {
    expect(AGGREGATE_CATEGORIES).not.toContain("inspection");
    expect(AGGREGATE_CATEGORIES).not.toContain("towing");
  });
});

describe("isSupportedCategory", () => {
  it("returns true for known categories", () => {
    for (const cat of SUPPORTED_CATEGORIES) {
      expect(isSupportedCategory(cat)).toBe(true);
    }
  });

  it("returns false for unknown strings", () => {
    expect(isSupportedCategory("unknown_category")).toBe(false);
    expect(isSupportedCategory("")).toBe(false);
    expect(isSupportedCategory("car_wash")).toBe(false);
  });
});
