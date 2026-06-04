// ─── constants ───────────────────────────────────────────────────────────────

/** Grams of fuel per cc for typical pump gasoline. */
const DEFAULT_FUEL_DENSITY_G_PER_CC = 0.72;

/** Grams per pound (exact). */
const G_PER_LB = 453.592;

// ─── unit conversion ─────────────────────────────────────────────────────────

export type FlowUnit = "cc_min" | "lb_hr";

export interface InjectorFlowConvertResult {
  ccPerMin: number;
  lbPerHr: number;
  fuelDensityGPerCc: number;
  note: string;
  inputs: { value: number; from: FlowUnit; fuelDensityGPerCc: number };
}

/**
 * Convert injector flow between cc/min and lb/hr.
 * Full precision; round only at the tool layer.
 *
 * Formulas:
 *   lbPerHr  = ccPerMin * (60 * density / 453.592)
 *   ccPerMin = lbPerHr  * (453.592 / (60 * density))
 *
 * With density 0.72: factor = 453.592 / (60 * 0.72) = 10.5, so ccPerMin = lbPerHr * 10.5.
 */
export function injectorFlowConvert(
  value: number,
  from: FlowUnit,
  fuelDensityGPerCc: number = DEFAULT_FUEL_DENSITY_G_PER_CC
): InjectorFlowConvertResult {
  let ccPerMin: number;
  let lbPerHr: number;

  if (from === "cc_min") {
    ccPerMin = value;
    lbPerHr = value * ((60 * fuelDensityGPerCc) / G_PER_LB);
  } else {
    lbPerHr = value;
    ccPerMin = value * (G_PER_LB / (60 * fuelDensityGPerCc));
  }

  const note =
    "Conversion depends on fuel density. " +
    "Gasoline ≈ 0.72 g/cc; E85 ≈ 0.78 g/cc; methanol ≈ 0.79 g/cc. " +
    "Using the wrong density will under- or over-size injectors.";

  return {
    ccPerMin,
    lbPerHr,
    fuelDensityGPerCc,
    note,
    inputs: { value, from, fuelDensityGPerCc }
  };
}

// ─── required injector size ───────────────────────────────────────────────────

export interface InjectorSizeRequiredResult {
  perInjectorLbHr: number;
  perInjectorCcMin: number;
  totalFuelLbHr: number;
  assumptions: {
    bsfc: number;
    maxDutyCycle: number;
    fuelDensityGPerCc: number;
    cylinders: number;
    targetHp: number;
  };
  note: string;
}

/**
 * Calculate the minimum injector size required for a target power level.
 * Full precision; round only at the tool layer.
 *
 * Formulas:
 *   totalFuelLbHr     = targetHp * bsfc
 *   perInjectorLbHr   = totalFuelLbHr / (cylinders * maxDutyCycle)
 *   perInjectorCcMin  = perInjectorLbHr * (453.592 / (60 * density))
 */
export function injectorSizeRequired(
  targetHp: number,
  cylinders: number,
  bsfc: number = 0.5,
  maxDutyCycle: number = 0.85,
  fuelDensityGPerCc: number = DEFAULT_FUEL_DENSITY_G_PER_CC
): InjectorSizeRequiredResult {
  const totalFuelLbHr = targetHp * bsfc;
  const perInjectorLbHr = totalFuelLbHr / (cylinders * maxDutyCycle);
  const perInjectorCcMin = perInjectorLbHr * (G_PER_LB / (60 * fuelDensityGPerCc));

  const note =
    "BSFC ≈ 0.45–0.5 for naturally-aspirated gasoline and ≈ 0.55–0.65 for forced induction. " +
    "80–85% max duty cycle is the usual safe ceiling. " +
    "Size up for headroom. " +
    "These are rule-of-thumb estimates, not guarantees.";

  return {
    perInjectorLbHr,
    perInjectorCcMin,
    totalFuelLbHr,
    assumptions: { bsfc, maxDutyCycle, fuelDensityGPerCc, cylinders, targetHp },
    note
  };
}

// ─── max HP from injector size ────────────────────────────────────────────────

export interface InjectorMaxHpResult {
  maxHp: number;
  injectorLbHr: number;
  injectorCcMin: number;
  assumptions: {
    cylinders: number;
    bsfc: number;
    maxDutyCycle: number;
    fuelDensityGPerCc: number;
  };
  note: string;
}

/**
 * Calculate the maximum supported horsepower for a given injector flow rating.
 * Full precision; round only at the tool layer.
 *
 * Formula:
 *   maxHp = injectorLbHr * cylinders * maxDutyCycle / bsfc
 */
export function injectorMaxHp(
  injectorFlow: number,
  flowUnit: FlowUnit,
  cylinders: number,
  bsfc: number = 0.5,
  maxDutyCycle: number = 0.85,
  fuelDensityGPerCc: number = DEFAULT_FUEL_DENSITY_G_PER_CC
): InjectorMaxHpResult {
  // Convert to lb/hr if needed
  let injectorLbHr: number;
  let injectorCcMin: number;

  if (flowUnit === "cc_min") {
    injectorCcMin = injectorFlow;
    injectorLbHr = injectorFlow * ((60 * fuelDensityGPerCc) / G_PER_LB);
  } else {
    injectorLbHr = injectorFlow;
    injectorCcMin = injectorFlow * (G_PER_LB / (60 * fuelDensityGPerCc));
  }

  const maxHp = (injectorLbHr * cylinders * maxDutyCycle) / bsfc;

  const note =
    "BSFC ≈ 0.45–0.5 for naturally-aspirated gasoline and ≈ 0.55–0.65 for forced induction. " +
    "80–85% max duty cycle is the usual safe ceiling. " +
    "Size up for headroom. " +
    "These are rule-of-thumb estimates, not guarantees.";

  return {
    maxHp,
    injectorLbHr,
    injectorCcMin,
    assumptions: { cylinders, bsfc, maxDutyCycle, fuelDensityGPerCc },
    note
  };
}
