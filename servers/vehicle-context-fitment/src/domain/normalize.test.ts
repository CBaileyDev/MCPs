import { describe, expect, it } from "vitest";
import { normalizeVehicleContext } from "./normalize.js";
import { FITMENT_ATTRIBUTES } from "./types.js";

describe("normalizeVehicleContext", () => {
  it("retains provided user fields as confirmed with synthesized evidence", () => {
    const context = normalizeVehicleContext({ year: 2019, make: "Toyota", model: "Camry", engine: "2.5L L4" });

    expect(context.attributes.make.value).toBe("Toyota");
    expect(context.attributes.make.status).toBe("confirmed");
    // a bare provided field must carry at least one evidence record
    expect(context.attributes.make.evidence.length).toBeGreaterThan(0);
    expect(context.attributes.make.evidence[0]).toMatchObject({ source: "user", field: "make", value: "Toyota" });
    expect(context.attributes.year.value).toBe(2019);
    expect(context.attributes.engine.value).toBe("2.5L L4");
  });

  it("marks provided fields as decoded when the source is vpic", () => {
    const context = normalizeVehicleContext({ make: "Honda", model: "Civic", source: "vpic" });

    expect(context.attributes.make.status).toBe("decoded");
    expect(context.attributes.make.evidence[0]).toMatchObject({ source: "vpic", status: "decoded" });
  });

  it("makes every unknown fitment-critical field explicit and lists it as missing", () => {
    const context = normalizeVehicleContext({ year: 2019, make: "Toyota", model: "Camry", engine: "2.5L L4" });

    // every canonical fitment attribute is present, known or not
    for (const attribute of FITMENT_ATTRIBUTES) {
      expect(context.attributes[attribute]).toBeDefined();
    }

    // drivetrain was not provided -> explicit unknown + null + listed as missing
    expect(context.attributes.drivetrain.value).toBeNull();
    expect(context.attributes.drivetrain.status).toBe("unknown");
    expect(context.attributes.drivetrain.evidence).toEqual([]);

    const missingNames = context.missingAttributes.map(m => m.attribute);
    expect(missingNames).toContain("drivetrain");
    expect(missingNames).toContain("trim");
    expect(missingNames).toContain("transmission");
    // provided fields must NOT be reported as missing
    expect(missingNames).not.toContain("make");
    expect(missingNames).not.toContain("engine");

    // missing entries carry real reason/impact strings
    const drivetrain = context.missingAttributes.find(m => m.attribute === "drivetrain");
    expect(drivetrain?.reason.length).toBeGreaterThan(0);
    expect(drivetrain?.impact.length).toBeGreaterThan(0);
  });

  it("treats vin as an optional identifier: present only when given, never missing", () => {
    const without = normalizeVehicleContext({ make: "Toyota" });
    expect(without.attributes.vin).toBeUndefined();
    expect(without.missingAttributes.map(m => m.attribute)).not.toContain("vin");

    const withVin = normalizeVehicleContext({ make: "Toyota", vin: "4T1BF1FK5CU000001" });
    expect(withVin.attributes.vin?.value).toBe("4T1BF1FK5CU000001");
    expect(withVin.missingAttributes.map(m => m.attribute)).not.toContain("vin");
  });

  it("folds explicit evidence records in and uses their own status", () => {
    const context = normalizeVehicleContext({
      make: "Toyota",
      evidence: [{ source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" }]
    });

    expect(context.attributes.drivetrain.value).toBe("AWD");
    expect(context.attributes.drivetrain.status).toBe("decoded");
    expect(context.missingAttributes.map(m => m.attribute)).not.toContain("drivetrain");
  });

  it("detects a conflict when folded evidence disagrees with a bare field (same as mergeEvidence)", () => {
    const context = normalizeVehicleContext({
      drivetrain: "FWD",
      source: "user",
      evidence: [{ source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" }]
    });

    // disagreement -> conflicting, existing (bare) value retained, both records kept
    expect(context.attributes.drivetrain.status).toBe("conflicting");
    expect(context.attributes.drivetrain.value).toBe("FWD");
    expect(context.conflicts).toContain("drivetrain");
    const values = context.attributes.drivetrain.evidence.map(e => e.value);
    expect(values).toContain("FWD");
    expect(values).toContain("AWD");
    expect(context.attributes.drivetrain.evidence.length).toBe(2);
  });

  it("detects a conflict when two evidence records (no bare field) disagree", () => {
    const context = normalizeVehicleContext({
      evidence: [
        { source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" },
        { source: "garage-memory", field: "drivetrain", value: "FWD", status: "inferred" }
      ]
    });

    // first record fills, second disagrees -> conflict; first value retained
    expect(context.attributes.drivetrain.status).toBe("conflicting");
    expect(context.attributes.drivetrain.value).toBe("AWD");
    expect(context.conflicts).toContain("drivetrain");
    expect(context.attributes.drivetrain.evidence.length).toBe(2);
  });

  it("does not flag a conflict when folded evidence re-asserts the same bare value", () => {
    const context = normalizeVehicleContext({
      drivetrain: "AWD",
      evidence: [{ source: "vpic", field: "drivetrain", value: "AWD", status: "decoded" }]
    });

    expect(context.attributes.drivetrain.status).not.toBe("conflicting");
    expect(context.conflicts).not.toContain("drivetrain");
    expect(context.attributes.drivetrain.evidence.length).toBe(2);
  });

  it("ignores evidence whose field is not a recognized fitment attribute (or vin)", () => {
    const context = normalizeVehicleContext({
      make: "Toyota",
      evidence: [
        { source: "garage-memory", field: "color", value: "red", status: "inferred" },
        { source: "vpic", field: "vin", value: "4T1BF1FK5CU000001", status: "decoded" }
      ]
    });

    // unrecognized "color" never enters the attributes map
    expect(context.attributes.color).toBeUndefined();
    // a recognized non-fitment identifier (vin) is still folded
    expect(context.attributes.vin?.value).toBe("4T1BF1FK5CU000001");
    // the bare make is untouched
    expect(context.attributes.make.value).toBe("Toyota");
  });

  it("starts fully empty when given no fields", () => {
    const context = normalizeVehicleContext({});
    expect(context.missingAttributes).toHaveLength(FITMENT_ATTRIBUTES.length);
    expect(context.conflicts).toEqual([]);
    expect(context.attributes.year.status).toBe("unknown");
  });
});
