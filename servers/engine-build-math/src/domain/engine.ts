// ─── constants ───────────────────────────────────────────────────────────────

const CC_PER_CI = 16.387064;   // 1 cubic inch = 16.387064 cc (exact)
const MM_PER_INCH = 25.4;      // 1 inch = 25.4 mm (exact)

// ─── displacement ────────────────────────────────────────────────────────────

export type LengthUnit = "in" | "mm";

export interface DisplacementResult {
  ci: number;
  cc: number;
  liters: number;
  sweptPerCylinder_cc: number;
  inputs: { bore: number; stroke: number; cylinders: number; unit: LengthUnit };
}

/**
 * Calculate total engine displacement from bore, stroke, and cylinder count.
 * Full precision; round only at the tool layer.
 */
export function calcDisplacement(
  bore: number,
  stroke: number,
  cylinders: number,
  unit: LengthUnit
): DisplacementResult {
  // Swept volume per cylinder in native units
  const sweptNative = (Math.PI / 4) * bore ** 2 * stroke;
  const totalNative = sweptNative * cylinders;

  let ci: number;
  let cc: number;

  if (unit === "in") {
    ci = totalNative;                    // native = in³
    cc = ci * CC_PER_CI;
  } else {
    // native = mm³
    cc = totalNative / 1000;            // mm³ → cc (1 cc = 1000 mm³)
    ci = cc / CC_PER_CI;
  }

  const liters = cc / 1000;
  const sweptPerCylinder_cc = unit === "in"
    ? sweptNative * CC_PER_CI
    : sweptNative / 1000;

  return {
    ci,
    cc,
    liters,
    sweptPerCylinder_cc,
    inputs: { bore, stroke, cylinders, unit }
  };
}

// ─── compression ratio ───────────────────────────────────────────────────────

export interface CompressionRatioResult {
  sweptCc: number;
  clearanceCc: number;
  ratio: number;
  ratioLabel: string;
  inputs: {
    bore: number;
    stroke: number;
    unit: LengthUnit;
    chamberCc: number;
    gasketCc: number;
    deckCc: number;
    pistonCc: number;
  };
}

export interface CompressionRatioError {
  error: string;
  inputs: {
    bore: number;
    stroke: number;
    unit: LengthUnit;
    chamberCc: number;
    gasketCc: number;
    deckCc: number;
    pistonCc: number;
  };
}

/**
 * Calculate compression ratio.
 * pistonCc: positive = dish (adds clearance volume), negative = dome (subtracts it).
 * Returns an error result if clearanceCc <= 0.
 */
export function calcCompressionRatio(
  bore: number,
  stroke: number,
  unit: LengthUnit,
  chamberCc: number,
  gasketCc: number,
  deckCc: number,
  pistonCc: number
): CompressionRatioResult | CompressionRatioError {
  // Swept volume per cylinder converted to cc
  const sweptNative = (Math.PI / 4) * bore ** 2 * stroke;
  const sweptCc = unit === "in"
    ? sweptNative * CC_PER_CI
    : sweptNative / 1000;

  const clearanceCc = chamberCc + gasketCc + deckCc + pistonCc;

  if (clearanceCc <= 0) {
    return {
      error:
        "Compression ratio is undefined: clearance volume is zero or negative. " +
        "Check chamberCc, gasketCc, deckCc, and pistonCc values.",
      inputs: { bore, stroke, unit, chamberCc, gasketCc, deckCc, pistonCc }
    };
  }

  const ratio = (sweptCc + clearanceCc) / clearanceCc;
  const ratioLabel = `${parseFloat(ratio.toFixed(2))}:1`;

  return {
    sweptCc,
    clearanceCc,
    ratio,
    ratioLabel,
    inputs: { bore, stroke, unit, chamberCc, gasketCc, deckCc, pistonCc }
  };
}

// ─── bore/stroke ratio ───────────────────────────────────────────────────────

export type EngineCharacter = "oversquare" | "undersquare" | "square";

export interface BoreStrokeRatioResult {
  ratio: number;
  classification: EngineCharacter;
  meaning: string;
  inputs: { bore: number; stroke: number };
}

/**
 * Calculate bore-to-stroke ratio and classify the engine character.
 * Both values must be in the same unit; ratio is unitless.
 */
export function calcBoreStrokeRatio(bore: number, stroke: number): BoreStrokeRatioResult {
  const ratio = bore / stroke;

  let classification: EngineCharacter;
  let meaning: string;

  if (ratio > 1.05) {
    classification = "oversquare";
    meaning =
      "Oversquare engine: large bore relative to stroke. Tends to rev higher, " +
      "with less torque bias and better high-RPM power potential.";
  } else if (ratio < 0.95) {
    classification = "undersquare";
    meaning =
      "Undersquare (long-stroke) engine: stroke longer than bore. Tends to produce " +
      "more torque at lower RPM; piston speeds limit maximum RPM.";
  } else {
    classification = "square";
    meaning =
      "Square engine: bore and stroke are approximately equal. " +
      "Balanced compromise between torque and rev potential.";
  }

  return { ratio, classification, meaning, inputs: { bore, stroke } };
}

// ─── mean piston speed ───────────────────────────────────────────────────────

export interface MeanPistonSpeedResult {
  ftPerMin: number;
  mPerSec: number;
  note: string;
  inputs: { stroke: number; unit: LengthUnit; rpm: number };
}

/**
 * Calculate mean piston speed.
 * Mean piston speed = 2 × stroke × rpm (in consistent units).
 */
export function calcMeanPistonSpeed(
  stroke: number,
  unit: LengthUnit,
  rpm: number
): MeanPistonSpeedResult {
  let ftPerMin: number;
  let mPerSec: number;

  if (unit === "in") {
    ftPerMin = 2 * (stroke / 12) * rpm;
    mPerSec = (ftPerMin * 0.3048) / 60;
  } else {
    // mm
    mPerSec = (2 * (stroke / 1000) * rpm) / 60;
    ftPerMin = (mPerSec * 60) / 0.3048;
  }

  const note =
    "Sustained mean piston speed above ~4000 ft/min (~20 m/s) is racing/high-stress territory for most production engines.";

  return { ftPerMin, mPerSec, note, inputs: { stroke, unit, rpm } };
}

// ─── engine airflow (CFM) ────────────────────────────────────────────────────

export interface EngineAirflowResult {
  cfm: number;
  note: string;
  inputs: { displacementCi: number; rpm: number; volumetricEfficiency: number };
}

/**
 * Calculate required airflow in CFM.
 * cfm = displacementCi × rpm × volumetricEfficiency / 3456
 * 3456 = 2 × 1728: a 4-stroke fills every other rev; 1728 in³ per ft³.
 * VE > 1 is valid for forced induction.
 */
export function calcEngineAirflowCfm(
  displacementCi: number,
  rpm: number,
  volumetricEfficiency: number
): EngineAirflowResult {
  const cfm = (displacementCi * rpm * volumetricEfficiency) / 3456;

  const note =
    "3456 = 2 × 1728: a 4-stroke fills every other rev; 1728 in³ per ft³. " +
    "Volumetric efficiency > 1 indicates forced induction (supercharger/turbo).";

  return {
    cfm,
    note,
    inputs: { displacementCi, rpm, volumetricEfficiency }
  };
}
