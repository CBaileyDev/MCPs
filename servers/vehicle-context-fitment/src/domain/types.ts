/**
 * Confidence model for a vehicle profile.
 *
 * This is the WHOLE model: a single enum, no numeric scoring, no probability.
 * - confirmed   = user-confirmed
 * - decoded     = from a VIN / vPIC decode
 * - inferred    = derived from other evidence
 * - unknown     = no evidence at all
 * - conflicting = two or more sources disagree
 */
export type ConfidenceStatus = "confirmed" | "decoded" | "inferred" | "unknown" | "conflicting";

/** A single piece of evidence for one attribute, from one source. */
export type EvidenceRecord = {
  /** Where the value came from. Examples: "user", "vpic", "garage-memory". */
  source: string;
  /** The fitment attribute this evidence is about (e.g. "make", "drivetrain"). */
  field: string;
  value: string | number;
  status: ConfidenceStatus;
  /** Optional ISO timestamp describing when the value was retrieved. */
  retrievedAt?: string;
  notes?: string;
};

/** The resolved state of one fitment attribute, plus the evidence behind it. */
export type VehicleAttribute = {
  value: string | number | null;
  status: ConfidenceStatus;
  evidence: EvidenceRecord[];
};

/** A fitment-critical attribute we have no value for, and why it matters. */
export type MissingAttribute = {
  attribute: string;
  reason: string;
  impact: string;
  examples?: string[];
};

/**
 * A normalized vehicle profile: every fitment-critical attribute (known or not),
 * the list of attributes still missing, and the names of attributes in conflict.
 */
export type VehicleContext = {
  attributes: Record<string, VehicleAttribute>;
  missingAttributes: MissingAttribute[];
  /** Names of attributes whose sources currently disagree. */
  conflicts: string[];
};

/**
 * The canonical fitment-critical attributes this server tracks. `vin` is an
 * optional identifier and is intentionally NOT in this list: it is never
 * reported as "missing".
 */
export const FITMENT_ATTRIBUTES = [
  "year",
  "make",
  "model",
  "trim",
  "engine",
  "drivetrain",
  "transmission",
  "body",
  "market"
] as const;

export type FitmentAttribute = (typeof FITMENT_ATTRIBUTES)[number];

/**
 * Partial set of fitment attributes a caller can supply, plus the optional vin
 * identifier, an evidence array, and a source label for the bare fields.
 */
export type VehicleContextInput = {
  year?: string | number;
  make?: string;
  model?: string;
  trim?: string;
  engine?: string;
  drivetrain?: string;
  transmission?: string;
  body?: string;
  market?: string;
  vin?: string;
  /** Source label applied to bare provided fields. Defaults to "user". */
  source?: string;
  /** Extra evidence records folded in on top of the bare fields. */
  evidence?: EvidenceRecord[];
};

/** Why each fitment attribute matters, used to populate MissingAttribute. */
export const FITMENT_ATTRIBUTE_INFO: Record<
  FitmentAttribute,
  { reason: string; impact: string; examples?: string[] }
> = {
  year: {
    reason: "Model year scopes nearly every parts lookup and recall.",
    impact: "Without it, fitment, recalls, and spec lookups cannot be narrowed.",
    examples: ["2018", "2021"]
  },
  make: {
    reason: "The manufacturer is the top-level key for any catalog.",
    impact: "Without it, no catalog or VIN decode can be scoped.",
    examples: ["Toyota", "Ford"]
  },
  model: {
    reason: "The model line determines platform and most part families.",
    impact: "Without it, parts cannot be matched beyond the make.",
    examples: ["Camry", "F-150"]
  },
  trim: {
    reason: "Trim often changes brakes, wheels, suspension, and equipment.",
    impact: "Ambiguous trim can yield the wrong brake, wheel, or option parts.",
    examples: ["LE", "XLT", "Sport"]
  },
  engine: {
    reason: "Engine option drives ignition, filtration, cooling, and drivetrain parts.",
    impact: "Without it, engine-specific parts cannot be matched at all.",
    examples: ["2.5L L4", "3.5L V6"]
  },
  drivetrain: {
    reason: "FWD/RWD/AWD/4WD changes axles, halfshafts, and many chassis parts.",
    impact: "Wrong drivetrain yields incorrect axle, driveline, and brake parts.",
    examples: ["FWD", "AWD", "4WD"]
  },
  transmission: {
    reason: "Transmission type affects mounts, coolers, fluids, and clutch parts.",
    impact: "Without it, transmission and related cooling parts are ambiguous.",
    examples: ["Automatic", "Manual", "CVT"]
  },
  body: {
    reason: "Body style affects glass, trim, lighting, and panel fitment.",
    impact: "Wrong body style yields incorrect body, glass, and trim parts.",
    examples: ["Sedan", "Coupe", "SuperCrew"]
  },
  market: {
    reason: "Market/region changes equipment, emissions, and lighting specs.",
    impact: "Cross-market parts may not be legal or may not physically fit.",
    examples: ["US", "EU", "JDM"]
  }
};
