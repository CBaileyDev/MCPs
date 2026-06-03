import {
  FITMENT_ATTRIBUTES,
  FITMENT_ATTRIBUTE_INFO,
  type ConfidenceStatus,
  type EvidenceRecord,
  type FitmentAttribute,
  type MissingAttribute,
  type VehicleAttribute,
  type VehicleContext,
  type VehicleContextInput
} from "./types.js";

/** Map a source label to the status a bare provided field should get. */
export function statusForSource(source: string): ConfidenceStatus {
  switch (source) {
    case "user":
      return "confirmed";
    case "vpic":
      return "decoded";
    default:
      // Any other evidence-bearing source is a derived value, never "unknown".
      return "inferred";
  }
}

function missingFor(attribute: FitmentAttribute): MissingAttribute {
  const info = FITMENT_ATTRIBUTE_INFO[attribute];
  return {
    attribute,
    reason: info.reason,
    impact: info.impact,
    ...(info.examples ? { examples: info.examples } : {})
  };
}

/** Recompute the missingAttributes list from the current attributes map. */
export function computeMissing(attributes: Record<string, VehicleAttribute>): MissingAttribute[] {
  return FITMENT_ATTRIBUTES.filter(attribute => {
    const current = attributes[attribute];
    return !current || current.value === null;
  }).map(missingFor);
}

/** The fields an evidence record may legitimately target: fitment attributes + vin. */
const RECOGNIZED_EVIDENCE_FIELDS = new Set<string>([...FITMENT_ATTRIBUTES, "vin"]);

/** Compare two attribute values for equality (string|number, loose by string). */
export function valuesAgree(a: string | number, b: string | number): boolean {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * Fold ONE evidence record into a mutable attributes map, detecting disagreement.
 *
 * This is the single source of truth for evidence folding, shared by
 * `normalizeVehicleContext` and `mergeEvidence` so both resolve conflicts the
 * same way. For the record's target field:
 * - Evidence whose field is not a recognized fitment attribute (or "vin") is
 *   ignored entirely — it never enters the attributes map.
 * - If the attribute has no known value, the record fills it (its own status
 *   applies) — NOT a conflict.
 * - If the record agrees with the existing known value, the record is appended
 *   and the status is left alone — NOT a conflict.
 * - If the record disagrees with an existing known value, the attribute becomes
 *   "conflicting", BOTH records are kept, the EXISTING value is retained, and
 *   the field name is added to `conflicts`.
 *
 * Mutates `attributes` and `conflicts` in place; the record is cloned before
 * storing so the caller's input array is never aliased.
 */
export function foldEvidenceRecord(
  attributes: Record<string, VehicleAttribute>,
  conflicts: Set<string>,
  record: EvidenceRecord
): void {
  if (!RECOGNIZED_EVIDENCE_FIELDS.has(record.field)) {
    return;
  }

  const existing = attributes[record.field] ?? { value: null, status: "unknown", evidence: [] };
  const hasKnownValue = existing.value !== null && existing.value !== undefined;

  if (!hasKnownValue) {
    attributes[record.field] = {
      value: record.value,
      status: record.status,
      evidence: [...existing.evidence, { ...record }]
    };
    return;
  }

  if (valuesAgree(existing.value as string | number, record.value)) {
    attributes[record.field] = {
      ...existing,
      evidence: [...existing.evidence, { ...record }]
    };
    return;
  }

  // Disagreement with a known value -> conflict; keep both records, keep value.
  attributes[record.field] = {
    value: existing.value,
    status: "conflicting",
    evidence: [...existing.evidence, { ...record }]
  };
  conflicts.add(record.field);
}

/**
 * Normalize a partial vehicle profile into a full VehicleContext.
 *
 * - Bare provided fitment fields become attributes whose status follows the
 *   `source` (user -> confirmed, vpic -> decoded, otherwise inferred), each
 *   carrying a synthesized evidence record so provided attributes are never
 *   evidence-less.
 * - An explicit `evidence` array is folded on top via the shared
 *   `foldEvidenceRecord` helper, so it detects disagreement the SAME way
 *   `mergeEvidence` does: a record that contradicts a bare field (or an earlier
 *   record) makes the attribute "conflicting", keeps both records, retains the
 *   existing value, and lists the attribute in `conflicts`. Evidence can also
 *   fill attributes not given as bare fields, and evidence for unrecognized
 *   fields is ignored.
 * - Every fitment-critical attribute with no value is present with
 *   value:null / status:"unknown" and listed in missingAttributes.
 * - `vin` is an optional identifier: included only when provided and never
 *   reported as missing.
 *
 * Pure: returns a fresh object and never mutates its input.
 */
export function normalizeVehicleContext(input: VehicleContextInput = {}): VehicleContext {
  const source = input.source ?? "user";
  const bareStatus = statusForSource(source);
  const attributes: Record<string, VehicleAttribute> = {};

  // 1) Seed every fitment-critical attribute as unknown.
  for (const attribute of FITMENT_ATTRIBUTES) {
    attributes[attribute] = { value: null, status: "unknown", evidence: [] };
  }

  // 2) Apply bare provided fields with a synthesized evidence record.
  for (const attribute of FITMENT_ATTRIBUTES) {
    const raw = input[attribute];
    if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
      continue;
    }
    const value = raw as string | number;
    attributes[attribute] = {
      value,
      status: bareStatus,
      evidence: [{ source, field: attribute, value, status: bareStatus }]
    };
  }

  // 3) Optional vin identifier (not fitment-critical, never "missing").
  if (input.vin !== undefined && input.vin.trim() !== "") {
    attributes.vin = {
      value: input.vin,
      status: bareStatus,
      evidence: [{ source, field: "vin", value: input.vin, status: bareStatus }]
    };
  }

  // 4) Fold any explicit evidence records on top, detecting disagreement the
  //    same way mergeEvidence does (shared helper, DRY).
  const conflicts = new Set<string>();
  for (const record of input.evidence ?? []) {
    foldEvidenceRecord(attributes, conflicts, record);
  }

  return {
    attributes,
    missingAttributes: computeMissing(attributes),
    conflicts: [...conflicts]
  };
}
