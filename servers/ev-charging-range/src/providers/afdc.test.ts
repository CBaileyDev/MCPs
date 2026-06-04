import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findNearest, getById } from "./afdc.js";

// Real-shaped AFDC fixture based on spec sample
const AFDC_FIXTURE = {
  total_results: 2,
  fuel_stations: [
    {
      id: 326605,
      station_name: "10 Reade St",
      latitude: 40.7138982,
      longitude: -74.00434,
      ev_network: "FLO",
      ev_connector_types: ["J1772"],
      ev_dc_fast_num: null,
      ev_level2_evse_num: 2,
      access_code: "public",
      ev_pricing: null,
      station_phone: "555-1234",
      status_code: "E",
      distance: 0.115,
      street_address: "10 Reade St",
      city: "New York",
      state: "NY"
    },
    {
      id: 999,
      station_name: "Fast Charger Station",
      latitude: 40.72,
      longitude: -74.01,
      ev_network: "Tesla",
      ev_connector_types: ["J1772COMBO", "CHADEMO"],
      ev_dc_fast_num: 4,
      ev_level2_evse_num: null,
      access_code: "public",
      ev_pricing: "per kWh",
      station_phone: null,
      status_code: "E",
      distance: 0.5,
      street_address: "999 Broadway",
      city: "New York",
      state: "NY"
    }
  ]
};

const AFDC_BY_ID_FIXTURE = {
  alt_fuel_station: AFDC_FIXTURE.fuel_stations[0]
};

function mockFetch(json: unknown, ok = true, status = 200): void {
  global.fetch = vi.fn(async () => ({
    ok,
    status,
    statusText: ok ? "OK" : "Forbidden",
    json: async () => json
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  // Clear env overrides before each test
  delete process.env.AFDC_API_KEY;
  delete process.env.AFDC_BASE;
});

afterEach(() => vi.restoreAllMocks());

describe("findNearest", () => {
  it("includes fuel_type=ELEC in the request URL", async () => {
    mockFetch(AFDC_FIXTURE);
    await findNearest({ lat: 40.71, lon: -74.0, radiusMiles: 5, limit: 10 });
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url: string = call[0];
    expect(url).toContain("fuel_type=ELEC");
  });

  it("includes api_key in the request URL", async () => {
    mockFetch(AFDC_FIXTURE);
    await findNearest({ lat: 40.71, lon: -74.0, radiusMiles: 5, limit: 10 });
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url: string = call[0];
    expect(url).toContain("api_key=");
  });

  it("normalises stations correctly", async () => {
    mockFetch(AFDC_FIXTURE);
    const { stations } = await findNearest({ lat: 40.71, lon: -74.0, radiusMiles: 5, limit: 10 });
    expect(stations).toHaveLength(2);
    expect(stations[0].id).toBe("326605");
    expect(stations[0].source).toBe("afdc");
    expect(stations[0].name).toBe("10 Reade St");
    expect(stations[0].connectors).toEqual(["J1772"]);
    expect(stations[0].status).toBe("available");
  });

  it("falls back to DEMO_KEY when AFDC_API_KEY is not set", async () => {
    mockFetch(AFDC_FIXTURE);
    const { usingDemoKey } = await findNearest({ lat: 40.71, lon: -74.0, radiusMiles: 5, limit: 10 });
    expect(usingDemoKey).toBe(true);
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url: string = call[0];
    expect(url).toContain("api_key=DEMO_KEY");
  });

  it("uses the provided API key when AFDC_API_KEY is set", async () => {
    process.env.AFDC_API_KEY = "my-real-key";
    mockFetch(AFDC_FIXTURE);
    const { usingDemoKey } = await findNearest({ lat: 40.71, lon: -74.0, radiusMiles: 5, limit: 10 });
    expect(usingDemoKey).toBe(false);
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url: string = call[0];
    expect(url).toContain("api_key=my-real-key");
  });

  it("uses a custom AFDC_BASE when set", async () => {
    process.env.AFDC_BASE = "https://custom.example.com/api";
    mockFetch(AFDC_FIXTURE);
    await findNearest({ lat: 40.71, lon: -74.0, radiusMiles: 5, limit: 10 });
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url: string = call[0];
    expect(url).toContain("https://custom.example.com/api/nearest.json");
  });

  it("returns totalResults from the API response", async () => {
    mockFetch(AFDC_FIXTURE);
    const { totalResults } = await findNearest({ lat: 40.71, lon: -74.0, radiusMiles: 5, limit: 10 });
    expect(totalResults).toBe(2);
  });
});

describe("getById", () => {
  it("returns a normalised station for the given ID", async () => {
    mockFetch(AFDC_BY_ID_FIXTURE);
    const station = await getById("326605");
    expect(station.id).toBe("326605");
    expect(station.source).toBe("afdc");
    expect(station.name).toBe("10 Reade St");
    expect(station.status).toBe("available");
  });

  it("includes the ID and api_key in the URL", async () => {
    mockFetch(AFDC_BY_ID_FIXTURE);
    await getById("326605");
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url: string = call[0];
    expect(url).toContain("326605");
    expect(url).toContain("api_key=");
  });
});
