import { describe, expect, it } from "vitest";
import { explainFitment } from "./fitment.js";

describe("explainFitment", () => {
  it("marks fitment as incomplete when engine details are missing", () => {
    const result = explainFitment({
      year: 2020,
      make: "Toyota",
      model: "Camry",
      category: "Brake Pad",
      engine: undefined,
      partFitmentNotes: ["Front"]
    });

    expect(result.confidence).toBe("needs_more_vehicle_detail");
    expect(result.missingDetails).toEqual(["engine"]);
    expect(result.explanation).toContain("Select an engine or submodel before treating this as confirmed fitment.");
  });

  it("marks fitment as compatible when vehicle, engine, category, and notes are present", () => {
    const result = explainFitment({
      year: 2020,
      make: "Toyota",
      model: "Camry",
      engine: "2.5L L4",
      category: "Brake Pad",
      partFitmentNotes: ["Front", "Ceramic"]
    });

    expect(result.confidence).toBe("compatible");
    expect(result.missingDetails).toEqual([]);
    expect(result.explanation).toContain("2020 Toyota Camry 2.5L L4");
    expect(result.explanation).toContain("Front; Ceramic");
  });
});
