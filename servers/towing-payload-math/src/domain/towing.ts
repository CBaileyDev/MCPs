// ─── tongue weight ────────────────────────────────────────────────────────────

export type TongueClassification =
  | "too light — trailer sway risk"
  | "in range"
  | "heavy — risk of overloading hitch/rear axle (note: gooseneck/5th-wheel intentionally run 15–25%, a different setup)";

export interface TongueWeightResult {
  tongueWeightLb: number;
  tonguePercent: number;
  classification: TongueClassification;
  guidelineNote: string;
  unit: string;
  inputs: {
    trailerWeightLb: number;
    tongueWeightLb?: number;
    tonguePercent?: number;
    unit: string;
  };
}

export interface TongueWeightError {
  error: string;
  inputs: {
    trailerWeightLb: number;
    tongueWeightLb?: number;
    tonguePercent?: number;
    unit: string;
  };
}

const TONGUE_GUIDELINE_NOTE =
  "Conventional bumper-pull guideline: tongue weight should be 10–15% of total trailer weight. " +
  "Gooseneck and 5th-wheel setups intentionally run 15–25% — they are a different hitch class.";

function classifyTongue(tonguePercent: number): TongueClassification {
  if (tonguePercent < 10) return "too light — trailer sway risk";
  if (tonguePercent <= 15) return "in range";
  return "heavy — risk of overloading hitch/rear axle (note: gooseneck/5th-wheel intentionally run 15–25%, a different setup)";
}

/**
 * Calculate tongue weight and classify against the 10–15% guideline.
 * Provide EXACTLY ONE of tongueWeightLb or tonguePercent.
 * Full precision; round only at the tool layer.
 */
export function calcTongueWeight(
  trailerWeightLb: number,
  tongueWeightLb: number | undefined,
  tonguePercent: number | undefined,
  unit: string
): TongueWeightResult | TongueWeightError {
  const inputs = { trailerWeightLb, tongueWeightLb, tonguePercent, unit };

  if (trailerWeightLb <= 0) {
    return {
      error: "trailerWeightLb must be greater than 0.",
      inputs
    };
  }

  const hasWeight = tongueWeightLb !== undefined;
  const hasPercent = tonguePercent !== undefined;

  if (!hasWeight && !hasPercent) {
    return {
      error:
        "Provide exactly one of tongueWeightLb or tonguePercent — neither was supplied.",
      inputs
    };
  }

  if (hasWeight && hasPercent) {
    return {
      error:
        "Provide exactly one of tongueWeightLb or tonguePercent — both were supplied.",
      inputs
    };
  }

  if (hasPercent) {
    const pct = tonguePercent as number;
    if (pct <= 0 || pct >= 100) {
      return {
        error: "tonguePercent must be strictly between 0 and 100.",
        inputs
      };
    }
    const weight = trailerWeightLb * pct / 100;
    return {
      tongueWeightLb: weight,
      tonguePercent: pct,
      classification: classifyTongue(pct),
      guidelineNote: TONGUE_GUIDELINE_NOTE,
      unit,
      inputs
    };
  }

  // tongueWeightLb given
  const weight = tongueWeightLb as number;
  if (weight <= 0) {
    return {
      error: "tongueWeightLb must be greater than 0.",
      inputs
    };
  }
  const pct = weight / trailerWeightLb * 100;
  return {
    tongueWeightLb: weight,
    tonguePercent: pct,
    classification: classifyTongue(pct),
    guidelineNote: TONGUE_GUIDELINE_NOTE,
    unit,
    inputs
  };
}

// ─── payload check ────────────────────────────────────────────────────────────

export interface PayloadCheckResult {
  usedPayloadLb: number;
  remainingPayloadLb: number;
  over: boolean;
  breakdown: {
    passengersAndCargoLb: number;
    tongueWeightLb: number;
    otherHitchLoadLb: number;
  };
  note: string;
  unit: string;
  inputs: {
    payloadCapacityLb: number;
    passengersAndCargoLb: number;
    tongueWeightLb: number;
    otherHitchLoadLb: number;
    unit: string;
  };
}

const PAYLOAD_NOTE =
  "Tongue weight presses down on the hitch and counts against the tow vehicle's payload — " +
  "together with passengers and cargo. Payload capacity = GVWR − curb weight (from the door-jamb label).";

/**
 * Check whether passengers + cargo + tongue weight fit within payload capacity.
 * Full precision; round only at the tool layer.
 */
export function calcPayloadCheck(
  payloadCapacityLb: number,
  passengersAndCargoLb: number,
  tongueWeightLb: number,
  otherHitchLoadLb: number,
  unit: string
): PayloadCheckResult {
  const usedPayloadLb = passengersAndCargoLb + tongueWeightLb + otherHitchLoadLb;
  const remainingPayloadLb = payloadCapacityLb - usedPayloadLb;

  return {
    usedPayloadLb,
    remainingPayloadLb,
    over: remainingPayloadLb < 0,
    breakdown: {
      passengersAndCargoLb,
      tongueWeightLb,
      otherHitchLoadLb
    },
    note: PAYLOAD_NOTE,
    unit,
    inputs: {
      payloadCapacityLb,
      passengersAndCargoLb,
      tongueWeightLb,
      otherHitchLoadLb,
      unit
    }
  };
}

// ─── towing headroom (GCWR) ───────────────────────────────────────────────────

export interface TowingHeadroomResult {
  combinedWeightLb: number;
  remainingWithinGcwrLb: number;
  maxTrailerAtThisLoadLb: number;
  over: boolean;
  note: string;
  unit: string;
  inputs: {
    gcwrLb: number;
    loadedTruckWeightLb: number;
    trailerWeightLb: number;
    unit: string;
  };
}

