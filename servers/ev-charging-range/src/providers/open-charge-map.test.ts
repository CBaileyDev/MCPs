import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findNearby } from "./open-charge-map.js";

// Documented OCM POI fixture from spec
const OCM_FIXTURE = [
  {
    ID: 12345,
    AddressInfo: {
      Title: "Test Charger",
      AddressLine1: "123 Main St",
      Town: "Springfield",
      StateOrProvince: "IL",
      Latitude: 40.7,
      Longitude: -74.0,
      ContactTelephone1: "555-9876",
      Distance: 1.2
    },
    OperatorInfo: { Title: "ChargePoint Network" },
    UsageCost: "Free",
    StatusType: { IsOperational: true, Title: "Operational" },
    Connections: [
      {
        ConnectionType: { Title: "CCS (Type 2)" },
        PowerKW: 50,
        Level: { Title: "Level 3", IsFastChargeCapable: true },
        Quantity: 2
      }
    ]
  }
];

function mockFetch(json: unknown, ok = true): void {
  global.fetch = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 403,
    statusText: ok ? "OK" : "Forbidden",
    json: async () => json
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  // Ensure clean env state
  delete process.env.OPEN_CHARGE_MAP_API_KEY;
});

afterEach(() => vi.restoreAllMocks());

describe("findNearby — with key set", () => {
  beforeEach(() => {
    process.env.OPEN_CHARGE_MAP_API_KEY = "test-ocm-key";
  });

  it("normalises OCM POIs into ChargingStation objects", async () => {
    mockFetch(OCM_FIXTURE);
    const stations = await findNearby({ lat: 40.7, lon: -74.0, radiusMiles: 10, limit: 5 });
    expect(stations).toHaveLength(1);
    expect(stations[0].id).toBe("12345");
    expect(stations[0].source).toBe("ocm");
    expect(stations[0].name).toBe("Test Charger");
    expect(stations[0].connectors).toEqual(["CCS (Type 2)"]);
    expect(stations[0].dcFastCount).toBe(2);
    expect(stations[0].status).toBe("Operational");
    expect(stations[0].network).toBe("ChargePoint Network");
    expect(stations[0].pricing).toBe("Free");
    expect(stations[0].distanceMiles).toBe(1.2);
  });

  it("includes the key in the request URL", async () => {
    mockFetch(OCM_FIXTURE);
    await findNearby({ lat: 40.7, lon: -74.0, radiusMiles: 10, limit: 5 });
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url: string = call[0];
    expect(url).toContain("key=test-ocm-key");
  });

  it("includes distance and distanceunit in the request URL", async () => {
    mockFetch(OCM_FIXTURE);
    await findNearby({ lat: 40.7, lon: -74.0, radiusMiles: 10, limit: 5 });
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url: string = call[0];
    expect(url).toContain("distanceunit=Miles");
    expect(url).toContain("distance=10");
  });
});

describe("findNearby — without key", () => {
  it("returns empty array and does not call fetch when no key is set", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const stations = await findNearby({ lat: 40.7, lon: -74.0, radiusMiles: 10, limit: 5 });
    expect(stations).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not throw when no key is set", async () => {
    await expect(
      findNearby({ lat: 40.7, lon: -74.0, radiusMiles: 10, limit: 5 })
    ).resolves.toEqual([]);
  });
});
