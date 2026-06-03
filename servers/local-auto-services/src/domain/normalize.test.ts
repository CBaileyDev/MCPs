import { describe, expect, it } from "vitest";
import { normalizeElement, OSM_ATTRIBUTION, type OverpassElement } from "./normalize.js";

describe("normalizeElement", () => {
  it("normalizes a node with top-level lat/lon", () => {
    const element: OverpassElement = {
      type: "node",
      id: 2523660944,
      lat: 40.702026,
      lon: -73.9929402,
      tags: {
        name: "New Xcell Auto Repair",
        shop: "car_repair",
        phone: "+1-718-555-0100",
        opening_hours: "Mo-Fr 08:00-18:00",
        "addr:housenumber": "123",
        "addr:street": "Main St",
        "addr:city": "Brooklyn",
        "addr:state": "NY",
        website: "https://example.com",
      },
    };

    const result = normalizeElement(element, "repair");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("node/2523660944");
    expect(result!.lat).toBe(40.702026);
    expect(result!.lon).toBe(-73.9929402);
    expect(result!.name).toBe("New Xcell Auto Repair");
    expect(result!.category).toBe("repair");
    expect(result!.phone).toBe("+1-718-555-0100");
    expect(result!.openingHours).toBe("Mo-Fr 08:00-18:00");
    expect(result!.website).toBe("https://example.com");
    expect(result!.address).toBe("123 Main St, Brooklyn, NY");
    expect(result!.source).toBe("openstreetmap");
    expect(result!.osmType).toBe("node");
    expect(result!.osmId).toBe(2523660944);
    expect(result!.attribution).toBe(OSM_ATTRIBUTION);
  });

  it("normalizes a way with coordinates under center", () => {
    const element: OverpassElement = {
      type: "way",
      id: 987654321,
      center: { lat: 34.052235, lon: -118.243683 },
      tags: {
        name: "LA Tires",
        shop: "tyres",
      },
    };

    const result = normalizeElement(element, "tires");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("way/987654321");
    expect(result!.lat).toBe(34.052235);
    expect(result!.lon).toBe(-118.243683);
    expect(result!.name).toBe("LA Tires");
    expect(result!.category).toBe("tires");
    expect(result!.osmType).toBe("way");
    expect(result!.osmId).toBe(987654321);
  });

  it("tolerates missing tags and returns null name when name tag absent", () => {
    const element: OverpassElement = {
      type: "node",
      id: 111,
      lat: 51.5,
      lon: -0.1,
      tags: {
        amenity: "fuel",
      },
    };

    const result = normalizeElement(element, "fuel");
    expect(result).not.toBeNull();
    expect(result!.name).toBeNull();
    expect(result!.phone).toBeUndefined();
    expect(result!.website).toBeUndefined();
    expect(result!.openingHours).toBeUndefined();
    expect(result!.address).toBeUndefined();
  });

  it("builds address without housenumber when only street is present", () => {
    const element: OverpassElement = {
      type: "node",
      id: 222,
      lat: 40.0,
      lon: -75.0,
      tags: {
        name: "Parts Plus",
        "addr:street": "Oak Ave",
        "addr:city": "Philadelphia",
      },
    };

    const result = normalizeElement(element, "parts");
    expect(result!.address).toBe("Oak Ave, Philadelphia");
  });

  it("returns null when element has no coordinates", () => {
    const element: OverpassElement = {
      type: "way",
      id: 333,
      // No lat/lon and no center
      tags: { shop: "car_repair" },
    };

    const result = normalizeElement(element, "repair");
    expect(result).toBeNull();
  });

  it("includes attribution in every result", () => {
    const element: OverpassElement = {
      type: "node",
      id: 444,
      lat: 48.8566,
      lon: 2.3522,
      tags: {},
    };

    const result = normalizeElement(element, "fuel");
    expect(result!.attribution).toContain("OpenStreetMap");
    expect(result!.attribution).toContain("ODbL");
  });

  it("prefers contact:phone when phone tag is absent", () => {
    const element: OverpassElement = {
      type: "node",
      id: 555,
      lat: 40.0,
      lon: -74.0,
      tags: {
        "contact:phone": "+1-555-9876",
      },
    };

    const result = normalizeElement(element, "repair");
    expect(result!.phone).toBe("+1-555-9876");
  });
});
