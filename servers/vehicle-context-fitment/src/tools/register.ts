import * as z from "zod/v4";
import { ok, type ToolResult } from "../result.js";
import { normalizeVehicleContext } from "../domain/normalize.js";
import { explainConfidence, mergeEvidence, recordCorrection } from "../domain/confidence.js";
import {
  FITMENT_ATTRIBUTES,
  type EvidenceRecord,
  type FitmentAttribute,
  type VehicleContextInput
} from "../domain/types.js";

/**
 * Minimal structural type the real McpServer satisfies. Typing the registrar
 * structurally (rather than importing McpServer) lets the registration tests
 * pass a lightweight fake. The handler returns the canonical ToolResult so
 * results from ok() are assignable in both directions.
 */
type ToolRegistrar = {
  registerTool(
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: z.ZodRawShape;
      annotations?: Record<string, unknown>;
    },
    handler: (input: Record<string, unknown>) => Promise<ToolResult> | ToolResult
  ): unknown;
};

const READONLY = { readOnlyHint: true, openWorldHint: false } as const;

const confidenceStatusSchema = z.enum(["confirmed", "decoded", "inferred", "unknown", "conflicting"]);

const evidenceRecordSchema = z.object({
  source: z.string().min(1),
  field: z.string().min(1),
  value: z.union([z.string(), z.number()]),
  status: confidenceStatusSchema,
  retrievedAt: z.string().optional(),
  notes: z.string().optional()
});

/** The optional fitment fields shared by most tools (as a raw shape). */
const fitmentFields = {
  year: z.union([z.string(), z.number()]).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  trim: z.string().optional(),
  engine: z.string().optional(),
  drivetrain: z.string().optional(),
  transmission: z.string().optional(),
  body: z.string().optional(),
  market: z.string().optional(),
  vin: z.string().optional()
} satisfies z.ZodRawShape;

/**
 * Category -> extra fitment attributes (beyond year/make/model) that a context
 * check generally wants before treating a parts lookup as well-scoped. This is
 * a coarse heuristic for context completeness, NOT a verified fitment rule set.
 */
const CATEGORY_REQUIREMENTS: Record<string, FitmentAttribute[]> = {
  brakes: ["drivetrain", "trim"],
  suspension: ["drivetrain", "trim"],
  wheels: ["trim"],
  tires: ["trim"],
  engine: ["engine"],
  ignition: ["engine"],
  filtration: ["engine"],
  cooling: ["engine"],
  exhaust: ["engine", "drivetrain"],
  drivetrain: ["drivetrain", "transmission"],
  transmission: ["transmission", "engine"],
  body: ["body", "trim"],
  glass: ["body"],
  lighting: ["body", "market"]
};

const BASE_REQUIRED: FitmentAttribute[] = ["year", "make", "model"];

const FITMENT_CAVEAT =
  "This is a vehicle-context completeness check, NOT a verified fitment guarantee. " +
  "Confirm exact part compatibility against a catalog (e.g. ACES/PIES) before purchase.";

/** Pull the optional fitment fields + source/evidence out of a tool input. */
function toContextInput(input: Record<string, unknown>): VehicleContextInput {
  const out: VehicleContextInput = {};
  for (const attribute of FITMENT_ATTRIBUTES) {
    const value = input[attribute];
    if (value !== undefined) {
      (out as Record<string, unknown>)[attribute] = value;
    }
  }
  if (typeof input.vin === "string") out.vin = input.vin;
  if (typeof input.source === "string") out.source = input.source;
  if (Array.isArray(input.evidence)) out.evidence = input.evidence as EvidenceRecord[];
  return out;
}

