// ─── AWG copper resistance table ─────────────────────────────────────────────
// ohmsPerFoot = ohmsPer1000ft / 1000
// Source: NEC / standard copper conductor resistance at ~20-25°C

export interface AwgEntry {
  label: string;
  ohmsPer1000ft: number;
}

export const AWG_TABLE: AwgEntry[] = [
  { label: "4/0", ohmsPer1000ft: 0.04901 },
  { label: "3/0", ohmsPer1000ft: 0.06180 },
  { label: "2/0", ohmsPer1000ft: 0.07793 },
  { label: "1/0", ohmsPer1000ft: 0.09827 },
  { label: "1",   ohmsPer1000ft: 0.1239  },
  { label: "2",   ohmsPer1000ft: 0.1563  },
  { label: "3",   ohmsPer1000ft: 0.1970  },
  { label: "4",   ohmsPer1000ft: 0.2485  },
  { label: "6",   ohmsPer1000ft: 0.3951  },
  { label: "8",   ohmsPer1000ft: 0.6282  },
  { label: "10",  ohmsPer1000ft: 0.9989  },
  { label: "12",  ohmsPer1000ft: 1.588   },
  { label: "14",  ohmsPer1000ft: 2.525   },
  { label: "16",  ohmsPer1000ft: 4.016   },
  { label: "18",  ohmsPer1000ft: 6.385   },
  { label: "20",  ohmsPer1000ft: 10.15   },
  { label: "22",  ohmsPer1000ft: 16.14   },
  { label: "24",  ohmsPer1000ft: 25.67   }
];

/** Aluminum resistance is approximately 1.64× copper (approximation). */
export const ALUMINUM_FACTOR = 1.64;

export type WireMaterial = "copper" | "aluminum";

/** Look up an AWG entry by label. Throws if not found. */
export function findAwgEntry(awg: string): AwgEntry {
  const entry = AWG_TABLE.find(e => e.label === awg);
  if (!entry) {
    throw new Error(
      `Unknown AWG "${awg}". Valid values: ${AWG_TABLE.map(e => e.label).join(", ")}`
    );
  }
  return entry;
}

/** Return ohms per foot for a given AWG and material. */
export function ohmsPerFoot(awg: string, material: WireMaterial): number {
  const entry = findAwgEntry(awg);
  const base = entry.ohmsPer1000ft / 1000;
  return material === "aluminum" ? base * ALUMINUM_FACTOR : base;
}

// ─── voltage_drop ─────────────────────────────────────────────────────────────

export interface VoltageDopResult {
  vDrop: number;
  dropPercent: number;
  endVolts: number;
  note: string;
  inputs: {
    awg: string;
    amps: number;
    lengthFeet: number;
    systemVolts: number;
    material: WireMaterial;
  };
}

/**
 * Calculate voltage drop for a 2-wire DC run (current flows out and back).
 * Full precision — round only in tools/register.ts.
 */
export function calcVoltageDrop(
  awg: string,
  amps: number,
  lengthFeet: number,
  systemVolts: number,
  material: WireMaterial
): VoltageDopResult {
  if (amps <= 0) throw new Error("amps must be positive");
  if (lengthFeet <= 0) throw new Error("lengthFeet must be positive");
  if (systemVolts <= 0) throw new Error("systemVolts must be positive");

  const rpf = ohmsPerFoot(awg, material);
  const vDrop = 2 * lengthFeet * amps * rpf;
  const dropPercent = (vDrop / systemVolts) * 100;
  const endVolts = systemVolts - vDrop;

  return {
    vDrop,
    dropPercent,
    endVolts,
    note:
      "3% drop is a common limit for critical/sensitive circuits; 10% for non-critical loads. " +
      "This assumes a simple 2-wire DC run (current flows out AND back, hence 2× length).",
    inputs: { awg, amps, lengthFeet, systemVolts, material }
  };
}

// ─── recommend_wire_gauge ────────────────────────────────────────────────────

export interface WireGaugeRecommendation {
  success: true;
  awg: string;
  vDrop: number;
  dropPercent: number;
  systemVolts: number;
  amps: number;
  lengthFeet: number;
  maxDropPercent: number;
  material: WireMaterial;
}

export interface WireGaugeFallback {
  success: false;
  message: string;
  awg: string;
  dropPercent: number;
  note: string;
  systemVolts: number;
  amps: number;
  lengthFeet: number;
  maxDropPercent: number;
  material: WireMaterial;
}

export type WireGaugeResult = WireGaugeRecommendation | WireGaugeFallback;

/**
 * Find the smallest (thinnest / highest AWG number) wire that meets the drop limit.
 * Iterates the table from thinnest to thickest wire (highest ohmsPer1000ft first).
 */
