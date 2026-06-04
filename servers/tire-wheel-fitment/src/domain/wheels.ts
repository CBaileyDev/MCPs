/**
 * Wheel offset / backspacing math — the "wheel" half of tire-and-wheel fitment.
 *
 * Conventions (verified against standard references):
 *   centerline (in) = wheelWidth/2 + lipAllowance   (overall width = bead-seat
 *     width + ~1", i.e. ~0.5" of lip per side; lipAllowance defaults to 0.5)
 *   backspacing (in) = centerline + offset/25.4      (offset is millimetres;
 *     POSITIVE offset moves the mounting face toward the street side → MORE
 *     backspacing and LESS poke).
 *
 * Real backspacing is measured to the lip and varies ~0.5" by wheel design and
 * by which convention a calculator uses, so `lipAllowanceIn` is exposed (set it
 * to 0 for the bare width/2 + offset rule). The fitment-CHANGE math below is
 * independent of the lip allowance (it cancels in the difference), so those
 * deltas are exact.
 */

const MM_PER_INCH = 25.4;

export interface OffsetConversion {
  widthIn: number;
  lipAllowanceIn: number;
  centerlineIn: number;
  offsetMm: number;
  backspacingIn: number;
  note: string;
  inputs: { widthIn: number; offsetMm?: number; backspacingIn?: number; lipAllowanceIn: number };
}

export interface OffsetConversionError {
  error: string;
  inputs: { widthIn: number; offsetMm?: number; backspacingIn?: number; lipAllowanceIn: number };
}

const OFFSET_NOTE =
  "backspacing = wheelWidth/2 + lipAllowance + offset/25.4. Positive offset = mounting face toward the " +
  "street side = more backspacing, less poke. lipAllowanceIn defaults to 0.5\" per side (overall width ≈ " +
  "bead-seat width + 1\"); real backspacing varies ~0.5\" by wheel — set lipAllowanceIn to 0 for the bare " +
  "width/2 + offset rule.";

/** Convert between wheel offset (mm) and backspacing (in). Provide exactly one of the two. */
export function convertWheelOffset(
  widthIn: number,
  offsetMm: number | undefined,
  backspacingIn: number | undefined,
  lipAllowanceIn: number
): OffsetConversion | OffsetConversionError {
  const inputs = { widthIn, offsetMm, backspacingIn, lipAllowanceIn };

  if (widthIn <= 0) return { error: "widthIn must be greater than 0.", inputs };
  if (lipAllowanceIn < 0) return { error: "lipAllowanceIn must be 0 or greater.", inputs };

  const hasOffset = offsetMm !== undefined;
  const hasBack = backspacingIn !== undefined;
  if (hasOffset === hasBack) {
    return {
      error: "Provide exactly one of offsetMm or backspacingIn (not neither, not both).",
      inputs
    };
  }

  const centerlineIn = widthIn / 2 + lipAllowanceIn;

  let resolvedOffsetMm: number;
  let resolvedBackspacingIn: number;
  if (hasOffset) {
    resolvedOffsetMm = offsetMm as number;
    resolvedBackspacingIn = centerlineIn + resolvedOffsetMm / MM_PER_INCH;
  } else {
    resolvedBackspacingIn = backspacingIn as number;
    resolvedOffsetMm = (resolvedBackspacingIn - centerlineIn) * MM_PER_INCH;
  }

  return {
    widthIn,
    lipAllowanceIn,
    centerlineIn,
    offsetMm: resolvedOffsetMm,
    backspacingIn: resolvedBackspacingIn,
    note: OFFSET_NOTE,
    inputs
  };
}

export interface WheelFitmentChange {
  /** Outer-lip movement, mm. Positive = wheel pokes further out toward the fender. */
  pokeChangeMm: number;
  /** Inner-lip clearance change, mm. Positive = inner lip moves outboard = MORE room from the suspension. */
  innerClearanceChangeMm: number;
  summary: string;
  note: string;
  inputs: { oldWidthIn: number; oldOffsetMm: number; newWidthIn: number; newOffsetMm: number };
}

const FITMENT_NOTE =
  "Pure geometric translation of the wheel/tire. Positive pokeChangeMm = more poke (closer to the fender); " +
  "positive innerClearanceChangeMm = inner lip moved outboard (more room from strut/suspension). " +
  "Independent of lip allowance. Actual fender and suspension clearance also depend on tire size and the " +
  "vehicle — treat these as the change in where the wheel sits, not absolute clearances.";

/** How a wheel's poke and inner clearance change when moving from one width/offset to another. */
export function wheelFitmentChange(
  oldWidthIn: number,
  oldOffsetMm: number,
  newWidthIn: number,
  newOffsetMm: number
): WheelFitmentChange {
  const halfDeltaMm = ((newWidthIn - oldWidthIn) / 2) * MM_PER_INCH;
  const offsetDeltaMm = newOffsetMm - oldOffsetMm;

  // poke (outboard) = width/2 + lip - offset  → Δ = halfDelta - offsetDelta (lip cancels)
  const pokeChangeMm = halfDeltaMm - offsetDeltaMm;
  // inner lip inboard depth = backspacing = width/2 + lip + offset → Δinboard = halfDelta + offsetDelta
  // clearance change is the negative of moving inboard:
  const innerClearanceChangeMm = -(halfDeltaMm + offsetDeltaMm);

  const pokeDir = pokeChangeMm > 0 ? "out" : pokeChangeMm < 0 ? "in" : "unchanged";
  const innerDir = innerClearanceChangeMm > 0 ? "more" : innerClearanceChangeMm < 0 ? "less" : "unchanged";
  const summary =
    `Outer lip moves ${pokeChangeMm === 0 ? "0" : Math.abs(pokeChangeMm).toFixed(1)} mm ${pokeDir}` +
    ` (poke); inner clearance ${innerClearanceChangeMm === 0 ? "unchanged" : Math.abs(innerClearanceChangeMm).toFixed(1) + " mm " + innerDir}.`;

  return {
    pokeChangeMm,
    innerClearanceChangeMm,
    summary,
    note: FITMENT_NOTE,
    inputs: { oldWidthIn, oldOffsetMm, newWidthIn, newOffsetMm }
  };
}