const GCWR_NOTE =
  "GCWR (Gross Combined Weight Rating) limits truck + trailer weight together. " +
  "Use the ACTUAL loaded truck weight (scale weight with people and cargo aboard), not curb weight. " +
  "Max trailer weight = GCWR − actual loaded truck weight.";

/**
 * Calculate remaining GCWR headroom and max trailer weight at this truck load.
 * Full precision; round only at the tool layer.
 */
export function calcTowingHeadroom(
  gcwrLb: number,
  loadedTruckWeightLb: number,
  trailerWeightLb: number,
  unit: string
): TowingHeadroomResult {
  const combinedWeightLb = loadedTruckWeightLb + trailerWeightLb;
  const remainingWithinGcwrLb = gcwrLb - combinedWeightLb;
  const maxTrailerAtThisLoadLb = gcwrLb - loadedTruckWeightLb;

  return {
    combinedWeightLb,
    remainingWithinGcwrLb,
    maxTrailerAtThisLoadLb,
    over: combinedWeightLb > gcwrLb,
    note: GCWR_NOTE,
    unit,
    inputs: {
      gcwrLb,
      loadedTruckWeightLb,
      trailerWeightLb,
      unit
    }
  };
}

// ─── consolidated tow setup check ─────────────────────────────────────────────

export interface TowSetupCheckResult {
  payloadCapacityLb: number;
  usedPayloadLb: number;
  loadedTruckWeightLb: number;
  remainingPayloadLb: number;
  combinedWeightLb: number;
  remainingWithinGcwrLb: number;
  tonguePercent: number;
  payloadOk: boolean;
  gcwrOk: boolean;
  tongueOk: boolean;
  overall: boolean;
  bindingConstraint: string;
  note: string;
  unit: string;
  inputs: {
    gvwrLb: number;
    curbWeightLb: number;
    gcwrLb: number;
    passengersAndCargoLb: number;
    trailerWeightLb: number;
    tongueWeightLb: number;
    unit: string;
  };
}

const TOW_SETUP_NOTE =
  "Vehicle ratings (GVWR, GCWR, curb weight) come from the door-jamb label and manufacturer towing guide — " +
  "this server does the arithmetic; it does not know any vehicle's ratings. " +
  "loadedTruckWeightLb should be actual scale weight of the truck with passengers and cargo aboard, not curb weight.";

/**
 * Run all three checks (payload/GVWR, GCWR, tongue weight) and report the binding constraint.
 * Full precision; round only at the tool layer.
 */
export function calcTowSetupCheck(
  gvwrLb: number,
  curbWeightLb: number,
  gcwrLb: number,
  passengersAndCargoLb: number,
  trailerWeightLb: number,
  tongueWeightLb: number,
  unit: string
): TowSetupCheckResult {
  const payloadCapacityLb = gvwrLb - curbWeightLb;
  const usedPayloadLb = passengersAndCargoLb + tongueWeightLb;
  const loadedTruckWeightLb = curbWeightLb + usedPayloadLb;
  const remainingPayloadLb = payloadCapacityLb - usedPayloadLb;
  const payloadOk = remainingPayloadLb >= 0;

  const combinedWeightLb = loadedTruckWeightLb + trailerWeightLb;
  const remainingWithinGcwrLb = gcwrLb - combinedWeightLb;
  const gcwrOk = remainingWithinGcwrLb >= 0;

  const tonguePercent = tongueWeightLb / trailerWeightLb * 100;
  const tongueOk = tonguePercent >= 10 && tonguePercent <= 15;

  const overall = payloadOk && gcwrOk && tongueOk;

  // Determine binding constraint
  let bindingConstraint: string;
  const failing: string[] = [];
  if (!payloadOk) failing.push("payload/GVWR");
  if (!gcwrOk) failing.push("GCWR");
  if (!tongueOk) failing.push("tongue weight");

  if (failing.length > 0) {
    bindingConstraint = failing.join(", ");
  } else {
    // All pass — find the check closest to its limit (smallest margin)
    // Payload margin in lb, GCWR margin in lb, tongue margin in percent-distance to nearest bound
    const payloadMargin = remainingPayloadLb;
    const gcwrMargin = remainingWithinGcwrLb;
    const tongueBound = tonguePercent < 12.5 ? tonguePercent - 10 : 15 - tonguePercent;

    // Normalise: use lb for weight margins, convert tongue to a percentage of trailer weight for comparison
    // Since margins are in different units we compare them conceptually: use raw numbers and pick smallest
    if (payloadMargin <= gcwrMargin && payloadMargin <= tongueBound * (trailerWeightLb / 100)) {
      bindingConstraint = "payload/GVWR";
    } else if (gcwrMargin <= tongueBound * (trailerWeightLb / 100)) {
      bindingConstraint = "GCWR";
    } else {
      bindingConstraint = "tongue weight";
    }
  }

  return {
    payloadCapacityLb,
    usedPayloadLb,
    loadedTruckWeightLb,
    remainingPayloadLb,
    combinedWeightLb,
    remainingWithinGcwrLb,
    tonguePercent,
    payloadOk,
    gcwrOk,
    tongueOk,
    overall,
    bindingConstraint,
    note: TOW_SETUP_NOTE,
    unit,
    inputs: {
      gvwrLb,
      curbWeightLb,
      gcwrLb,
      passengersAndCargoLb,
      trailerWeightLb,
      tongueWeightLb,
      unit
    }
  };
}
