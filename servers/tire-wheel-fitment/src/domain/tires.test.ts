import { describe, expect, it } from "vitest";
import {
  parseTireSize,
  deriveDimensions,
  speedometerError,
  decodeServiceDescription,
  suggestReplacementSizes,
  type MetricTireComponents,
  type FlotationTireComponents
} from "./tires.js";

describe("parseTireSize — metric", () => {
  it("parses 225/45R17 correctly", () => {
    const result = parseTireSize("225/45R17");
    if (result.format !== "metric") throw new Error("Expected metric");
    expect(result.sectionWidthMm).toBe(225);
    expect(result.aspectRatio).toBe(45);
    expect(result.wheelDiameterIn).toBe(17);
    expect(result.loadIndex).toBeUndefined();
    expect(result.speedSymbol).toBeUndefined();
  });

  it("parses P-metric prefix 225/45R17", () => {
    const result = parseTireSize("P225/45R17");
    if (result.format !== "metric") throw new Error("Expected metric");
    expect(result.sectionWidthMm).toBe(225);
    expect(result.prefix).toBe("P");
  });

  it("parses LT prefix", () => {
    const result = parseTireSize("LT225/75R16");
    if (result.format !== "metric") throw new Error("Expected metric");
    expect(result.prefix).toBe("LT");
    expect(result.sectionWidthMm).toBe(225);
  });

  it("parses service description 225/45R17 94W", () => {
    const result = parseTireSize("225/45R17 94W");
    if (result.format !== "metric") throw new Error("Expected metric");
    expect(result.loadIndex).toBe(94);
    expect(result.speedSymbol).toBe("W");
  });

  it("parses 205/55R16", () => {
    const result = parseTireSize("205/55R16");
    if (result.format !== "metric") throw new Error("Expected metric");
    expect(result.sectionWidthMm).toBe(205);
    expect(result.aspectRatio).toBe(55);
    expect(result.wheelDiameterIn).toBe(16);
  });
});

describe("parseTireSize — flotation", () => {
  it("parses 31x10.50R15", () => {
    const result = parseTireSize("31x10.50R15");
    if (result.format !== "flotation") throw new Error("Expected flotation");
    expect(result.overallDiameterIn).toBe(31);
    expect(result.sectionWidthIn).toBe(10.5);
    expect(result.wheelDiameterIn).toBe(15);
  });
});

describe("deriveDimensions — metric reference values", () => {
  it("225/45R17: sidewall ≈ 3.99 in (101.25 mm), overall ≈ 24.97 in, circ ≈ 78.45 in, revs ≈ 807.6", () => {
    const components: MetricTireComponents = {
      sectionWidthMm: 225,
      aspectRatio: 45,
      wheelDiameterIn: 17
    };
    const d = deriveDimensions(components);
    expect(d.sidewallHeightMm).toBeCloseTo(101.25, 2);
    expect(d.sidewallHeightIn).toBeCloseTo(3.99, 1);
    expect(d.overallDiameterIn).toBeCloseTo(24.97, 1);
    expect(d.circumferenceIn).toBeCloseTo(78.45, 1);
    expect(d.revsPerMile).toBeCloseTo(807.6, 0);
  });

  it("205/55R16: overall diameter ≈ 24.88 in", () => {
    const components: MetricTireComponents = {
      sectionWidthMm: 205,
      aspectRatio: 55,
      wheelDiameterIn: 16
    };
    const d = deriveDimensions(components);
    expect(d.overallDiameterIn).toBeCloseTo(24.88, 1);
  });
});

describe("deriveDimensions — flotation reference values", () => {
  it("31x10.50R15: overallDiameterIn = 31 exactly, width 10.50, wheel 15", () => {
    const components: FlotationTireComponents = {
      overallDiameterIn: 31,
      sectionWidthIn: 10.5,
      wheelDiameterIn: 15
    };
    const d = deriveDimensions(components);
    expect(d.overallDiameterIn).toBe(31);
    expect(d.sectionWidthIn).toBe(10.5);
    expect(d.wheelDiameterIn).toBe(15);
    expect(d.circumferenceIn).toBeCloseTo(Math.PI * 31, 4);
    expect(d.revsPerMile).toBeCloseTo(63360 / (Math.PI * 31), 4);
  });
});

describe("speedometerError", () => {
  it("larger new tire: actual > indicated (speedo under-reads)", () => {
    const orig = parseTireSize("225/45R17");
    const origDims = deriveDimensions(orig);
    // Use a slightly larger tire: 225/50R17
    const newTire = parseTireSize("225/50R17");
    const newDims = deriveDimensions(newTire);
    const result = speedometerError(origDims.overallDiameterIn, newDims.overallDiameterIn, 60, "mph");
    expect(result.actualSpeed).toBeGreaterThan(60);
    expect(result.errorPercent).toBeGreaterThan(0);
  });

  it("smaller new tire: actual < indicated (speedo over-reads)", () => {
    const orig = parseTireSize("225/50R17");
    const origDims = deriveDimensions(orig);
    const newTire = parseTireSize("225/45R17");
    const newDims = deriveDimensions(newTire);
    const result = speedometerError(origDims.overallDiameterIn, newDims.overallDiameterIn, 60, "mph");
    expect(result.actualSpeed).toBeLessThan(60);
    expect(result.errorPercent).toBeLessThan(0);
  });

  it("identical sizes: error = 0", () => {
    const d = deriveDimensions({ sectionWidthMm: 225, aspectRatio: 45, wheelDiameterIn: 17 });
    const result = speedometerError(d.overallDiameterIn, d.overallDiameterIn, 60, "mph");
    expect(result.errorPercent).toBeCloseTo(0, 10);
    expect(result.actualSpeed).toBeCloseTo(60, 10);
  });

  it("returns correct speed unit in result", () => {
    const origDims = deriveDimensions({ sectionWidthMm: 225, aspectRatio: 45, wheelDiameterIn: 17 });
    const result = speedometerError(origDims.overallDiameterIn, origDims.overallDiameterIn, 100, "km/h");
    expect(result.speedUnit).toBe("km/h");
  });
});

