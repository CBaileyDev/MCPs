import { describe, expect, it } from "vitest";
import { estimateAnnualFuelCost, estimateTripEnergyCost } from "./cost.js";

describe("estimateAnnualFuelCost — gasoline", () => {
  it("computes annual cost correctly for gasoline", () => {
    // 15000 miles / 30 mpg = 500 gallons * $4.00 = $2000
    const result = estimateAnnualFuelCost({ annualMiles: 15000, mpg: 30, fuelPricePerUnit: 4.0 });
    expect(result.result).toBe(2000);
    expect(result.assumptions).toMatchObject({ annualMiles: 15000, mpg: 30, fuelPricePerUnit: 4.0, fuelType: "gasoline" });
    expect(result.caveats.length).toBeGreaterThan(0);
  });

  it("rounds to cents", () => {
    // 15000 / 29 = 517.241... * 3.999 = 2068.48...
    const result = estimateAnnualFuelCost({ annualMiles: 15000, mpg: 29, fuelPricePerUnit: 3.999 });
    expect(result.result).toBe(Math.round((15000 / 29) * 3.999 * 100) / 100);
  });

  it("returns null and caveat when mpg is 0", () => {
    const result = estimateAnnualFuelCost({ annualMiles: 15000, mpg: 0, fuelPricePerUnit: 4.0 });
    expect(result.result).toBeNull();
    expect(result.caveats.some(c => c.includes("greater than 0"))).toBe(true);
  });

  it("returns 0 cost when annualMiles is 0", () => {
    const result = estimateAnnualFuelCost({ annualMiles: 0, mpg: 30, fuelPricePerUnit: 4.0 });
    expect(result.result).toBe(0);
  });

  it("echoes all inputs in assumptions", () => {
    const result = estimateAnnualFuelCost({ annualMiles: 12000, mpg: 25, fuelPricePerUnit: 3.5 });
    expect(result.assumptions.annualMiles).toBe(12000);
    expect(result.assumptions.mpg).toBe(25);
    expect(result.assumptions.fuelPricePerUnit).toBe(3.5);
  });
});

describe("estimateAnnualFuelCost — electric", () => {
  it("computes annual cost correctly for electric", () => {
    // 15000 miles * 30 kWh/100mi / 100 = 4500 kWh * $0.15 = $675
    const result = estimateAnnualFuelCost({ annualMiles: 15000, kwhPer100mi: 30, fuelPricePerUnit: 0.15 });
    expect(result.result).toBe(675);
    expect(result.assumptions).toMatchObject({ annualMiles: 15000, kwhPer100mi: 30, fuelPricePerUnit: 0.15, fuelType: "electric" });
  });

  it("returns null when kwhPer100mi is 0", () => {
    const result = estimateAnnualFuelCost({ annualMiles: 15000, kwhPer100mi: 0, fuelPricePerUnit: 0.15 });
    expect(result.result).toBeNull();
  });
});

describe("estimateAnnualFuelCost — edge cases", () => {
  it("returns null when neither mpg nor kwhPer100mi is provided", () => {
    const result = estimateAnnualFuelCost({ annualMiles: 15000, fuelPricePerUnit: 4.0 });
    expect(result.result).toBeNull();
    expect(result.caveats.some(c => c.includes("mpg") && c.includes("kwhPer100mi"))).toBe(true);
  });

  it("returns null when both mpg and kwhPer100mi are provided", () => {
    const result = estimateAnnualFuelCost({ annualMiles: 15000, mpg: 30, kwhPer100mi: 30, fuelPricePerUnit: 4.0 });
    expect(result.result).toBeNull();
    expect(result.caveats.some(c => c.includes("not both"))).toBe(true);
  });
});

describe("estimateTripEnergyCost — gasoline", () => {
  it("computes trip cost correctly for gasoline", () => {
    // 300 miles / 30 mpg = 10 gallons * $4.00 = $40
    const result = estimateTripEnergyCost({ miles: 300, mpg: 30, fuelPricePerUnit: 4.0 });
    expect(result.result).toBe(40);
    expect(result.assumptions).toMatchObject({ miles: 300, mpg: 30, fuelPricePerUnit: 4.0, fuelType: "gasoline" });
  });

  it("returns null for zero mpg", () => {
    const result = estimateTripEnergyCost({ miles: 300, mpg: 0, fuelPricePerUnit: 4.0 });
    expect(result.result).toBeNull();
  });

  it("returns 0 cost for 0 miles", () => {
    const result = estimateTripEnergyCost({ miles: 0, mpg: 30, fuelPricePerUnit: 4.0 });
    expect(result.result).toBe(0);
  });
});

describe("estimateTripEnergyCost — electric", () => {
  it("computes trip cost correctly for electric", () => {
    // 250 miles * 33 kWh/100mi / 100 = 82.5 kWh * $0.15 = $12.38 (rounded)
    const result = estimateTripEnergyCost({ miles: 250, kwhPer100mi: 33, fuelPricePerUnit: 0.15 });
    expect(result.result).toBe(Math.round(250 * 33 / 100 * 0.15 * 100) / 100);
    expect(result.assumptions).toMatchObject({ miles: 250, kwhPer100mi: 33, fuelPricePerUnit: 0.15, fuelType: "electric" });
  });

  it("returns null for zero kwhPer100mi", () => {
    const result = estimateTripEnergyCost({ miles: 250, kwhPer100mi: 0, fuelPricePerUnit: 0.15 });
    expect(result.result).toBeNull();
  });
});

describe("estimateTripEnergyCost — edge cases", () => {
  it("returns null when neither mpg nor kwhPer100mi provided", () => {
    const result = estimateTripEnergyCost({ miles: 300, fuelPricePerUnit: 4.0 });
    expect(result.result).toBeNull();
  });

  it("returns null when both mpg and kwhPer100mi provided", () => {
    const result = estimateTripEnergyCost({ miles: 300, mpg: 30, kwhPer100mi: 33, fuelPricePerUnit: 4.0 });
    expect(result.result).toBeNull();
  });

  it("caveats always include EPA estimate disclaimer", () => {
    const result = estimateTripEnergyCost({ miles: 300, mpg: 30, fuelPricePerUnit: 4.0 });
    expect(result.caveats.some(c => c.includes("EPA estimates"))).toBe(true);
  });
});
