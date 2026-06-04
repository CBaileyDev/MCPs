// ─── constants ──────────────────────────────────────────────────────────────

// Fuel economy
const L_PER_US_GAL = 3.785411784;
const L_PER_IMP_GAL = 4.54609;
const KM_PER_MILE = 1.609344;
const MPG_US_TO_L_PER_100KM = (L_PER_US_GAL / KM_PER_MILE) * 100; // 235.214583...
const MPG_IMP_TO_L_PER_100KM = (L_PER_IMP_GAL / KM_PER_MILE) * 100; // 282.480936...

// Power (in watts)
const W_PER_HP = 745.6998715822702;
const W_PER_PS = 735.49875;
const W_PER_KW = 1000;

// Torque (in N·m)
const NM_PER_LB_FT = 1.3558179483314004;
const NM_PER_KG_M = 9.80665;

// Pressure (in pascals)
const PA_PER_PSI = 6894.757293168361;
const PA_PER_BAR = 100000;
const PA_PER_KPA = 1000;
const PA_PER_INHG = 3386.389;

// Volume (in liters)
const L_PER_ML = 0.001;
const L_PER_US_QT = 0.946352946;
// L_PER_US_GAL already defined above
const L_PER_IMP_QT = 1.1365225;
// L_PER_IMP_GAL already defined above

// Socket
const MM_PER_INCH = 25.4;

// ─── fuel economy ────────────────────────────────────────────────────────────

export type FuelEconomyUnit = "mpg_us" | "mpg_imp" | "l_per_100km" | "km_per_l";

export interface FuelEconomyResult {
  mpg_us: number;
  mpg_imp: number;
  l_per_100km: number;
  km_per_l: number;
  note: string;
  inputs: { value: number; from: FuelEconomyUnit };
}

/** Convert a fuel economy value to all units. Canonical: L/100km. */
export function convertFuelEconomy(value: number, from: FuelEconomyUnit): FuelEconomyResult {
  // Convert to canonical L/100km
  let canonical: number;
  switch (from) {
    case "mpg_us":
      canonical = MPG_US_TO_L_PER_100KM / value;
      break;
    case "mpg_imp":
      canonical = MPG_IMP_TO_L_PER_100KM / value;
      break;
    case "l_per_100km":
      canonical = value;
      break;
    case "km_per_l":
      canonical = 100 / value;
      break;
  }

  // Convert from canonical to all units (full precision)
  return {
    mpg_us: MPG_US_TO_L_PER_100KM / canonical,
    mpg_imp: MPG_IMP_TO_L_PER_100KM / canonical,
    l_per_100km: canonical,
    km_per_l: 100 / canonical,
    note: "L/100km is inverse (lower = better); mpg and km/L are higher-is-better.",
    inputs: { value, from }
  };
}

// ─── power ───────────────────────────────────────────────────────────────────

export type PowerUnit = "hp" | "kw" | "ps";

export interface PowerResult {
  hp: number;
  kw: number;
  ps: number;
  inputs: { value: number; from: PowerUnit };
}

/** Convert a power value to all units. Canonical: watts. */
export function convertPower(value: number, from: PowerUnit): PowerResult {
  let watts: number;
  switch (from) {
    case "hp":
      watts = value * W_PER_HP;
      break;
    case "kw":
      watts = value * W_PER_KW;
      break;
    case "ps":
      watts = value * W_PER_PS;
      break;
  }

  return {
    hp: watts / W_PER_HP,
    kw: watts / W_PER_KW,
    ps: watts / W_PER_PS,
    inputs: { value, from }
  };
}

// ─── torque ──────────────────────────────────────────────────────────────────

export type TorqueUnit = "lb_ft" | "nm" | "kg_m";

export interface TorqueResult {
  lb_ft: number;
  nm: number;
  kg_m: number;
  inputs: { value: number; from: TorqueUnit };
}

/** Convert a torque value to all units. Canonical: N·m. */
export function convertTorque(value: number, from: TorqueUnit): TorqueResult {
  let nm: number;
  switch (from) {
    case "lb_ft":
      nm = value * NM_PER_LB_FT;
      break;
    case "nm":
      nm = value;
      break;
    case "kg_m":
      nm = value * NM_PER_KG_M;
      break;
  }

  return {
    lb_ft: nm / NM_PER_LB_FT,
    nm,
    kg_m: nm / NM_PER_KG_M,
    inputs: { value, from }
  };
}

// ─── pressure ────────────────────────────────────────────────────────────────

export type PressureUnit = "psi" | "bar" | "kpa" | "inhg";

export interface PressureResult {
  psi: number;
  bar: number;
  kpa: number;
  inhg: number;
  inputs: { value: number; from: PressureUnit };
}

/** Convert a pressure value to all units. Canonical: pascals. */
export function convertPressure(value: number, from: PressureUnit): PressureResult {
  let pa: number;
  switch (from) {
    case "psi":
      pa = value * PA_PER_PSI;
      break;
    case "bar":
      pa = value * PA_PER_BAR;
      break;
    case "kpa":
      pa = value * PA_PER_KPA;
      break;
    case "inhg":
      pa = value * PA_PER_INHG;
      break;
  }

  return {
    psi: pa / PA_PER_PSI,
    bar: pa / PA_PER_BAR,
    kpa: pa / PA_PER_KPA,
    inhg: pa / PA_PER_INHG,
    inputs: { value, from }
  };
}