describe("decodeServiceDescription", () => {
  it("decodes loadIndex 94 → 670 kg", () => {
    const result = decodeServiceDescription({ loadIndex: 94 });
    expect(result.loadCapacityKg).toBe(670);
    expect(result.loadCapacityLb).toBeCloseTo(670 * 2.20462, 1);
  });

  it("decodes speedSymbol W → 270 km/h", () => {
    const result = decodeServiceDescription({ speedSymbol: "W" });
    expect(result.maxSpeedKmh).toBe(270);
    expect(result.maxSpeedMph).toBeCloseTo(270 / 1.60934, 1);
  });

  it("decodes both loadIndex and speedSymbol", () => {
    const result = decodeServiceDescription({ loadIndex: 91, speedSymbol: "V" });
    expect(result.loadCapacityKg).toBe(615);
    expect(result.maxSpeedKmh).toBe(240);
  });

  it("returns unknown for an out-of-map loadIndex", () => {
    const result = decodeServiceDescription({ loadIndex: 50 });
    expect(result.loadCapacityKg).toBeNull();
    expect(result.loadIndexKnown).toBe(false);
  });

  it("returns unknown for an out-of-map speedSymbol", () => {
    const result = decodeServiceDescription({ speedSymbol: "Z" });
    expect(result.maxSpeedKmh).toBeNull();
    expect(result.speedSymbolKnown).toBe(false);
  });

  it("parses serviceDescription string '94W'", () => {
    const result = decodeServiceDescription({ serviceDescription: "94W" });
    expect(result.loadCapacityKg).toBe(670);
    expect(result.maxSpeedKmh).toBe(270);
  });

  it("decodes other standard values: 95→690kg, 100→800kg, 104→900kg", () => {
    expect(decodeServiceDescription({ loadIndex: 95 }).loadCapacityKg).toBe(690);
    expect(decodeServiceDescription({ loadIndex: 100 }).loadCapacityKg).toBe(800);
    expect(decodeServiceDescription({ loadIndex: 104 }).loadCapacityKg).toBe(900);
  });

  it("decodes speed symbols Q, S, T, H, V", () => {
    expect(decodeServiceDescription({ speedSymbol: "Q" }).maxSpeedKmh).toBe(160);
    expect(decodeServiceDescription({ speedSymbol: "S" }).maxSpeedKmh).toBe(180);
    expect(decodeServiceDescription({ speedSymbol: "T" }).maxSpeedKmh).toBe(190);
    expect(decodeServiceDescription({ speedSymbol: "H" }).maxSpeedKmh).toBe(210);
    expect(decodeServiceDescription({ speedSymbol: "V" }).maxSpeedKmh).toBe(240);
    expect(decodeServiceDescription({ speedSymbol: "Y" }).maxSpeedKmh).toBe(300);
  });
});

describe("suggestReplacementSizes", () => {
  it("all results fall within the tolerance", () => {
    const original = parseTireSize("225/45R17");
    const origDims = deriveDimensions(original);
    const suggestions = suggestReplacementSizes("225/45R17", 3);
    for (const s of suggestions) {
      const deltaPct = Math.abs(s.diameterDeltaPercent);
      expect(deltaPct).toBeLessThanOrEqual(3 + 0.001); // small float tolerance
    }
  });

  it("excludes out-of-tolerance combos", () => {
    const suggestions = suggestReplacementSizes("225/45R17", 1);
    for (const s of suggestions) {
      expect(Math.abs(s.diameterDeltaPercent)).toBeLessThanOrEqual(1 + 0.001);
    }
  });

  it("returns at most 20 results", () => {
    const suggestions = suggestReplacementSizes("225/45R17", 3);
    expect(suggestions.length).toBeLessThanOrEqual(20);
  });

  it("results are sorted by absolute diameter delta ascending", () => {
    const suggestions = suggestReplacementSizes("225/45R17", 3);
    for (let i = 1; i < suggestions.length; i++) {
      expect(Math.abs(suggestions[i].diameterDeltaPercent)).toBeGreaterThanOrEqual(
        Math.abs(suggestions[i - 1].diameterDeltaPercent) - 0.0001
      );
    }
  });

  it("includes speedo error in each candidate", () => {
    const suggestions = suggestReplacementSizes("225/45R17", 3);
    for (const s of suggestions) {
      expect(typeof s.speedometerErrorPercent).toBe("number");
    }
  });

  it("respects targetWheelDiameterIn for plus-sizing", () => {
    const suggestions = suggestReplacementSizes("225/45R17", 3, 18);
    for (const s of suggestions) {
      expect(s.wheelDiameterIn).toBe(18);
    }
  });

  it("default (no targetWheelDiameterIn) searches multiple wheel diameters — at least one candidate has a different wheel than original 17", () => {
    const suggestions = suggestReplacementSizes("225/45R17", 3);
    const hasDifferentWheel = suggestions.some((s) => s.wheelDiameterIn !== 17);
    expect(hasDifferentWheel).toBe(true);
  });
});
