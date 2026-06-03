export type Price = {
  amount: number;
  currency: "USD";
  display: string;
};

export type NormalizedPart = {
  id: string;
  brand: string;
  partNumber: string;
  title: string;
  price: Price | null;
  availability: string | null;
  fitmentNotes: string[];
  sourceUrl: string;
  fetchedAt: string;
};

export type PartComparison = {
  parts: NormalizedPart[];
  summary: string;
};

export type FitmentConfidence = "compatible" | "needs_more_vehicle_detail";

export type FitmentInput = {
  year: number;
  make: string;
  model: string;
  engine?: string;
  category?: string;
  partFitmentNotes: string[];
};

export type FitmentExplanation = {
  confidence: FitmentConfidence;
  missingDetails: string[];
  explanation: string;
};