export function recommendWireGauge(
  amps: number,
  lengthFeet: number,
  systemVolts: number,
  maxDropPercent: number,
  material: WireMaterial
): WireGaugeResult {
  if (amps <= 0) throw new Error("amps must be positive");
  if (lengthFeet <= 0) throw new Error("lengthFeet must be positive");
  if (systemVolts <= 0) throw new Error("systemVolts must be positive");
  if (maxDropPercent <= 0) throw new Error("maxDropPercent must be positive");

  // Iterate from thinnest (highest ohmsPer1000ft = last entry) to thickest (first entry)
  const sorted = [...AWG_TABLE].sort((a, b) => b.ohmsPer1000ft - a.ohmsPer1000ft);

  for (const entry of sorted) {
    const rpf = (entry.ohmsPer1000ft / 1000) * (material === "aluminum" ? ALUMINUM_FACTOR : 1);
    const vDrop = 2 * lengthFeet * amps * rpf;
    const dropPercent = (vDrop / systemVolts) * 100;
    if (dropPercent <= maxDropPercent) {
      return {
        success: true,
        awg: entry.label,
        vDrop,
        dropPercent,
        systemVolts,
        amps,
        lengthFeet,
        maxDropPercent,
        material
      };
    }
  }

  // Even the largest gauge can't meet it — report 4/0 as fallback
  const largest = AWG_TABLE[0]; // 4/0 has lowest resistance
  const rpf = (largest.ohmsPer1000ft / 1000) * (material === "aluminum" ? ALUMINUM_FACTOR : 1);
  const vDrop = 2 * lengthFeet * amps * rpf;
  const dropPercent = (vDrop / systemVolts) * 100;

  return {
    success: false,
    message: `No standard gauge meets ${maxDropPercent}% drop for this run. Best available: AWG ${largest.label} at ${dropPercent.toFixed(2)}% drop.`,
    awg: largest.label,
    dropPercent,
    note: "Consider a larger conductor bundle, a higher system voltage, or reducing load/run length.",
    systemVolts,
    amps,
    lengthFeet,
    maxDropPercent,
    material
  };
}

// ─── ohms_law ─────────────────────────────────────────────────────────────────

export interface OhmsLawInputs {
  volts?: number;
  amps?: number;
  ohms?: number;
  watts?: number;
}

export interface OhmsLawResult {
  volts: number;
  amps: number;
  ohms: number;
  watts: number;
  inputs: OhmsLawInputs;
}

export interface OhmsLawError {
  error: string;
}

/**
 * Compute all four Ohm's law quantities from exactly two known inputs.
 * Returns an error object if not exactly two inputs are provided.
 * V = I·R, P = V·I = I²·R = V²/R
 */
export function calcOhmsLaw(inputs: OhmsLawInputs): OhmsLawResult | OhmsLawError {
  const provided = Object.entries(inputs).filter(([, v]) => v !== undefined && v !== null);
  if (provided.length !== 2) {
    return {
      error:
        `Ohm's law requires exactly 2 of the 4 quantities (volts, amps, ohms, watts). ` +
        `You provided ${provided.length}: [${provided.map(([k]) => k).join(", ")}].`
    };
  }

  const { volts: V, amps: I, ohms: R, watts: W } = inputs;

  let v: number, i: number, r: number, w: number;

  if (V !== undefined && I !== undefined) {
    v = V; i = I; r = V / I; w = V * I;
  } else if (V !== undefined && R !== undefined) {
    v = V; r = R; i = V / R; w = (V * V) / R;
  } else if (V !== undefined && W !== undefined) {
    v = V; w = W; i = W / V; r = (V * V) / W;
  } else if (I !== undefined && R !== undefined) {
    i = I; r = R; v = I * R; w = I * I * R;
  } else if (I !== undefined && W !== undefined) {
    i = I; w = W; v = W / I; r = W / (I * I);
  } else if (R !== undefined && W !== undefined) {
    r = R; w = W; i = Math.sqrt(W / R); v = Math.sqrt(W * R);
  } else {
    return { error: "Could not resolve the provided pair. Provide exactly 2 of: volts, amps, ohms, watts." };
  }

  return { volts: v!, amps: i!, ohms: r!, watts: w!, inputs };
}

// ─── fuse_size ────────────────────────────────────────────────────────────────

export const STANDARD_FUSE_AMPS = [1, 2, 3, 4, 5, 7.5, 10, 15, 20, 25, 30, 35, 40];

export interface FuseSizeResult {
  minRequiredAmps: number;
  recommendedFuseAmps: number;
  standardSizes: number[];
  wireWarning?: string;
  caveat: string;
  inputs: {
    continuousAmps: number;
    factor: number;
    wireAmpacity?: number;
  };
}

/**
 * Recommend the smallest standard blade-fuse rating >= minRequiredAmps.
 * Optionally flag if the recommended fuse exceeds the wire's ampacity.
 */