export function registerVehicleContextTools(server: ToolRegistrar): void {
  server.registerTool(
    "resolve_vehicle_context",
    {
      title: "Resolve Vehicle Context",
      description:
        "Normalize a partial vehicle profile into a full context: every fitment-critical attribute (year, make, model, trim, engine, drivetrain, transmission, body, market) is returned with a confidence status (confirmed/decoded/inferred/unknown/conflicting) and its evidence. Unknown attributes are listed in missingAttributes. Pass source (user/vpic/garage-memory) to set the status of bare fields, and optional evidence records. Returns confidence, never guaranteed part compatibility.",
      inputSchema: {
        ...fitmentFields,
        source: z.string().optional(),
        evidence: z.array(evidenceRecordSchema).optional()
      },
      annotations: READONLY
    },
    input => ok(normalizeVehicleContext(toContextInput(input)))
  );

  server.registerTool(
    "merge_vehicle_evidence",
    {
      title: "Merge Vehicle Evidence",
      description:
        "Fold new evidence records into a vehicle context. Start from optional base fitment fields (or omit them to start empty). When a new record disagrees with an existing known value, that attribute is marked 'conflicting', BOTH records are kept, and the attribute is surfaced in the returned conflicts list. Filling an unknown attribute or re-asserting the same value is not a conflict.",
      inputSchema: {
        ...fitmentFields,
        source: z.string().optional(),
        evidence: z.array(evidenceRecordSchema).min(1)
      },
      annotations: READONLY
    },
    input => {
      // Build the base from the bare fields only; the evidence array is the
      // payload to MERGE, so it must not also be folded into the base (doing so
      // would pre-resolve the attribute and hide genuine conflicts).
      const baseInput = toContextInput(input);
      delete baseInput.evidence;
      const base = normalizeVehicleContext(baseInput);
      const evidence = (input.evidence as EvidenceRecord[]) ?? [];
      return ok(mergeEvidence(base, evidence));
    }
  );

  server.registerTool(
    "list_missing_fitment_attributes",
    {
      title: "List Missing Fitment Attributes",
      description:
        "Given a partial vehicle profile, return the fitment-critical attributes that are still unknown, each with a reason it matters and the impact of leaving it unresolved. Use this to decide what to ask the user next.",
      inputSchema: {
        ...fitmentFields,
        source: z.string().optional(),
        evidence: z.array(evidenceRecordSchema).optional()
      },
      annotations: READONLY
    },
    input => {
      const context = normalizeVehicleContext(toContextInput(input));
      return ok({ missingAttributes: context.missingAttributes });
    }
  );

  server.registerTool(
    "explain_vehicle_confidence",
    {
      title: "Explain Vehicle Confidence",
      description:
        "Return a structured, human-readable confidence summary for a vehicle profile: per attribute its value, status, and a short sentence, plus what is missing and what is in conflict. Reflects evidence confidence only, never guaranteed part fit.",
      inputSchema: {
        ...fitmentFields,
        source: z.string().optional(),
        evidence: z.array(evidenceRecordSchema).optional()
      },
      annotations: READONLY
    },
    input => ok(explainConfidence(normalizeVehicleContext(toContextInput(input))))
  );

  server.registerTool(
    "check_basic_fitment_context",
    {
      title: "Check Basic Fitment Context",
      description:
        "Heuristic check of whether enough vehicle context is present for a part category (e.g. brakes/suspension want year/make/model plus often drivetrain/trim; engine parts need engine). Returns { sufficient, missingForCategory, caveats }. This is a context-completeness check ONLY and never asserts guaranteed fitment.",
      inputSchema: {
        ...fitmentFields,
        partCategory: z.string().optional()
      },
      annotations: READONLY
    },
    input => {
      const context = normalizeVehicleContext(toContextInput(input));
      const category = typeof input.partCategory === "string" ? input.partCategory.trim().toLowerCase() : "";
      const extra = CATEGORY_REQUIREMENTS[category] ?? [];
      const required = [...new Set<FitmentAttribute>([...BASE_REQUIRED, ...extra])];

      const missingForCategory = required.filter(attribute => context.attributes[attribute]?.value === null);

      const caveats: string[] = [FITMENT_CAVEAT];
      if (!category) {
        caveats.push("No partCategory was provided; only the base year/make/model were checked.");
      } else if (extra.length === 0) {
        caveats.push(
          `Category "${category}" is not in the heuristic map; only base year/make/model were checked. Treat results as a rough guide.`
        );
      }
      if (context.conflicts.length > 0) {
        caveats.push(`Some attributes are in conflict (${context.conflicts.join(", ")}); resolve them before trusting fitment.`);
      }

      return ok({ sufficient: missingForCategory.length === 0, missingForCategory, caveats });
    }
  );

  server.registerTool(
    "record_fitment_correction",
    {
      title: "Record Fitment Correction",
      description:
        "Apply a user correction to one attribute of a vehicle context: it is set to the given value with status 'confirmed' and a user correction evidence record is appended (any prior conflict on it is cleared). This is STATELESS and does NOT persist anything — to remember the correction across sessions, save the returned context via the garage-memory server.",
      inputSchema: {
        ...fitmentFields,
        source: z.string().optional(),
        evidence: z.array(evidenceRecordSchema).optional(),
        attribute: z.string().min(1),
        value: z.union([z.string(), z.number()]),
        note: z.string().optional()
      },
      annotations: READONLY
    },
    input => {
      const base = normalizeVehicleContext(toContextInput(input));
      const corrected = recordCorrection(
        base,
        input.attribute as string,
        input.value as string | number,
        typeof input.note === "string" ? input.note : undefined
      );
      return ok(corrected);
    }
  );
}
