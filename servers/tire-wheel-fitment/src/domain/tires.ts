// ─── constants ────────────────────────────────────────────────────────────────
const MM_PER_INCH = 25.4;
const INCHES_PER_MILE = 63360;
const PI = Math.PI;

// ─── types ────────────────────────────────────────────────────────────────────

export interface MetricTireComponents {
  format?: "metric";
  prefix?: string;
  sectionWidthMm: number;
  aspectRatio: number;
  wheelDiameterIn: number;
  loadIndex?: number;
  speedSymbol?: string;
}

export interface FlotationTireComponents {
  format?: "flotation";
  overallDiameterIn: number;
  sectionWidthIn: number;
  wheelDiameterIn: number;
}

export type ParsedTireSize =
  | (MetricTireComponents & { format: "metric" })
  | (FlotationTireComponents & { format: "flotation" });

export interface MetricDimensions {
  format: "metric";
  sectionWidthMm: number;
  aspectRatio: number;
  wheelDiameterIn: number;
  sidewallHeightMm: number;
  sidewallHeightIn: number;
  overallDiameterIn: number;
  circumferenceIn: number;
  revsPerMile: number;
}

export interface FlotationDimensions {
  format: "flotation";
  overallDiameterIn: number;
  sectionWidthIn: number;
  wheelDiameterIn: number;
  sidewallHeightIn: number;
  circumferenceIn: number;
  revsPerMile: number;
}

export type TireDimensions = MetricDimensions | FlotationDimensions;

export interface SpeedometerErrorResult {
  originalDiameterIn: number;
  newDiameterIn: number;
  indicatedSpeed: number;
  actualSpeed: number;
  errorPercent: number;
  speedUnit: "mph" | "km/h";
}

export interface ServiceDescriptionResult {
  loadIndex?: number;
  speedSymbol?: string;
  loadIndexKnown: boolean;
  speedSymbolKnown: boolean;
  loadCapacityKg: number | null;
  loadCapacityLb: number | null;
  maxSpeedKmh: number | null;
  maxSpeedMph: number | null;
}

export interface ReplacementCandidate {
  size: string;
  sectionWidthMm: number;
  aspectRatio: number;
  wheelDiameterIn: number;
  overallDiameterIn: number;
  diameterDeltaPercent: number;
  speedometerErrorPercent: number;
}

// ─── parse ────────────────────────────────────────────────────────────────────

// Flotation: 31x10.50R15
const FLOTATION_REGEX = /^(\d+(\.\d+)?)x(\d+(\.\d+)?)R(\d+(\.\d+)?)$/i;

// Metric: [P|LT]225/45R17[.5][ ][94W]
// Groups: 1=prefix, 2=sectionWidth, 3=aspectRatio, 4=wheelDiam, 5=(.d), 6=loadIndex, 7=speedSymbol
const METRIC_REGEX = /^(P|LT)?(\d{3})\/(\d{2})R(\d{2}(\.\d)?)\s*(\d{2,3})?([A-Z]\d?)?$/;

export function parseTireSize(size: string): ParsedTireSize {
  const trimmed = size.trim();

  // Branch on flotation first (has 'x')
  const floatMatch = FLOTATION_REGEX.exec(trimmed);
  if (floatMatch) {
    return {
      format: "flotation",
      overallDiameterIn: parseFloat(floatMatch[1]),
      sectionWidthIn: parseFloat(floatMatch[3]),
      wheelDiameterIn: parseFloat(floatMatch[5])
    };
  }

  const metricMatch = METRIC_REGEX.exec(trimmed);
  if (metricMatch) {
    const prefix = metricMatch[1] as "P" | "LT" | undefined;
    const sectionWidthMm = parseInt(metricMatch[2], 10);
    const aspectRatio = parseInt(metricMatch[3], 10);
    const wheelDiameterIn = parseFloat(metricMatch[4]);
    const loadIndexStr = metricMatch[6];
    const speedSymbol = metricMatch[7];

    const result: MetricTireComponents & { format: "metric" } = {
      format: "metric",
      sectionWidthMm,
      aspectRatio,
      wheelDiameterIn
    };
    if (prefix !== undefined) result.prefix = prefix;
    if (loadIndexStr !== undefined) result.loadIndex = parseInt(loadIndexStr, 10);
    if (speedSymbol !== undefined) result.speedSymbol = speedSymbol;
    return result;
  }

  throw new Error(`Cannot parse tire size: "${size}"`);
}

