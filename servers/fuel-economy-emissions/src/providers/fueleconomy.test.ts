import { afterEach, describe, expect, it, vi } from "vitest";
import { getMakes, getModels, getOptions, getVehicle, getFuelPrices } from "./fueleconomy.js";

function mockFetch(json: unknown): void {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => json
  })) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe("getMakes", () => {
  it("returns array when menuItem is an array", async () => {
    mockFetch({
      menuItem: [
        { text: "Acura", value: "Acura" },
        { text: "Toyota", value: "Toyota" }
      ]
    });
    const result = await getMakes(2020);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Acura");
    expect(result[1].text).toBe("Toyota");
  });

  it("normalizes single menuItem object to array", async () => {
    mockFetch({ menuItem: { text: "Tesla", value: "Tesla" } });
    const result = await getMakes(2024);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Tesla");
  });

  it("returns empty array when menuItem is missing", async () => {
    mockFetch({});
    const result = await getMakes(2020);
    expect(result).toEqual([]);
  });
});

describe("getModels", () => {
  it("returns models as array", async () => {
    mockFetch({
      menuItem: [
        { text: "Camry", value: "Camry" },
        { text: "Corolla", value: "Corolla" }
      ]
    });
    const result = await getModels(2020, "Toyota");
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Camry");
  });

  it("normalizes single model object to array", async () => {
    mockFetch({ menuItem: { text: "Prius", value: "Prius" } });
    const result = await getModels(2022, "Toyota");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Prius");
  });
});

describe("getOptions", () => {
  it("maps menuItem to {label, vehicleId} format", async () => {
    mockFetch({
      menuItem: [
        { text: "Auto (S8), 6 cyl, 3.5 L", value: "42011" },
        { text: "Auto (S8), 4 cyl, 2.5 L", value: "42012" }
      ]
    });
    const result = await getOptions(2020, "Toyota", "Camry");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ label: "Auto (S8), 6 cyl, 3.5 L", vehicleId: "42011" });
    expect(result[1]).toEqual({ label: "Auto (S8), 4 cyl, 2.5 L", vehicleId: "42012" });
  });

  it("normalizes single menuItem object to array and maps correctly", async () => {
    mockFetch({
      menuItem: { text: "Auto (S8), 6 cyl, 3.5 L", value: "42011" }
    });
    const result = await getOptions(2020, "Toyota", "Camry");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ label: "Auto (S8), 6 cyl, 3.5 L", vehicleId: "42011" });
  });

  it("returns empty array when menuItem is missing", async () => {
    mockFetch({});
    const result = await getOptions(2020, "Toyota", "Camry");
    expect(result).toEqual([]);
  });
});

describe("getVehicle", () => {
  it("returns raw vehicle record", async () => {
    const vehicleFixture = {
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
      VClass: "Midsize Cars"
    };
    mockFetch(vehicleFixture);
    const result = await getVehicle("42011");
    expect(result.make).toBe("Toyota");
    expect(result.model).toBe("Camry");
    // Confirm raw strings are preserved (normalization happens in efficiency.ts)
    expect(result.city08).toBe("22");
    expect(result.co2TailpipeGpm).toBe("338.0");
  });
});

describe("getFuelPrices", () => {
  it("coerces string values to numbers", async () => {
    mockFetch({
      cng: "2.96",
      diesel: "5.64",
      e85: "2.63",
      electric: "0.15",
      lpg: "3.42",
      midgrade: "5.07",
      premium: "5.45",
      regular: "4.5"
    });
    const result = await getFuelPrices();
    expect(result.regular).toBe(4.5);
    expect(result.electric).toBe(0.15);
    expect(result.diesel).toBe(5.64);
    expect(result.premium).toBe(5.45);
    expect(result.cng).toBe(2.96);
    expect(result.e85).toBe(2.63);
    expect(result.lpg).toBe(3.42);
    expect(result.midgrade).toBe(5.07);
  });

  it("returns null for missing or empty fields", async () => {
    mockFetch({ regular: "4.5" });
    const result = await getFuelPrices();
    expect(result.regular).toBe(4.5);
    expect(result.diesel).toBeNull();
    expect(result.electric).toBeNull();
    expect(result.premium).toBeNull();
  });
});
