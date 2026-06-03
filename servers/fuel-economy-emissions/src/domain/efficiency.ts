/** Pure vehicle record normalization — no HTTP. */

/** Raw API response from GET /vehicle/{id} — all numeric fields arrive as strings. */
export interface RawVehicleRecord {
  make?: string;
  model?: string;
  year?: string;
  trany?: string;
  displ?: string;
  cylinders?: string;
  fuelType?: string;
  fuelType1?: string;
  city08?: string;
  highway08?: string;
  comb08?: string;
  cityA08?: string;
  highwayA08?: string;
  combA08?: string;
  range?: string;
  rangeA?: string;
  co2TailpipeGpm?: string;
  co2TailpipeAGpm?: string;
  ghgScore?: string;
  ghgScoreA?: string;
  fuelCost08?: string;
  fuelCostA08?: string;
  youSaveSpend?: string;
  smartwayScore?: string;
  smogRating?: string;
  co2?: string;
  VClass?: string;
  id?: string | number;
  [key: string]: unknown;
}

export interface EfficiencyRating {
  /** City MPG (or MPGe for EVs) */
  cityMpg: number | null;
  /** Highway MPG (or MPGe for EVs) */
  highwayMpg: number | null;
  /** Combined MPG (or MPGe for EVs) */
  combinedMpg: number | null;
  /** City MPG for dual-fuel vehicles (second fuel) */
  cityMpgAlt: number | null;
  /** Highway MPG for dual-fuel vehicles (second fuel) */
  highwayMpgAlt: number | null;
  /** Combined MPG for dual-fuel vehicles (second fuel) */
  combinedMpgAlt: number | null;
  /** Estimated EV range in miles */
  rangeElectric: number | null;
}

export interface EmissionsData {
  /** CO2 tailpipe emissions in g/mile */
  co2TailpipeGpm: number | null;
  /** CO2 tailpipe emissions for alt fuel in g/mile */
  co2TailpipeAGpm: number | null;
  /** EPA GHG score 1–10 (higher is better) */
  ghgScore: number | null;
  /** EPA GHG score for alt fuel */
  ghgScoreAlt: number | null;
  /** SmartWay score */
  smartwayScore: number | null;
  /** Smog rating */
  smogRating: number | null;
  /** CO2 value (additional field) */
  co2: number | null;
}

export interface EfficiencyVehicle {
  vehicleId: string;
  make: string | null;
  model: string | null;
  year: number | null;
  transmission: string | null;
  displacement: number | null;
  cylinders: number | null;
  fuelType: string | null;
  vehicleClass: string | null;
  efficiencyRating: EfficiencyRating;
  emissions: EmissionsData;
  /** EPA estimated annual fuel cost in USD */
  estAnnualFuelCost: number | null;
  /** Positive = you save vs. average; negative = you spend more */
  youSaveSpend: number | null;
  /** Source URL for attribution */
  sourceUrl: string;
}

/** Coerce a string-or-undefined field to a number, returning null when absent or empty. */
export function toNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/** Canonical FuelEconomy.gov vehicle URL for side-by-side comparison. */
export function fuelEconomyGovUrl(vehicleId: string | number): string {
  return `https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=${vehicleId}`;
}

/** Normalize a raw API vehicle record into a typed EfficiencyVehicle. */
export function normalizeVehicle(raw: RawVehicleRecord, vehicleId?: string): EfficiencyVehicle {
  const id = vehicleId ?? String(raw.id ?? "");

  return {
    vehicleId: id,
    make: (raw.make as string | undefined) ?? null,
    model: (raw.model as string | undefined) ?? null,
    year: toNumber(raw.year as string | undefined),
    transmission: (raw.trany as string | undefined) ?? null,
    displacement: toNumber(raw.displ as string | undefined),
    cylinders: toNumber(raw.cylinders as string | undefined),
    fuelType: (raw.fuelType as string | undefined) ?? (raw.fuelType1 as string | undefined) ?? null,
    vehicleClass: (raw.VClass as string | undefined) ?? null,
    efficiencyRating: {
      cityMpg: toNumber(raw.city08 as string | undefined),
      highwayMpg: toNumber(raw.highway08 as string | undefined),
      combinedMpg: toNumber(raw.comb08 as string | undefined),
      cityMpgAlt: toNumber(raw.cityA08 as string | undefined),
      highwayMpgAlt: toNumber(raw.highwayA08 as string | undefined),
      combinedMpgAlt: toNumber(raw.combA08 as string | undefined),
      rangeElectric: toNumber(raw.range as string | undefined) ?? toNumber(raw.rangeA as string | undefined)
    },
    emissions: {
      co2TailpipeGpm: toNumber(raw.co2TailpipeGpm as string | undefined),
      co2TailpipeAGpm: toNumber(raw.co2TailpipeAGpm as string | undefined),
      ghgScore: toNumber(raw.ghgScore as string | undefined),
      ghgScoreAlt: toNumber(raw.ghgScoreA as string | undefined),
      smartwayScore: toNumber(raw.smartwayScore as string | undefined),
      smogRating: toNumber(raw.smogRating as string | undefined),
      co2: toNumber(raw.co2 as string | undefined)
    },
    estAnnualFuelCost: toNumber(raw.fuelCost08 as string | undefined),
    youSaveSpend: toNumber(raw.youSaveSpend as string | undefined),
    sourceUrl: fuelEconomyGovUrl(id)
  };
}
