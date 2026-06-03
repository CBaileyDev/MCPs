import { describe, expect, it } from "vitest";
import { normalizeVehicleContext } from "./normalize.js";
import { explainConfidence, mergeEvidence, recordCorrection } from "./confidence.js";
import type { VehicleContext } from "./types.js";

describe("mergeEvidence", () => {
  it("marks an attribute conflicting and keeps BOTH records when two sources disagree", () => {
    const base = normalizeVehicleContext({
      drivetrain: "FWD",
      source: "user"
    });
    expect(base.attributes.drivetrain.status).toBe("confirmed");

    const merged = mergeEvidence(base, [
      { source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" }
    ]);

    expect(merged.attributes.drivetrain.status).toBe("conflicting");
    expect(merged.conflicts).toContain("drivetrain");
    // both the original user record and the new vpic record survive
    const values = merged.attributes.drivetrain.evidence.map(e => e.value);
    expect(values).toContain("FWD");
    expect(values).toContain("AWD");
    expect(merged.attributes.drivetrain.evidence.length).toBe(2);
  });

  it("fills an unknown attribute without flagging a conflict", () => {
    const base = normalizeVehicleContext({ make: "Toyota" });
    expect(base.attributes.drivetrain.status).toBe("unknown");

    const merged = mergeEvidence(base, [
      { source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" }
    ]);

    expect(merged.attributes.drivetrain.value).toBe("AWD");
    expect(merged.attributes.drivetrain.status).toBe("decoded");
    expect(merged.conflicts).not.toContain("drivetrain");
    expect(merged.missingAttributes.map(m => m.attribute)).not.toContain("drivetrain");
  });

  it("does not flag a conflict when a source re-asserts the same value", () => {
    const base = normalizeVehicleContext({ drivetrain: "AWD" });
    const merged = mergeEvidence(base, [
      { source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" }
    ]);

    expect(merged.attributes.drivetrain.status).not.toBe("conflicting");
    expect(merged.conflicts).not.toContain("drivetrain");
    expect(merged.attributes.drivetrain.evidence.length).toBe(2);
  });

  it("is pure: it does not mutate the input context", () => {
    const base = normalizeVehicleContext({ drivetrain: "FWD" });
    const baseEvidenceCount = base.attributes.drivetrain.evidence.length;

    mergeEvidence(base, [{ source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" }]);

    expect(base.attributes.drivetrain.status).toBe("confirmed");
    expect(base.attributes.drivetrain.evidence.length).toBe(baseEvidenceCount);
    expect(base.conflicts).toEqual([]);
  });

  it("resolves the SAME disagreeing input identically through the resolve and merge paths", () => {
    const evidence = [{ source: "vpic" as const, field: "drivetrain", value: "AWD", status: "decoded" as const }];

    // RESOLVE path: normalize folds the evidence directly.
    const resolved = normalizeVehicleContext({ drivetrain: "FWD", source: "user", evidence });

    // MERGE path: normalize the bare base (no evidence), then merge the evidence.
    const merged = mergeEvidence(normalizeVehicleContext({ drivetrain: "FWD", source: "user" }), evidence);

    // The asymmetry is gone: same conflicts and same resolved attribute.
    expect(resolved.conflicts).toEqual(merged.conflicts);
    expect(resolved.conflicts).toContain("drivetrain");
    expect(resolved.attributes.drivetrain).toEqual(merged.attributes.drivetrain);
    expect(resolved.attributes.drivetrain.status).toBe("conflicting");
    expect(resolved.attributes.drivetrain.value).toBe("FWD");
  });
});

describe("recordCorrection", () => {
  it("sets the attribute to the corrected value with status confirmed and a user record", () => {
    const base = normalizeVehicleContext({ drivetrain: "FWD", source: "vpic" });
    const corrected = recordCorrection(base, "drivetrain", "AWD", "owner confirmed AWD badge");

    expect(corrected.attributes.drivetrain.value).toBe("AWD");
    expect(corrected.attributes.drivetrain.status).toBe("confirmed");
    const last = corrected.attributes.drivetrain.evidence.at(-1);
    expect(last).toMatchObject({ source: "user", field: "drivetrain", value: "AWD", status: "confirmed" });
    expect(last?.notes).toContain("owner confirmed");
  });

  it("clears any prior conflict on the corrected attribute and removes it from missing", () => {
    const conflicting = mergeEvidence(normalizeVehicleContext({ drivetrain: "FWD" }), [
      { source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" }
    ]);
    expect(conflicting.conflicts).toContain("drivetrain");

    const corrected = recordCorrection(conflicting, "drivetrain", "AWD");
    expect(corrected.conflicts).not.toContain("drivetrain");

    // correcting a previously-missing attribute removes it from the missing list
    const fixedMissing = recordCorrection(normalizeVehicleContext({ make: "Toyota" }), "trim", "LE");
    expect(fixedMissing.missingAttributes.map(m => m.attribute)).not.toContain("trim");
  });

  it("is pure: it does not mutate the input context", () => {
    const base = normalizeVehicleContext({ drivetrain: "FWD" });
    recordCorrection(base, "drivetrain", "AWD");
    expect(base.attributes.drivetrain.value).toBe("FWD");
  });
});

describe("explainConfidence", () => {
  it("summarizes each attribute with value, status, and a sentence, plus the missing list", () => {
    const context: VehicleContext = normalizeVehicleContext({ year: 2019, make: "Toyota", model: "Camry" });
    const summary = explainConfidence(context);

    const make = summary.attributes.find(a => a.attribute === "make");
    expect(make?.value).toBe("Toyota");
    expect(make?.status).toBe("confirmed");
    expect(make?.summary.length).toBeGreaterThan(0);

    expect(summary.missing.map(m => m.attribute)).toContain("drivetrain");
    expect(summary.conflicts).toEqual([]);
  });

  it("headline carries the 'not guaranteed part compatibility' safety phrasing", () => {
    const summary = explainConfidence(normalizeVehicleContext({ make: "Toyota" }));
    expect(summary.headline).toContain("not guaranteed part compatibility");
  });

  it("surfaces conflicts in the summary and headline (now that resolve can produce them)", () => {
    const context = normalizeVehicleContext({
      drivetrain: "FWD",
      source: "user",
      evidence: [{ source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" }]
    });
    const summary = explainConfidence(context);

    expect(summary.conflicts).toContain("drivetrain");
    expect(summary.headline).toContain("conflict");
    const drivetrain = summary.attributes.find(a => a.attribute === "drivetrain");
    expect(drivetrain?.status).toBe("conflicting");
  });
});
