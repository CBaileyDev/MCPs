import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ok } from "../result.js";
import {
  parseTireSize,
  deriveDimensions,
  speedometerError,
  decodeServiceDescription,
  suggestReplacementSizes,
  type MetricTireComponents,
  type FlotationTireComponents
} from "../domain/tires.js";

export function registerTireWheelFitmentTools(server: McpServer): void {
  // ── 1. parse_tire_size ──────────────────────────────────────────────────────
  server.registerTool(
    "parse_tire_size",
    {
      title: "Parse Tire Size",
      description:
        "Parse a tire size string (metric like 225/45R17 or P225/45R17 94W, or flotation like 31x10.50R15) into its components and derived dimensions. Returns section width, aspect ratio, wheel diameter, sidewall height, overall diameter, circumference, revs/mile, and decoded load/speed service description if present.",
      inputSchema: {
        size: z.string().min(1)
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ size }) => {
      const parsed = parseTireSize(size);
      const dims = deriveDimensions(parsed);

      let serviceDescription: ReturnType<typeof decodeServiceDescription> | undefined;
      if (parsed.format === "metric" && (parsed.loadIndex !== undefined || parsed.speedSymbol !== undefined)) {
        serviceDescription = decodeServiceDescription({
          loadIndex: parsed.loadIndex,
          speedSymbol: parsed.speedSymbol
        });
      }

      return ok({ parsed, dimensions: dims, serviceDescription: serviceDescription ?? null });
    }
  );

  // ── 2. calculate_tire_dimensions ────────────────────────────────────────────
  server.registerTool(
    "calculate_tire_dimensions",
    {
      title: "Calculate Tire Dimensions",
      description:
        "Calculate derived tire dimensions from explicit components. Provide EITHER metric components (sectionWidthMm, aspectRatio, wheelDiameterIn) OR flotation components (overallDiameterIn, sectionWidthIn, wheelDiameterIn). Returns sidewall height, overall diameter, circumference, and revs/mile.",
      inputSchema: {
        // Metric fields
        sectionWidthMm: z.number().int().positive().optional(),
        aspectRatio: z.number().int().min(1).max(99).optional(),
        // Flotation fields
        overallDiameterIn: z.number().positive().optional(),
        sectionWidthIn: z.number().positive().optional(),
        // Shared
        wheelDiameterIn: z.number().positive()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ sectionWidthMm, aspectRatio, overallDiameterIn, sectionWidthIn, wheelDiameterIn }) => {
      // Flotation branch
      if (overallDiameterIn !== undefined && sectionWidthIn !== undefined) {
        const components: FlotationTireComponents = { overallDiameterIn, sectionWidthIn, wheelDiameterIn };
        const dims = deriveDimensions(components);
        return ok(dims);
      }

      // Metric branch
      if (sectionWidthMm !== undefined && aspectRatio !== undefined) {
        const components: MetricTireComponents = { sectionWidthMm, aspectRatio, wheelDiameterIn };
        const dims = deriveDimensions(components);
        return ok(dims);
      }

      throw new Error(
        "Provide either (sectionWidthMm + aspectRatio + wheelDiameterIn) for metric, or (overallDiameterIn + sectionWidthIn + wheelDiameterIn) for flotation."
      );
    }
  );

  // ── 3. compare_tire_sizes ───────────────────────────────────────────────────
  server.registerTool(
    "compare_tire_sizes",
    {
      title: "Compare Tire Sizes",
      description:
        "Compare two tire sizes side by side. Returns dimensions for each, absolute and percent deltas for diameter, circumference, sidewall height, and revs/mile, plus speedometer error if sizeB replaces sizeA. Optionally provide referenceSpeed and speedUnit to include actual-vs-indicated speed.",
      inputSchema: {
        sizeA: z.string().min(1),
        sizeB: z.string().min(1),
        referenceSpeed: z.number().positive().optional(),
        speedUnit: z.enum(["mph", "km/h"]).optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ sizeA, sizeB, referenceSpeed, speedUnit = "mph" }) => {
      const parsedA = parseTireSize(sizeA);
      const parsedB = parseTireSize(sizeB);
      const dimsA = deriveDimensions(parsedA);
      const dimsB = deriveDimensions(parsedB);

      const diameterDeltaIn = dimsB.overallDiameterIn - dimsA.overallDiameterIn;
      const diameterDeltaPercent = (diameterDeltaIn / dimsA.overallDiameterIn) * 100;
      const circumferenceDeltaIn = dimsB.circumferenceIn - dimsA.circumferenceIn;
      const circumferenceDeltaPercent = (circumferenceDeltaIn / dimsA.circumferenceIn) * 100;
      const revsDelta = dimsB.revsPerMile - dimsA.revsPerMile;
      const revsDeltaPercent = (revsDelta / dimsA.revsPerMile) * 100;

      // Sidewall delta — both dimensions have sidewallHeightIn
      const sidewallA = "sidewallHeightIn" in dimsA ? dimsA.sidewallHeightIn : undefined;
      const sidewallB = "sidewallHeightIn" in dimsB ? dimsB.sidewallHeightIn : undefined;
      let sidewallDelta: { deltaIn: number; deltaPercent: number } | undefined;
      if (sidewallA !== undefined && sidewallB !== undefined) {
        sidewallDelta = {
          deltaIn: sidewallB - sidewallA,
          deltaPercent: ((sidewallB - sidewallA) / sidewallA) * 100
        };
      }

      const speedoError = speedometerError(
        dimsA.overallDiameterIn,
        dimsB.overallDiameterIn,
        referenceSpeed ?? 60,
        speedUnit as "mph" | "km/h"
      );

      return ok({
        sizeA: { parsed: parsedA, dimensions: dimsA },
        sizeB: { parsed: parsedB, dimensions: dimsB },
        deltas: {
          diameter: { deltaIn: diameterDeltaIn, deltaPercent: diameterDeltaPercent },
          circumference: { deltaIn: circumferenceDeltaIn, deltaPercent: circumferenceDeltaPercent },
          revsPerMile: { delta: revsDelta, deltaPercent: revsDeltaPercent },
          ...(sidewallDelta ? { sidewallHeight: sidewallDelta } : {})
        },
        speedometerError: {
          ...speedoError,
          note: "Speedo error if sizeB replaces sizeA: positive = speedo under-reads (actual > indicated)."
        }
      });
    }
  );

  // ── 4. speedometer_error ────────────────────────────────────────────────────
  server.registerTool(
    "speedometer_error",
    {
      title: "Speedometer Error",
      description:
        "Calculate speedometer error when replacing one tire size with another. Returns actual speed vs indicated, and error percent. Positive errorPercent means the speedo under-reads (larger new tire → actual speed exceeds indicated).",
      inputSchema: {
        originalSize: z.string().min(1),
        newSize: z.string().min(1),
        indicatedSpeed: z.number().positive(),
        speedUnit: z.enum(["mph", "km/h"])
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ originalSize, newSize, indicatedSpeed, speedUnit }) => {
      const origDims = deriveDimensions(parseTireSize(originalSize));
      const newDims = deriveDimensions(parseTireSize(newSize));
      const result = speedometerError(
        origDims.overallDiameterIn,
        newDims.overallDiameterIn,
        indicatedSpeed,
        speedUnit as "mph" | "km/h"
      );
      return ok({
        ...result,
        originalSize,
        newSize,
        originalDiameterIn: origDims.overallDiameterIn,
        newDiameterIn: newDims.overallDiameterIn
      });
    }
  );

  // ── 5. decode_service_description ──────────────────────────────────────────
  server.registerTool(
    "decode_service_description",
    {
      title: "Decode Service Description",
      description:
        "Decode a tire service description. Provide loadIndex (integer), speedSymbol (letter), or serviceDescription string like '94W'. Returns load capacity in kg and lb, max speed in km/h and mph. Unknown indices or symbols are returned as null with known=false.",
      inputSchema: {
        loadIndex: z.number().int().positive().optional(),
        speedSymbol: z.string().optional(),
        serviceDescription: z.string().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ loadIndex, speedSymbol, serviceDescription }) => {
      const result = decodeServiceDescription({ loadIndex, speedSymbol, serviceDescription });
      return ok(result);
    }
  );

  // ── 6. suggest_replacement_sizes ───────────────────────────────────────────
  server.registerTool(
    "suggest_replacement_sizes",
    {
      title: "Suggest Replacement Sizes",
      description:
        "Given an original tire size, generate ranked alternative metric sizes within a diameter tolerance (default ±3%). Each candidate includes overall diameter, diameter delta %, and speedometer error %. Optionally specify targetWheelDiameterIn for plus-sizing. Results are sorted by absolute diameter delta and capped at 20.",
      inputSchema: {
        originalSize: z.string().min(1),
        tolerancePercent: z.number().positive().max(20).optional(),
        targetWheelDiameterIn: z.number().positive().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ originalSize, tolerancePercent = 3, targetWheelDiameterIn }) => {
      const original = parseTireSize(originalSize);
      const origDims = deriveDimensions(original);
      const candidates = suggestReplacementSizes(originalSize, tolerancePercent, targetWheelDiameterIn);
      return ok({
        originalSize,
        originalDiameterIn: origDims.overallDiameterIn,
        tolerancePercent,
        candidates
      });
    }
  );
}