export function calcFuseSize(
  continuousAmps: number,
  factor: number,
  wireAmpacity?: number
): FuseSizeResult {
  if (continuousAmps <= 0) throw new Error("continuousAmps must be positive");
  if (factor <= 0) throw new Error("factor must be positive");
  if (wireAmpacity !== undefined && wireAmpacity <= 0)
    throw new Error("wireAmpacity must be positive");

  const minRequiredAmps = continuousAmps * factor;
  const recommendedFuseAmps =
    STANDARD_FUSE_AMPS.find(f => f >= minRequiredAmps) ??
    STANDARD_FUSE_AMPS[STANDARD_FUSE_AMPS.length - 1];

  let wireWarning: string | undefined;
  if (wireAmpacity !== undefined && recommendedFuseAmps > wireAmpacity) {
    wireWarning =
      `WARNING: The recommended fuse (${recommendedFuseAmps} A) exceeds the wire's ampacity ` +
      `(${wireAmpacity} A). The wire is too small for this fuse — upsize the wire.`;
  }

  return {
    minRequiredAmps,
    recommendedFuseAmps,
    standardSizes: STANDARD_FUSE_AMPS,
    wireWarning,
    caveat:
      "The fuse protects the wire, not the load. The fuse rating must not exceed the wire's ampacity. " +
      "This is guidance — verify against actual component ratings and applicable wiring standards.",
    inputs: { continuousAmps, factor, wireAmpacity }
  };
}

// ─── battery_runtime ─────────────────────────────────────────────────────────

export interface BatteryRuntimeResult {
  runtimeHours: number;
  loadAmps: number;
  usableAh: number;
  capacityAh: number;
  usableDepthPercent: number;
  note: string;
  inputs: {
    capacityAh: number;
    loadAmps?: number;
    loadWatts?: number;
    systemVolts: number;
    usableDepthPercent: number;
  };
}

export interface BatteryRuntimeError {
  error: string;
}

/**
 * Calculate battery runtime given load in amps or watts.
 * Ideal estimate — ignores Peukert effect, temperature, and inverter losses.
 */
export function calcBatteryRuntime(
  capacityAh: number,
  systemVolts: number,
  usableDepthPercent: number,
  loadAmps?: number,
  loadWatts?: number
): BatteryRuntimeResult | BatteryRuntimeError {
  if (capacityAh <= 0) throw new Error("capacityAh must be positive");
  if (systemVolts <= 0) throw new Error("systemVolts must be positive");
  if (usableDepthPercent <= 0 || usableDepthPercent > 100)
    throw new Error("usableDepthPercent must be between 0 and 100");

  const bothProvided = loadAmps !== undefined && loadWatts !== undefined;
  const neitherProvided = loadAmps === undefined && loadWatts === undefined;

  if (bothProvided || neitherProvided) {
    return {
      error:
        "Provide exactly one of loadAmps or loadWatts (not both, not neither)."
    };
  }

  let resolvedAmps: number;
  if (loadWatts !== undefined) {
    if (loadWatts <= 0) throw new Error("loadWatts must be positive");
    resolvedAmps = loadWatts / systemVolts;
  } else {
    if (loadAmps! <= 0) throw new Error("loadAmps must be positive");
    resolvedAmps = loadAmps!;
  }

  const usableAh = capacityAh * (usableDepthPercent / 100);
  const runtimeHours = usableAh / resolvedAmps;

  return {
    runtimeHours,
    loadAmps: resolvedAmps,
    usableAh,
    capacityAh,
    usableDepthPercent,
    note:
      "This is an ideal estimate. Real runtime is shorter due to the Peukert effect (higher draws " +
      "reduce effective capacity), temperature derating, and any inverter losses. " +
      "50% DoD is a common conservative limit for lead-acid/AGM; LiFePO4 is often 80–100%.",
    inputs: { capacityAh, loadAmps, loadWatts, systemVolts, usableDepthPercent }
  };
}

// ─── battery_bank ─────────────────────────────────────────────────────────────

export interface BatteryBankResult {
  totalVolts: number;
  totalAh: number;
  totalWh: number;
  count: number;
  configuration: string;
  inputs: {
    cellVolts: number;
    cellAh: number;
    series: number;
    parallel: number;
  };
}

/**
 * Calculate battery bank totals for series/parallel configurations.
 * totalVolts = cellVolts * series
 * totalAh = cellAh * parallel
 * totalWh = cellVolts * cellAh * series * parallel
 */
export function calcBatteryBank(
  cellVolts: number,
  cellAh: number,
  series: number,
  parallel: number
): BatteryBankResult {
  if (cellVolts <= 0) throw new Error("cellVolts must be positive");
  if (cellAh <= 0) throw new Error("cellAh must be positive");
  if (!Number.isInteger(series) || series < 1) throw new Error("series must be an integer >= 1");
  if (!Number.isInteger(parallel) || parallel < 1) throw new Error("parallel must be an integer >= 1");

  const totalVolts = cellVolts * series;
  const totalAh = cellAh * parallel;
  const totalWh = cellVolts * cellAh * series * parallel;
  const count = series * parallel;
  const configuration = `${series}S${parallel}P`;

  return {
    totalVolts,
    totalAh,
    totalWh,
    count,
    configuration,
    inputs: { cellVolts, cellAh, series, parallel }
  };
}
