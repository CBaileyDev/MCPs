import type { FitmentExplanation, FitmentInput } from "./types.js";

export function explainFitment(input: FitmentInput): FitmentExplanation {
  const missingDetails: string[] = [];

  if (!input.engine) {
    missingDetails.push("engine");
  }

  if (!input.category) {
    missingDetails.push("category");
  }

  const vehicle = [input.year, input.make, input.model, input.engine]
    .filter(value => value !== undefined && String(value).trim().length > 0)
    .join(" ");
  const notes = input.partFitmentNotes.length > 0 ? input.partFitmentNotes.join("; ") : "No part-specific notes provided.";

  if (missingDetails.length > 0) {
    return {
      confidence: "needs_more_vehicle_detail",
      missingDetails,
      explanation: `${vehicle} needs more detail for ${input.category ?? "the requested category"}. Select an engine or submodel before treating this as confirmed fitment. Notes: ${notes}`
    };
  }

  return {
    confidence: "compatible",
    missingDetails,
    explanation: `${vehicle} has the required vehicle detail for ${input.category}. Part notes: ${notes}`
  };
}
