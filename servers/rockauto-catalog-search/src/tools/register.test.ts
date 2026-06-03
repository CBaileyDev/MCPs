import { describe, expect, it } from "vitest";
import { registerRockAutoTools } from "./register.js";
import type { RockAutoCatalogProvider } from "../catalog/provider.js";
import type { NormalizedPart } from "../domain/types.js";

type RegisteredTool = {
  config: { title?: string; description?: string };
  handler: (input: unknown) => Promise<unknown>;
};

class FakeMcpServer {
  readonly tools = new Map<string, RegisteredTool>();

  registerTool(name: string, config: { title?: string; description?: string }, handler: (input: unknown) => Promise<unknown>): void {
    this.tools.set(name, { config, handler });
  }
}

const part: NormalizedPart = {
  id: "pf48e",
  brand: "ACDELCO",
  partNumber: "PF48E",
  title: "Oil Filter",
  price: { amount: 6.22, currency: "USD", display: "$6.22" },
  availability: "In stock",
  fitmentNotes: ["Check fitment against selected engine"],
  sourceUrl: "https://www.rockauto.com/en/partsearch/?partnum=PF48E",
  fetchedAt: "2026-06-03T00:00:00.000Z"
};

const provider: RockAutoCatalogProvider = {
  searchVehicle: async input => ({
    query: input,
    vehicles: [{ year: input.year, make: input.make, model: input.model, sourceUrl: "https://www.rockauto.com/en/catalog/toyota,2020,camry" }],
    fetchedAt: "2026-06-03T00:00:00.000Z"
  }),
  listVehicleOptions: async () => ({
    options: [{ engine: "2.5L L4", carCode: "3445372", sourceUrl: "https://www.rockauto.com/en/catalog/toyota,2020,camry,2.5l+l4,3445372" }],
    fetchedAt: "2026-06-03T00:00:00.000Z"
  }),
  listPartCategories: async () => ({
    categories: [{ name: "Brake & Wheel Hub", sourceUrl: "https://www.rockauto.com/en/catalog/toyota,2020,camry,2.5l+l4,3445372,brake+&+wheel+hub" }],
    fetchedAt: "2026-06-03T00:00:00.000Z"
  }),
  searchParts: async input => ({
    query: input,
    parts: [part],
    sourceUrl: "https://www.rockauto.com/en/catalog/toyota,2020,camry,2.5l+l4,3445372,brake+&+wheel+hub,brake+pad,1684",
    fetchedAt: "2026-06-03T00:00:00.000Z"
  }),
  searchPartNumber: async input => ({
    query: input.partNumber,
    parts: [part],
    sourceUrl: "https://www.rockauto.com/en/partsearch/?partnum=PF48E",
    fetchedAt: "2026-06-03T00:00:00.000Z"
  }),
  getPartDetails: async input => ({
    part: { ...part, sourceUrl: input.sourceUrl },
    fetchedAt: "2026-06-03T00:00:00.000Z"
  })
};

describe("registerRockAutoTools", () => {
  it("registers the eight v1 catalog/search tools", () => {
    const server = new FakeMcpServer();

    registerRockAutoTools(server, provider);

    expect([...server.tools.keys()]).toEqual([
      "search_vehicle",
      "list_vehicle_options",
      "list_part_categories",
      "search_parts",
      "search_part_number",
      "get_part_details",
      "compare_parts",
      "explain_fitment"
    ]);
  });

  it("routes part number searches through the provider and returns structured content", async () => {
    const server = new FakeMcpServer();
    registerRockAutoTools(server, provider);

    const result = await server.tools.get("search_part_number")?.handler({ partNumber: "PF48E" });

    expect(result).toMatchObject({
      structuredContent: {
        query: "PF48E",
        parts: [{ brand: "ACDELCO", partNumber: "PF48E" }]
      }
    });
  });

  it("uses pure comparison logic for compare_parts", async () => {
    const server = new FakeMcpServer();
    registerRockAutoTools(server, provider);

    const result = await server.tools.get("compare_parts")?.handler({
      parts: [
        { ...part, id: "expensive", price: { amount: 10, currency: "USD", display: "$10.00" } },
        { ...part, id: "cheap", price: { amount: 5, currency: "USD", display: "$5.00" } }
      ]
    });

    expect(result).toMatchObject({
      structuredContent: {
        parts: [{ id: "cheap" }, { id: "expensive" }]
      }
    });
  });
});