// ─── volume ──────────────────────────────────────────────────────────────────

export type VolumeUnit = "l" | "ml" | "us_qt" | "us_gal" | "imp_qt" | "imp_gal";

export interface VolumeResult {
  l: number;
  ml: number;
  us_qt: number;
  us_gal: number;
  imp_qt: number;
  imp_gal: number;
  inputs: { value: number; from: VolumeUnit };
}

/** Convert a volume value to all units. Canonical: liters. */
export function convertVolume(value: number, from: VolumeUnit): VolumeResult {
  let liters: number;
  switch (from) {
    case "l":
      liters = value;
      break;
    case "ml":
      liters = value * L_PER_ML;
      break;
    case "us_qt":
      liters = value * L_PER_US_QT;
      break;
    case "us_gal":
      liters = value * L_PER_US_GAL;
      break;
    case "imp_qt":
      liters = value * L_PER_IMP_QT;
      break;
    case "imp_gal":
      liters = value * L_PER_IMP_GAL;
      break;
  }

  return {
    l: liters,
    ml: liters / L_PER_ML,
    us_qt: liters / L_PER_US_QT,
    us_gal: liters / L_PER_US_GAL,
    imp_qt: liters / L_PER_IMP_QT,
    imp_gal: liters / L_PER_IMP_GAL,
    inputs: { value, from }
  };
}

// ─── socket size ─────────────────────────────────────────────────────────────

export type SocketUnit = "mm" | "in";

// Standard metric sockets (mm)
const METRIC_SOCKETS_MM = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24];

// Standard SAE fractional sockets: [numerator, denominator] pairs
const SAE_SOCKETS: Array<{ label: string; mm: number }> = [
  { label: '3/16"', mm: (3 / 16) * MM_PER_INCH },
  { label: '7/32"', mm: (7 / 32) * MM_PER_INCH },
  { label: '1/4"', mm: (1 / 4) * MM_PER_INCH },
  { label: '5/16"', mm: (5 / 16) * MM_PER_INCH },
  { label: '3/8"', mm: (3 / 8) * MM_PER_INCH },
  { label: '7/16"', mm: (7 / 16) * MM_PER_INCH },
  { label: '1/2"', mm: (1 / 2) * MM_PER_INCH },
  { label: '9/16"', mm: (9 / 16) * MM_PER_INCH },
  { label: '5/8"', mm: (5 / 8) * MM_PER_INCH },
  { label: '11/16"', mm: (11 / 16) * MM_PER_INCH },
  { label: '3/4"', mm: (3 / 4) * MM_PER_INCH },
  { label: '13/16"', mm: (13 / 16) * MM_PER_INCH },
  { label: '7/8"', mm: (7 / 8) * MM_PER_INCH },
  { label: '15/16"', mm: (15 / 16) * MM_PER_INCH },
  { label: '1"', mm: 1 * MM_PER_INCH }
];

function verdictFromDelta(deltaMm: number): string {
  if (deltaMm <= 0.15) return "interchangeable";
  if (deltaMm <= 0.40) return "usable in a pinch — risk of rounding the fastener";
  return "do not substitute";
}

export interface SocketSizeResult {
  inputMm: number;
  nearestLabel: string;
  nearestMm: number;
  deltaMm: number;
  verdict: string;
  inputs: { value: number; unit: SocketUnit };
}

/** Find the nearest socket in the opposing measurement system. */
export function convertSocketSize(value: number, unit: SocketUnit): SocketSizeResult {
  const inputMm = unit === "mm" ? value : value * MM_PER_INCH;

  if (unit === "mm") {
    // Input is metric — find nearest SAE socket
    let nearest = SAE_SOCKETS[0];
    let minDelta = Math.abs(inputMm - nearest.mm);
    for (const socket of SAE_SOCKETS) {
      const delta = Math.abs(inputMm - socket.mm);
      if (delta < minDelta) {
        minDelta = delta;
        nearest = socket;
      }
    }
    const deltaMm = parseFloat(minDelta.toFixed(3));
    return {
      inputMm,
      nearestLabel: nearest.label,
      nearestMm: nearest.mm,
      deltaMm,
      verdict: verdictFromDelta(deltaMm),
      inputs: { value, unit }
    };
  } else {
    // Input is SAE (decimal inches) — find nearest metric socket
    let nearestMm = METRIC_SOCKETS_MM[0];
    let minDelta = Math.abs(inputMm - nearestMm);
    for (const mm of METRIC_SOCKETS_MM) {
      const delta = Math.abs(inputMm - mm);
      if (delta < minDelta) {
        minDelta = delta;
        nearestMm = mm;
      }
    }
    const deltaMm = parseFloat(minDelta.toFixed(3));
    return {
      inputMm,
      nearestLabel: `${nearestMm} mm`,
      nearestMm,
      deltaMm,
      verdict: verdictFromDelta(deltaMm),
      inputs: { value, unit }
    };
  }
}
