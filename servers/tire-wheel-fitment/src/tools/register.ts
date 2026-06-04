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
import { convertWheelOffset, wheelFitmentChange } from "../domain/wheels.js";

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

  // ── 7. convert_wheel_offset ────────────────────────────────────────────────
  server.registerTool(
    "convert_wheel_offset",
    {
      title: "Convert Wheel Offset ↔ Backspacing",
      description:
        "Convert between wheel offset (mm) and backspacing (in) for a given wheel width. Provide either offsetMm or backspacingIn (not both). Positive offset = mounting face toward the street = more backspacing, less poke. lipAllowanceIn defaults to 0.5\" per side (overall width ≈ width + 1\"); set 0 for the bare width/2 + offset rule. Backspacing varies ~0.5\" by wheel — treat as guidance.",
      inputSchema: {
        widthIn: z.number().positive().describe("Wheel width in inches (bead-seat / advertised width, e.g. 9)"),
        offsetMm: z.number().optional().describe("Offset in mm (positive = toward street). Provide this OR backspacingIn."),
        backspacingIn: z.number().positive().optional().describe("Backspacing in inches. Provide this OR offsetMm."),
        lipAllowanceIn: z.number().min(0).optional().default(0.5).describe("Lip allowance per side, inches (default 0.5).")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ widthIn, offsetMm, backspacingIn, lipAllowanceIn = 0.5 }) => {
      const r = convertWheelOffset(widthIn, offsetMm, backspacingIn, lipAllowanceIn);
      if ("error" in r) return ok(r);
      return ok({
        widthIn: r.widthIn,
        lipAllowanceIn: r.lipAllowanceIn,
        centerlineIn: parseFloat(r.centerlineIn.toFixed(3)),
        offsetMm: parseFloat(r.offsetMm.toFixed(1)),
        backspacingIn: parseFloat(r.backspacingIn.toFixed(2)),
        note: r.note,
        inputs: r.inputs
      });
    }
  );

  // ── 8. wheel_fitment_change ────────────────────────────────────────────────
  server.registerTool(
    "wheel_fitment_change",
    {
      title: "Wheel Fitment Change (poke / inner clearance)",
      description:
        "Given an old and a new wheel (width + offset), compute how far the outer lip moves (poke, toward the fender) and how the inner-lip clearance changes (room from the strut/suspension), in mm. Exact and lip-independent. Lower offset and/or more width push the wheel outward.",
      inputSchema: {
        oldWidthIn: z.number().positive().describe("Current wheel width (in)"),
        oldOffsetMm: z.number().describe("Current wheel offset (mm)"),
        newWidthIn: z.number().positive().describe("New wheel width (in)"),
        newOffsetMm: z.number().describe("New wheel offset (mm)")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ oldWidthIn, oldOffsetMm, newWidthIn, newOffsetMm }) => {
      const r = wheelFitmentChange(oldWidthIn, oldOffsetMm, newWidthIn, newOffsetMm);
      return ok({
        pokeChangeMm: parseFloat(r.pokeChangeMm.toFixed(2)),
        innerClearanceChangeMm: parseFloat(r.innerClearanceChangeMm.toFixed(2)),
        summary: r.summary,
        note: r.note,
        inputs: r.inputs
      });
    }
  );
}
