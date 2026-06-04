// ─── constants ─────────────────────────────────────────────────────────────
const INCHES_PER_MILE = 63360;
const MM_PER_INCH = 25.4;
const PI = Math.PI;

// ─── inline metric tire parser ──────────────────────────────────────────────
// Accepts "W/ARRd" e.g. "275/40R20"
const METRIC_REGEX = /^(P|LT)?(\d{3})\/(\d{2})R(\d{2}(\.\d+)?)\s*/;

export function parseMetricTireDiameter(size: string): number {
  const match = METRIC_REGEX.exec(size.trim());
  if (!match) {
    throw new Error(`Cannot parse metric tire size: "${size}". Expected format like "275/40R20".`);
  }
  const sectionWidthMm = parseFloat(match[2]);
  const aspectRatio = parseFloat(match[3]);
  const wheelDiameterIn = parseFloat(match[4]);
  const sidewallIn = (sectionWidthMm * (aspectRatio / 100)) / MM_PER_INCH;
  return wheelDiameterIn + 2 * sidewallIn;
}

// ─── shared tire resolver ───────────────────────────────────────────────────

export interface TireInput {
  tireSize?: string;
  tireDiameterIn?: number;
}

/**
 * Resolve the overall tire diameter in inches from exactly one of:
 *   tireSize (metric string) OR tireDiameterIn (explicit number).
 * Throws a clear error when neither or both are provided.
 */
export function resolveTireDiameter(input: TireInput): number {
  const hasSize = input.tireSize !== undefined;
  const hasDiam = input.tireDiameterIn !== undefined;

  if (hasSize && hasDiam) {
    throw new Error("Provide either tireSize OR tireDiameterIn — not both.");
  }
  if (!hasSize && !hasDiam) {
    throw new Error("Provide either tireSize (e.g. \"275/40R20\") or tireDiameterIn.");
  }
  if (hasSize) {
    return parseMetricTireDiameter(input.tireSize!);
  }
  return input.tireDiameterIn!;
}

// ─── wheel circumference ────────────────────────────────────────────────────

export function wheelCircumferenceIn(overallDiameterIn: number): number {
  return PI * overallDiameterIn;
}

// ─── core gearing math ──────────────────────────────────────────────────────

/**
 * Speed in mph given engine RPM, gear ratios, and tire diameter.
 *   wheelRPM = engineRPM / (transGearRatio * finalDriveRatio)
 *   speedMph = wheelRPM * C * 60 / 63360
 */
export function speedFromRpm(
  engineRpm: number,
  transGearRatio: number,
  finalDriveRatio: number,
  overallDiameterIn: number
): number {
  const C = wheelCircumferenceIn(overallDiameterIn);
  return (engineRpm * C * 60) / (transGearRatio * finalDriveRatio * INCHES_PER_MILE);
}

/**
 * Engine RPM given speed in mph, gear ratios, and tire diameter.
 *   engineRPM = speedMph * 63360 * transGearRatio * finalDriveRatio / (C * 60)
 */
export function rpmFromSpeed(
  speedMph: number,
  transGearRatio: number,
  finalDriveRatio: number,
  overallDiameterIn: number
): number {
  const C = wheelCircumferenceIn(overallDiameterIn);
  return (speedMph * INCHES_PER_MILE * transGearRatio * finalDriveRatio) / (C * 60);
}

/**
 * Recommend a final drive ratio to hit a target RPM at a target speed in top gear.
 *   finalDrive = engineRPM * C * 60 / (speedMph * 63360 * transGearRatio)
 */
export function recommendFinalDrive(
  targetRpm: number,
  targetSpeedMph: number,
  topGearRatio: number,
  overallDiameterIn: number
): number {
  const C = wheelCircumferenceIn(overallDiameterIn);
  return (targetRpm * C * 60) / (targetSpeedMph * INCHES_PER_MILE * topGearRatio);
}

// ─── tire gearing effect ─────────────────────────────────────────────────────

export interface TireGearingEffect {
  originalDiameterIn: number;
  newDiameterIn: number;
  stockFinalDrive: number;
  /** Effective ratio your new tire behaves like with the stock final drive — bigger tire = numerically lower = taller. */
  effectiveRatio: number;
  /** Final drive needed to RESTORE the original RPM/speed relationship. */
  restoringFinalDrive: number;
  /** Percent change in effective gearing (positive = numerically higher / shorter). */
  percentChange: number;
  speedometerNote: string;
}

/**
 * Calculate the gearing effect of swapping tire diameter.
 * A larger tire is taller (lower effective numerical ratio, slower at the same RPM).
 * Speedo reads off the original tire circumference — bigger tire means speedo under-reads.
 */
export function tireGearingEffect(
  originalDiameterIn: number,
  newDiameterIn: number,
  finalDriveRatio: number
): TireGearingEffect {
  const effectiveRatio = finalDriveRatio * (originalDiameterIn / newDiameterIn);
  const restoringFinalDrive = finalDriveRatio * (newDiameterIn / originalDiameterIn);
  const percentChange = ((effectiveRatio - finalDriveRatio) / finalDriveRatio) * 100;

  const speedoUnder = newDiameterIn > originalDiameterIn;
  const speedometerNote = speedoUnder
    ? `Your speedometer is calibrated for the original ${originalDiameterIn.toFixed(2)}-in tire. The larger ${newDiameterIn.toFixed(2)}-in tire travels farther per revolution, so your actual speed is HIGHER than indicated (speedo under-reads).`
    : `Your speedometer is calibrated for the original ${originalDiameterIn.toFixed(2)}-in tire. The smaller ${newDiameterIn.toFixed(2)}-in tire travels less far per revolution, so your actual speed is LOWER than indicated (speedo over-reads).`;

  return {
    originalDiameterIn,
    newDiameterIn,
    stockFinalDrive: finalDriveRatio,
    effectiveRatio,
    restoringFinalDrive,
    percentChange,
    speedometerNote
  };
}
