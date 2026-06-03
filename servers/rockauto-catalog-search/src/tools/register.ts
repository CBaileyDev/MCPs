import * as z from "zod/v4";
import { compareParts } from "../domain/compare.js";
import { explainFitment } from "../domain/fitment.js";
import type { NormalizedPart } from "../domain/types.js";
import type { RockAutoCatalogProvider } from "../catalog/provider.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
};

type ToolRegistrar = {
  registerTool(
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: z.ZodRawShape;
      annotations?: Record<string, unknown>;
    },
    handler: (input: Record<string, unknown>) => Promise<ToolResult>
  ): unknown;
};

const priceSchema = z.object({
  amount: z.number(),
  currency: z.literal("USD"),
  display: z.string()
});

const normalizedPartSchema = z.object({
  id: z.string(),
  brand: z.string(),
  partNumber: z.string(),
  title: z.string(),
  price: priceSchema.nullable(),
  availability: z.string().nullable(),
  fitmentNotes: z.array(z.string()),
  sourceUrl: z.string().url(),
  fetchedAt: z.string()
});

export function registerRockAutoTools(server: ToolRegistrar, provider: RockAutoCatalogProvider): void {
  server.registerTool(
    "search_vehicle",
    {
      title: "Search Vehicle",
      description: "Search RockAuto catalog vehicle candidates by year, make, and model.",
      inputSchema: {
        year: z.number().int().min(1900).max(2100),
        make: z.string().min(1),
        model: z.string().min(1)
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async input => result(await provider.searchVehicle(vehicleInput(input)))
  );

  server.registerTool(
    "list_vehicle_options",
    {
      title: "List Vehicle Options",
      description: "List engine/carcode options for a RockAuto vehicle candidate.",
      inputSchema: {
        year: z.number().int().min(1900).max(2100),
        make: z.string().min(1),
        model: z.string().min(1)
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async input => result(await provider.listVehicleOptions(vehicleInput(input)))
  );

  server.registerTool(
    "list_part_categories",
    {
      title: "List Part Categories",
      description: "List public RockAuto part categories for a selected vehicle.",
      inputSchema: {
        year: z.number().int().min(1900).max(2100),
        make: z.string().min(1),
        model: z.string().min(1),
        engine: z.string().optional(),
        carCode: z.string().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async input => result(await provider.listPartCategories({ ...vehicleInput(input), engine: optionalString(input.engine), carCode: optionalString(input.carCode) }))
  );

  server.registerTool(
    "search_parts",
    {
      title: "Search Parts",
      description: "Search public RockAuto catalog parts by vehicle and category or part type.",
      inputSchema: {
        year: z.number().int().min(1900).max(2100),
        make: z.string().min(1),
        model: z.string().min(1),
        engine: z.string().optional(),
        carCode: z.string().optional(),
        category: z.string().optional(),
        partType: z.string().optional(),
        sourceUrl: z.string().url().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async input =>
      result(
        await provider.searchParts({
          ...vehicleInput(input),
          engine: optionalString(input.engine),
          carCode: optionalString(input.carCode),
          category: optionalString(input.category),
          partType: optionalString(input.partType),
          sourceUrl: optionalString(input.sourceUrl)
        })
      )
  );

  server.registerTool(
    "search_part_number",
    {
      title: "Search Part Number",
      description: "Search RockAuto's public part-number search page.",
      inputSchema: {
        partNumber: z.string().min(1)
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async input => result(await provider.searchPartNumber({ partNumber: requiredString(input.partNumber, "partNumber") }))
  );

  server.registerTool(
    "get_part_details",
    {
      title: "Get Part Details",
      description: "Fetch and normalize one public RockAuto part/detail URL.",
      inputSchema: {
        sourceUrl: z.string().url()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async input => result(await provider.getPartDetails({ sourceUrl: requiredString(input.sourceUrl, "sourceUrl") }))
  );

  server.registerTool(
    "compare_parts",
    {
      title: "Compare Parts",
      description: "Compare normalized parts by numeric price and summarize missing price data.",
      inputSchema: {
        parts: z.array(normalizedPartSchema)
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async input => result(compareParts((input.parts as NormalizedPart[]) ?? []))
  );

  server.registerTool(
    "explain_fitment",
    {
      title: "Explain Fitment",
      description: "Explain whether enough vehicle detail exists to treat a part as fitment-compatible.",
      inputSchema: {
        year: z.number().int().min(1900).max(2100),
        make: z.string().min(1),
        model: z.string().min(1),
        engine: z.string().optional(),
        category: z.string().optional(),
        partFitmentNotes: z.array(z.string()).default([])
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async input =>
      result(
        explainFitment({
          ...vehicleInput(input),
          engine: optionalString(input.engine),
          category: optionalString(input.category),
          partFitmentNotes: Array.isArray(input.partFitmentNotes) ? (input.partFitmentNotes as string[]) : []
        })
      )
  );
}

function result(structuredContent: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent
  };
}

function vehicleInput(input: Record<string, unknown>): { year: number; make: string; model: string } {
  return {
    year: Number(input.year),
    make: requiredString(input.make, "make"),
    model: requiredString(input.model, "model")
  };
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }

  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
