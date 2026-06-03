import { describe, expect, it } from "vitest";
import { normalizeVehicle, toNumber, fuelEconomyGovUrl } from "./efficiency.js";
import type { RawVehicleRecord } from "./efficiency.js";

const SAMPLE_CAMRY: RawVehicleRecord = {
  make: "Toyota",
  model: "Camry",
  year: "2020",
  trany: "Automatic (S8)",
  displ: "3.5",
  cylinders: "6",
  fuelType: "Regular",
  city08: "22",
  highway08: "33",
  comb08: "26",
  co2TailpipeGpm: "338.0",
  ghgScore: "5",
  fuelCost08: "2600",
  VClass: "Midsize Cars",
  id: "42011"
};

describe("toNumber", () => {
  it("coerces string numbers to numbers", () => {
    expect(toNumber("22")).toBe(22);
    expect(toNumber("3.5")).toBe(3.5);
    expect(toNumber("338.0")).toBe(338);
  });

  it("returns null for empty string", () => {
    expect(toNumber("")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(toNumber(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(toNumber(null)).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(toNumber("abc")).toBeNull();
  });

  it("passes through numbers", () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber(3.14)).toBe(3.14);
  });
});

describe("fuelEconomyGovUrl", () => {
  it("builds the correct URL", () => {
    expect(fuelEconomyGovUrl("42011")).toBe(
      "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42011"
    );
  });

  it("works with numeric ID", () => {
    expect(fuelEconomyGovUrl(42011)).toBe(
      "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42011"
    );
  });
});

describe("normalizeVehicle", () => {
  it("coerces all string fields to correct types", () => {
    const v = normalizeVehicle(SAMPLE_CAMRY);
    expect(v.year).toBe(2020);
    expect(v.displacement).toBe(3.5);
    expect(v.cylinders).toBe(6);
    expect(v.efficiencyRating.cityMpg).toBe(22);
    expect(v.efficiencyRating.highwayMpg).toBe(33);
    expect(v.efficiencyRating.combinedMpg).toBe(26);
    expect(v.emissions.co2TailpipeGpm).toBe(338);
    expect(v.emissions.ghgScore).toBe(5);
    expect(v.estAnnualFuelCost).toBe(2600);
  });

  it("preserves string fields as strings", () => {
    const v = normalizeVehicle(SAMPLE_CAMRY);
    expect(v.make).toBe("Toyota");
    expect(v.model).toBe("Camry");
    expect(v.fuelType).toBe("Regular");
    expect(v.vehicleClass).toBe("Midsize Cars");
    expect(v.transmission).toBe("Automatic (S8)");
  });

  it("returns null for missing fields instead of throwing", () => {
    const v = normalizeVehicle({});
    expect(v.make).toBeNull();
    expect(v.model).toBeNull();
    expect(v.year).toBeNull();
    expect(v.displacement).toBeNull();
    expect(v.cylinders).toBeNull();
    expect(v.fuelType).toBeNull();
    expect(v.efficiencyRating.cityMpg).toBeNull();
    expect(v.efficiencyRating.highwayMpg).toBeNull();
    expect(v.efficiencyRating.combinedMpg).toBeNull();
    expect(v.efficiencyRating.rangeElectric).toBeNull();
    expect(v.emissions.co2TailpipeGpm).toBeNull();
    expect(v.emissions.ghgScore).toBeNull();
    expect(v.emissions.smartwayScore).toBeNull();
    expect(v.emissions.smogRating).toBeNull();
    expect(v.estAnnualFuelCost).toBeNull();
    expect(v.youSaveSpend).toBeNull();
  });

  it("uses vehicleId param when provided", () => {
    const v = normalizeVehicle(SAMPLE_CAMRY, "99999");
    expect(v.vehicleId).toBe("99999");
    expect(v.sourceUrl).toBe("https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=99999");
  });

  it("falls back to raw id when vehicleId param not provided", () => {
    const v = normalizeVehicle(SAMPLE_CAMRY);
    expect(v.vehicleId).toBe("42011");
  });

  it("builds correct source URL", () => {
    const v = normalizeVehicle(SAMPLE_CAMRY);
    expect(v.sourceUrl).toBe("https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42011");
  });

  it("handles smartwayScore and smogRating when present", () => {
    const raw: RawVehicleRecord = { ...SAMPLE_CAMRY, smartwayScore: "7", smogRating: "8", co2: "123.4" };
    const v = normalizeVehicle(raw);
    expect(v.emissions.smartwayScore).toBe(7);
    expect(v.emissions.smogRating).toBe(8);
    expect(v.emissions.co2).toBe(123.4);
  });

  it("handles alt fuel fields (dual-fuel/EV fields)", () => {
    const raw: RawVehicleRecord = {
      ...SAMPLE_CAMRY,
      cityA08: "0",
      highwayA08: "0",
      combA08: "0",
      range: "250"
    };
    const v = normalizeVehicle(raw);
    expect(v.efficiencyRating.cityMpgAlt).toBe(0);
    expect(v.efficiencyRating.rangeElectric).toBe(250);
  });

  it("handles youSaveSpend field", () => {
    const raw: RawVehicleRecord = { ...SAMPLE_CAMRY, youSaveSpend: "-500" };
    const v = normalizeVehicle(raw);
    expect(v.youSaveSpend).toBe(-500);
  });
});