// ─── derive dimensions ────────────────────────────────────────────────────────

export function deriveDimensions(components: MetricTireComponents | FlotationTireComponents): TireDimensions {
  // Flotation — overallDiameterIn is given directly
  if ("overallDiameterIn" in components && components.overallDiameterIn !== undefined) {
    const { overallDiameterIn, sectionWidthIn, wheelDiameterIn } = components as FlotationTireComponents;
    const sidewallHeightIn = (overallDiameterIn - wheelDiameterIn) / 2;
    const circumferenceIn = PI * overallDiameterIn;
    const revsPerMile = INCHES_PER_MILE / circumferenceIn;
    return {
      format: "flotation",
      overallDiameterIn,
      sectionWidthIn,
      wheelDiameterIn,
      sidewallHeightIn,
      circumferenceIn,
      revsPerMile
    };
  }

  // Metric
  const { sectionWidthMm, aspectRatio, wheelDiameterIn } = components as MetricTireComponents;
  const sidewallHeightMm = sectionWidthMm * (aspectRatio / 100);
  const sidewallHeightIn = sidewallHeightMm / MM_PER_INCH;
  const overallDiameterIn = wheelDiameterIn + 2 * sidewallHeightIn;
  const circumferenceIn = PI * overallDiameterIn;
  const revsPerMile = INCHES_PER_MILE / circumferenceIn;
  return {
    format: "metric",
    sectionWidthMm,
    aspectRatio,
    wheelDiameterIn,
    sidewallHeightMm,
    sidewallHeightIn,
    overallDiameterIn,
    circumferenceIn,
    revsPerMile
  };
}

// ─── speedometer error ────────────────────────────────────────────────────────

export function speedometerError(
  originalDiameterIn: number,
  newDiameterIn: number,
  indicatedSpeed: number,
  speedUnit: "mph" | "km/h"
): SpeedometerErrorResult {
  const actualSpeed = indicatedSpeed * (newDiameterIn / originalDiameterIn);
  const errorPercent = ((newDiameterIn - originalDiameterIn) / originalDiameterIn) * 100;
  return {
    originalDiameterIn,
    newDiameterIn,
    indicatedSpeed,
    actualSpeed,
    errorPercent,
    speedUnit
  };
}

// ─── service description ──────────────────────────────────────────────────────

const LOAD_INDEX_MAP: Record<number, number> = {
  70: 335, 71: 345, 72: 355, 73: 365, 74: 375, 75: 387, 76: 400, 77: 412, 78: 425, 79: 437,
  80: 450, 81: 462, 82: 475, 83: 487, 84: 500, 85: 515, 86: 530, 87: 545, 88: 560, 89: 580,
  90: 600, 91: 615, 92: 630, 93: 650, 94: 670, 95: 690, 96: 710, 97: 730, 98: 750, 99: 775,
  100: 800, 101: 825, 102: 850, 103: 875, 104: 900, 105: 925, 106: 950, 107: 975, 108: 1000,
  109: 1030, 110: 1060
};

const SPEED_SYMBOL_MAP: Record<string, number> = {
  Q: 160,
  S: 180,
  T: 190,
  H: 210,
  V: 240,
  W: 270,
  Y: 300
};

export interface DecodeInput {
  loadIndex?: number;
  speedSymbol?: string;
  serviceDescription?: string;
}

