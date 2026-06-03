import { computeMissing, foldEvidenceRecord } from "./normalize.js";
import {
  type EvidenceRecord,
  type MissingAttribute,
  type VehicleAttribute,
  type VehicleContext
} from "./types.js";

/** Deep-copy one attribute so callers cannot mutate shared evidence arrays. */
function cloneAttribute(attribute: VehicleAttribute): VehicleAttribute {
  return {
    value: attribute.value,
    status: attribute.status,
    evidence: attribute.evidence.map(record => ({ ...record }))
  };
}

/** Deep-copy a context so all merge/correction helpers stay pure. */
function cloneContext(context: VehicleContext): VehicleContext {
  const attributes: Record<string, VehicleAttribute> = {};
  for (const [name, attribute] of Object.entries(context.attributes)) {
    attributes[name] = cloneAttribute(attribute);
  }
  return {
    attributes,
    missingAttributes: context.missingAttributes.map(m => ({ ...m })),
    conflicts: [...context.conflicts]
  };
}

/**
 * Fold new evidence records into a context, using the same shared
 * `foldEvidenceRecord` helper as `normalizeVehicleContext` so conflicts are
 * detected identically everywhere (DRY).
 *
 * For each record:
 * - Evidence for an unrecognized field is ignored.
 * - If the target attribute has no known value, the record fills it (its own
 *   status applies) — this is NOT a conflict.
 * - If the record's value agrees with the existing known value, the record is
 *   appended but the status is left alone — NOT a conflict.
 * - If the record's value disagrees with an existing known value, the
 *   attribute becomes "conflicting", BOTH records are kept, the existing value
 *   is retained, and the attribute name is added to `conflicts`.
 *
 * Pure: returns a new context and never mutates its input.
 */
export function mergeEvidence(context: VehicleContext, newEvidence: EvidenceRecord[]): VehicleContext {
  const next = cloneContext(context);
  const conflicts = new Set(next.conflicts);

  for (const record of newEvidence) {
    foldEvidenceRecord(next.attributes, conflicts, record);
  }

  next.conflicts = [...conflicts];
  next.missingAttributes = computeMissing(next.attributes);
  return next;
}

/**
 * Record a user correction for one attribute. The attribute is set to the
 * corrected value with status "confirmed", a source:"user" correction evidence
 * record is appended, and any prior conflict on that attribute is cleared.
 *
 * Pure and STATELESS: it returns an updated context object only. Persisting the
 * correction across sessions is the garage-memory server's job.
 */
export function recordCorrection(
  context: VehicleContext,
  attribute: string,
  value: string | number,
  note?: string
): VehicleContext {
  const next = cloneContext(context);
  const existing = next.attributes[attribute] ?? { value: null, status: "unknown", evidence: [] };

  const correction: EvidenceRecord = {
    source: "user",
    field: attribute,
    value,
    status: "confirmed",
    notes: note ?? "User correction."
  };

  next.attributes[attribute] = {
    value,
    status: "confirmed",
    evidence: [...existing.evidence, correction]
  };

  next.conflicts = next.conflicts.filter(name => name !== attribute);
  next.missingAttributes = computeMissing(next.attributes);
  return next;
}

export type AttributeExplanation = {
  attribute: string;
  value: string | number | null;
  status: VehicleAttribute["status"];
  summary: string;
};

export type ConfidenceExplanation = {
  attributes: AttributeExplanation[];
  missing: MissingAttribute[];
  conflicts: string[];
  /** A one-line headline describing overall confidence. */
  headline: string;
};

function sentenceFor(attribute: string, value: string | number | null, status: VehicleAttribute["status"]): string {
  switch (status) {
    case "confirmed":
      return `${attribute} is "${value}" (user-confirmed).`;
    case "decoded":
      return `${attribute} is "${value}" (decoded from VIN/vPIC).`;
    case "inferred":
      return `${attribute} is "${value}" (inferred from other evidence).`;
    case "conflicting":
      return `${attribute} is contested; sources disagree (currently showing "${value}"). Confirm with the user.`;
    case "unknown":
    default:
      return `${attribute} is unknown; no evidence yet.`;
  }
}

/**
 * Produce a structured, human-readable confidence summary: one entry per known
 * attribute (value, status, and a short sentence), plus the missing list and
 * any conflicts. Read-only; does not change the context.
 */
export function explainConfidence(context: VehicleContext): ConfidenceExplanation {
  const attributes: AttributeExplanation[] = Object.entries(context.attributes)
    .filter(([, attribute]) => attribute.value !== null)
    .map(([name, attribute]) => ({
      attribute: name,
      value: attribute.value,
      status: attribute.status,
      summary: sentenceFor(name, attribute.value, attribute.status)
    }));

  const headlineParts: string[] = [];
  headlineParts.push(`${attributes.length} attribute(s) have evidence`);
  headlineParts.push(`${context.missingAttributes.length} still missing`);
  if (context.conflicts.length > 0) {
    headlineParts.push(`${context.conflicts.length} in conflict (${context.conflicts.join(", ")})`);
  }

  return {
    attributes,
    missing: context.missingAttributes,
    conflicts: context.conflicts,
    headline: `Vehicle context: ${headlineParts.join("; ")}. This reflects evidence confidence, not guaranteed part compatibility.`
  };
}
