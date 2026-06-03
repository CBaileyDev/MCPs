/** Pure fuel-cost calculations — no HTTP. */

export interface AnnualFuelCostInput {
  annualMiles: number;
  mpg?: number;
  kwhPer100mi?: number;
  fuelPricePerUnit: number;
}

export interface TripEnergyCostInput {
  miles: number;
  mpg?: number;
  kwhPer100mi?: number;
  fuelPricePerUnit: number;
}

export interface CostResult {
  result: number | null;
  assumptions: Record<string, unknown>;
  caveats: string[];
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Estimate annual fuel cost for a gasoline or electric vehicle.
 * `mpg` XOR `kwhPer100mi` must be provided.
 */
export function estimateAnnualFuelCost(input: AnnualFuelCostInput): CostResult {
  const { annualMiles, mpg, kwhPer100mi, fuelPricePerUnit } = input;
  const caveats: string[] = [
    "EPA estimates; real-world results vary based on driving style, speed, weather, and load."
  ];

  const assumptions: Record<string, unknown> = {
    annualMiles,
    fuelPricePerUnit
  };

  if (mpg !== undefined && kwhPer100mi !== undefined) {
    return {
      result: null,
      assumptions,
      caveats: [...caveats, "Provide either mpg or kwhPer100mi, not both."]
    };
  }

  if (mpg !== undefined) {
    assumptions.mpg = mpg;
    assumptions.fuelType = "gasoline";
    if (mpg <= 0) {
      return {
        result: null,
        assumptions,
        caveats: [...caveats, "mpg must be greater than 0."]
      };
    }
    const gallons = annualMiles / mpg;
    const cost = roundCents(gallons * fuelPricePerUnit);
    return { result: cost, assumptions, caveats };
  }

  if (kwhPer100mi !== undefined) {
    assumptions.kwhPer100mi = kwhPer100mi;
    assumptions.fuelType = "electric";
    if (kwhPer100mi <= 0) {
      return {
        result: null,
        assumptions,
        caveats: [...caveats, "kwhPer100mi must be greater than 0."]
      };
    }
    const kwh = (annualMiles * kwhPer100mi) / 100;
    const cost = roundCents(kwh * fuelPricePerUnit);
    return { result: cost, assumptions, caveats };
  }

  return {
    result: null,
    assumptions,
    caveats: [...caveats, "Provide either mpg (gasoline) or kwhPer100mi (electric)."]
  };
}

/**
 * Estimate trip energy cost for a gasoline or electric vehicle.
 * `mpg` XOR `kwhPer100mi` must be provided.
 */
export function estimateTripEnergyCost(input: TripEnergyCostInput): CostResult {
  const { miles, mpg, kwhPer100mi, fuelPricePerUnit } = input;
  const caveats: string[] = [
    "EPA estimates; real-world results vary based on driving style, speed, weather, and load."
  ];

  const assumptions: Record<string, unknown> = {
    miles,
    fuelPricePerUnit
  };

  if (mpg !== undefined && kwhPer100mi !== undefined) {
    return {
      result: null,
      assumptions,
      caveats: [...caveats, "Provide either mpg or kwhPer100mi, not both."]
    };
  }

  if (mpg !== undefined) {
    assumptions.mpg = mpg;
    assumptions.fuelType = "gasoline";
    if (mpg <= 0) {
      return {
        result: null,
        assumptions,
        caveats: [...caveats, "mpg must be greater than 0."]
      };
    }
    const gallons = miles / mpg;
    const cost = roundCents(gallons * fuelPricePerUnit);
    return { result: cost, assumptions, caveats };
  }

  if (kwhPer100mi !== undefined) {
    assumptions.kwhPer100mi = kwhPer100mi;
    assumptions.fuelType = "electric";
    if (kwhPer100mi <= 0) {
      return {
        result: null,
        assumptions,
        caveats: [...caveats, "kwhPer100mi must be greater than 0."]
      };
    }
    const kwh = (miles * kwhPer100mi) / 100;
    const cost = roundCents(kwh * fuelPricePerUnit);
    return { result: cost, assumptions, caveats };
  }

  return {
    result: null,
    assumptions,
    caveats: [...caveats, "Provide either mpg (gasoline) or kwhPer100mi (electric)."]
  };
}
