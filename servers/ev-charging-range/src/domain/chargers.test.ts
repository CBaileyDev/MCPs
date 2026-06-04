import { describe, expect, it } from "vitest";
import { fromAfdc, fromOcm, type AfdcStation, type OcmPoi } from "./chargers.js";

// Real AFDC sample shape from the spec
const AFDC_SAMPLE: AfdcStation = {
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
};

// Documented OCM POI shape from the spec
const OCM_SAMPLE: OcmPoi = {
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
};

describe("fromAfdc", () => {
  it("maps the real AFDC sample correctly", () => {
    const station = fromAfdc(AFDC_SAMPLE);
    expect(station.id).toBe("326605");
    expect(station.source).toBe("afdc");
    expect(station.name).toBe("10 Reade St");
    expect(station.lat).toBe(40.7138982);
    expect(station.lon).toBe(-74.00434);
    expect(station.network).toBe("FLO");
    expect(station.connectors).toEqual(["J1772"]);
    expect(station.level2Count).toBe(2);
    expect(station.dcFastCount).toBeUndefined();
    expect(station.accessCode).toBe("public");
    expect(station.pricing).toBeUndefined();
    expect(station.phone).toBe("555-1234");
    expect(station.distanceMiles).toBe(0.115);
    expect(station.address).toBe("10 Reade St, New York, NY");
  });

  it("maps status E to 'available' with a staleness note", () => {
    const station = fromAfdc(AFDC_SAMPLE);
    expect(station.status).toBe("available");
    expect(station.statusNote).toContain("stale");
  });

  it("maps status P to 'planned'", () => {
    const station = fromAfdc({ ...AFDC_SAMPLE, status_code: "P" });
    expect(station.status).toBe("planned");
  });

  it("maps status T to 'temporarily unavailable'", () => {
    const station = fromAfdc({ ...AFDC_SAMPLE, status_code: "T" });
    expect(station.status).toBe("temporarily unavailable");
  });

  it("leaves status undefined when source omits it", () => {
    const station = fromAfdc({ ...AFDC_SAMPLE, status_code: null });
    expect(station.status).toBeUndefined();
    expect(station.statusNote).toBeUndefined();
  });

  it("handles null ev_connector_types gracefully", () => {
    const station = fromAfdc({ ...AFDC_SAMPLE, ev_connector_types: null });
    expect(station.connectors).toEqual([]);
  });
});

describe("fromOcm", () => {
  it("maps the documented OCM POI correctly", () => {
    const station = fromOcm(OCM_SAMPLE)!;
    expect(station.id).toBe("12345");
    expect(station.source).toBe("ocm");
    expect(station.name).toBe("Test Charger");
    expect(station.lat).toBe(40.7);
    expect(station.lon).toBe(-74.0);
    expect(station.network).toBe("ChargePoint Network");
    expect(station.connectors).toEqual(["CCS (Type 2)"]);
    expect(station.dcFastCount).toBe(2);
    expect(station.pricing).toBe("Free");
    expect(station.phone).toBe("555-9876");
    expect(station.distanceMiles).toBe(1.2);
    expect(station.address).toBe("123 Main St, Springfield, IL");
  });

  it("maps operational status correctly with staleness note", () => {
    const station = fromOcm(OCM_SAMPLE)!;
    expect(station.status).toBe("Operational");
    expect(station.statusNote).toContain("stale");
  });

  it("maps non-operational status correctly", () => {
    const poi: OcmPoi = {
      ...OCM_SAMPLE,
      StatusType: { IsOperational: false, Title: "Not Operational" }
    };
    const station = fromOcm(poi)!;
    expect(station.status).toBe("Not Operational");
  });

  it("leaves status undefined when StatusType is null", () => {
    const poi: OcmPoi = { ...OCM_SAMPLE, StatusType: null };
    const station = fromOcm(poi)!;
    expect(station.status).toBeUndefined();
    expect(station.statusNote).toBeUndefined();
  });

  it("leaves status undefined when StatusType omitted", () => {
    const poi: OcmPoi = { ...OCM_SAMPLE, StatusType: undefined };
    const station = fromOcm(poi)!;
    expect(station.status).toBeUndefined();
  });

  it("maps DC fast count from IsFastChargeCapable connections", () => {
    const station = fromOcm(OCM_SAMPLE)!;
    expect(station.dcFastCount).toBe(2);
  });

  it("returns null when the POI has no coordinates (never places it at Null Island)", () => {
    const poi: OcmPoi = { ID: 999, AddressInfo: { Title: "No Coords" } };
    expect(fromOcm(poi)).toBeNull();
  });
});
