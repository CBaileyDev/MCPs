/**
 * Evidence summarization and conservative next-step suggestions.
 *
 * Both functions here operate ONLY on supplied evidence and produce framed,
 * caveated output. They never assert a repair diagnosis and never guarantee a
 * specific part or fix. The caveat strings are exported so tools and tests
 * share the exact text.
 */

import { decodeDtcStructure, parseDtc, type DtcRecord } from "./dtc.js";
import type { ReadinessSnapshot } from "./readiness.js";
import type { PidSample } from "./pids.js";

/** Bundle of diagnostic evidence a caller can hand to the summary functions. */
export type DiagnosticEvidence = {
  dtcs?: DtcRecord[];
  readiness?: ReadinessSnapshot;
  samples?: PidSample[];
  /** MIL/status evidence, when available (e.g. from a session). */
  milOn?: boolean;
};

/** Caveat that must appear on every diagnostic summary. */
export const SUMMARY_CAVEAT =
  "This is a summary of the supplied evidence, not a repair diagnosis. " +
  "Confirm any finding against service information and the vehicle before acting.";

/** Caveat that frames every suggested next step. */
export const SUGGESTION_CAVEAT =
  "These are conservative, generic suggestions to verify with service information, " +
  "NOT a confirmed fix or a part-specific recommendation.";

const SYSTEM_LABELS: Record<string, string> = {
  powertrain: "Powertrain (engine/transmission)",
  body: "Body",
  chassis: "Chassis",
  network: "Network/communication"
};

export type EvidenceSummary = {
  milStatus: "on" | "off" | "unknown";
  dtcCount: number;
  dtcCodes: string[];
  /** DTC counts grouped by decoded system. */
  systemsAffected: Array<{ system: string; label: string; codes: string[] }>;
  readiness?: {
    notReadyCount: number;
    notReadyMonitors: string[];
    summary: string;
  };
  sampleCount: number;
  /** Evidence categories that are absent (to guide what to collect next). */
  missingEvidence: string[];
  caveat: string;
};

function groupBySystem(dtcs: DtcRecord[]): EvidenceSummary["systemsAffected"] {
  const bySystem = new Map<string, string[]>();
  for (const dtc of dtcs) {
    const normalized = parseDtc(dtc.code);
    if (!normalized) continue;
    const { system } = decodeDtcStructure(normalized);
    const list = bySystem.get(system) ?? [];
    list.push(normalized);
    bySystem.set(system, list);
  }
  return [...bySystem.entries()].map(([system, codes]) => ({
    system,
    label: SYSTEM_LABELS[system] ?? system,
    codes
  }));
}

/** Summarize what diagnostic evidence exists, what's missing, and MIL/readiness status. */
export function summarizeEvidence(evidence: DiagnosticEvidence): EvidenceSummary {
  const dtcs = evidence.dtcs ?? [];
  const validCodes = dtcs.map(d => parseDtc(d.code)).filter((c): c is string => c !== null);

  const missingEvidence: string[] = [];
  if (dtcs.length === 0) missingEvidence.push("No DTCs provided.");
  if (!evidence.readiness) missingEvidence.push("No readiness-monitor snapshot provided.");
  if (!evidence.samples || evidence.samples.length === 0) {
    missingEvidence.push("No live/freeze-frame PID samples provided.");
  }
  if (evidence.milOn === undefined) missingEvidence.push("MIL (check-engine-light) status unknown.");

  const summary: EvidenceSummary = {
    milStatus: evidence.milOn === undefined ? "unknown" : evidence.milOn ? "on" : "off",
    dtcCount: validCodes.length,
    dtcCodes: validCodes,
    systemsAffected: groupBySystem(dtcs),
    sampleCount: evidence.samples?.length ?? 0,
    missingEvidence,
    caveat: SUMMARY_CAVEAT
  };

  if (evidence.readiness) {
    summary.readiness = {
      notReadyCount: evidence.readiness.notReadyCount,
      notReadyMonitors: evidence.readiness.monitors
        .filter(m => m.state === "not-ready")
        .map(m => m.name),
      summary: evidence.readiness.summary
    };
  }

  return summary;
}

export type NextStepSuggestion = {
  /** Short, generic suggestion text. */
  step: string;
  /** Why it is suggested, framed as verification, not a fix. */
  rationale: string;
  /** Affected system, when the suggestion is tied to grouped DTCs. */
  system?: string;
};

export type NextStepsResult = {
  suggestions: NextStepSuggestion[];
  caveat: string;
};

/**
 * Produce conservative, generic next-step suggestions from evidence. Suggestions
 * are grouped by the affected vehicle system (from DTC structure) and are always
 * framed as things to verify, never confirmed fixes or specific parts.
 */
export function suggestNextSteps(evidence: DiagnosticEvidence): NextStepsResult {
  const suggestions: NextStepSuggestion[] = [];
  const dtcs = evidence.dtcs ?? [];
  const systems = groupBySystem(dtcs);

  for (const group of systems) {
    suggestions.push({
      system: group.system,
      step: `Look up each ${group.label} code (${group.codes.join(", ")}) in service information for this specific vehicle.`,
      rationale:
        "DTC structure only tells you the affected system, not the root cause; the documented diagnostic procedure for each code is what to follow."
    });
  }

  if (dtcs.length === 0) {
    suggestions.push({
      step: "Read stored and pending DTCs (and a freeze frame, if present) before drawing conclusions.",
      rationale: "No codes were supplied, so there is nothing to localize yet."
    });
  }

  if (!evidence.readiness) {
    suggestions.push({
      step: "Capture a readiness-monitor snapshot.",
      rationale: "Readiness state provides context for whether recent repairs or a battery disconnect have reset monitors."
    });
  }

  if (!evidence.samples || evidence.samples.length === 0) {
    suggestions.push({
      step: "Record relevant live PID values while the symptom is present.",
      rationale: "Live data helps confirm whether a sensor reading is plausible before replacing anything."
    });
  }

  // Always include a generic verification reminder.
  suggestions.push({
    step: "Confirm basic conditions (battery voltage, connector/wiring integrity, recent service) before suspecting a component.",
    rationale: "Many codes are caused by power, ground, or wiring issues rather than the named component."
  });

  return { suggestions, caveat: SUGGESTION_CAVEAT };
}