export function decodeServiceDescription(input: DecodeInput): ServiceDescriptionResult {
  let loadIndex = input.loadIndex;
  let speedSymbol = input.speedSymbol;

  // Parse "94W" style serviceDescription if provided
  if (input.serviceDescription) {
    const match = /^(\d{2,3})([A-Z]\d?)?$/.exec(input.serviceDescription.trim());
    if (match) {
      if (loadIndex === undefined && match[1]) {
        loadIndex = parseInt(match[1], 10);
      }
      if (speedSymbol === undefined && match[2]) {
        speedSymbol = match[2];
      }
    }
  }

  const loadIndexKnown = loadIndex !== undefined && loadIndex in LOAD_INDEX_MAP;
  const speedSymbolKnown = speedSymbol !== undefined && speedSymbol in SPEED_SYMBOL_MAP;

  const loadCapacityKg = loadIndexKnown && loadIndex !== undefined ? LOAD_INDEX_MAP[loadIndex] : null;
  const loadCapacityLb = loadCapacityKg !== null ? loadCapacityKg * 2.20462 : null;

  const maxSpeedKmh = speedSymbolKnown && speedSymbol !== undefined ? SPEED_SYMBOL_MAP[speedSymbol] : null;
  const maxSpeedMph = maxSpeedKmh !== null ? maxSpeedKmh / 1.60934 : null;

  return {
    loadIndex,
    speedSymbol,
    loadIndexKnown,
    speedSymbolKnown,
    loadCapacityKg,
    loadCapacityLb,
    maxSpeedKmh,
    maxSpeedMph
  };
}

// ─── suggest replacement sizes ────────────────────────────────────────────────

const STANDARD_ASPECT_RATIOS = [30, 35, 40, 45, 50, 55, 60, 65, 70];
const DEFAULT_WHEEL_DIAMETERS = [14, 15, 16, 17, 18, 19, 20];

export function suggestReplacementSizes(
  originalSizeStr: string,
  tolerancePercent = 3,
  targetWheelDiameterIn?: number
): ReplacementCandidate[] {
  const original = parseTireSize(originalSizeStr);
  const origDims = deriveDimensions(original);
  const origOverall = origDims.overallDiameterIn;

  const origWheelDiam = original.wheelDiameterIn;
  const wheelCandidates = targetWheelDiameterIn !== undefined
    ? [targetWheelDiameterIn]
    : DEFAULT_WHEEL_DIAMETERS;

  const candidates: ReplacementCandidate[] = [];
  const lowerBound = origOverall * (1 - tolerancePercent / 100);
  const upperBound = origOverall * (1 + tolerancePercent / 100);

  // Generate metric sizes over sensible range
  for (const wheelDiam of wheelCandidates) {
    for (let width = 155; width <= 315; width += 5) {
      for (const ar of STANDARD_ASPECT_RATIOS) {
        const components: MetricTireComponents = {
          sectionWidthMm: width,
          aspectRatio: ar,
          wheelDiameterIn: wheelDiam
        };
        const dims = deriveDimensions(components) as MetricDimensions;
        const overall = dims.overallDiameterIn;
        if (overall < lowerBound || overall > upperBound) continue;

        const diameterDeltaPercent = ((overall - origOverall) / origOverall) * 100;
        const speedErr = speedometerError(origOverall, overall, 60, "mph");
        const size = `${width}/${ar}R${wheelDiam}`;
        candidates.push({
          size,
          sectionWidthMm: width,
          aspectRatio: ar,
          wheelDiameterIn: wheelDiam,
          overallDiameterIn: overall,
          diameterDeltaPercent,
          speedometerErrorPercent: speedErr.errorPercent
        });
      }
    }
  }

  // Sort by absolute diameter delta, then cap at 20
  candidates.sort((a, b) => Math.abs(a.diameterDeltaPercent) - Math.abs(b.diameterDeltaPercent));
  return candidates.slice(0, 20);
}
