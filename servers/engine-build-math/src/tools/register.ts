import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ok } from "../result.js";
import {
  calcDisplacement,
  calcCompressionRatio,
  calcBoreStrokeRatio,
  calcMeanPistonSpeed,
  calcEngineAirflowCfm
} from "../domain/engine.js";
import {
  injectorFlowConvert,
  injectorSizeRequired,
  injectorMaxHp
} from "../domain/injectors.js";

export function registerEngineBuildMathTools(server: McpServer): void {
  // ── 1. displacement ─────────────────────────────────────────────────────────
  server.registerTool(
    "displacement",
    {
      title: "Engine Displacement Calculator",
      description:
        "Calculate total engine displacement from bore, stroke, and cylinder count. " +
        "Returns cubic inches (ci), cubic centimeters (cc), and liters. " +
        "Input bore and stroke in the same unit ('in' for inches, 'mm' for millimetres). " +
        "Results are theoretical swept volume — does not account for valve timing or dynamic effects.",
      inputSchema: {
        bore: z.number().positive().describe("Bore diameter (must be > 0)"),
        stroke: z.number().positive().describe("Stroke length (must be > 0)"),
        cylinders: z
          .number()
          .int()
          .positive()
          .describe("Number of cylinders (positive integer)"),
        unit: z
          .enum(["in", "mm"])
          .default("in")
          .describe('Length unit for bore and stroke: "in" (inches) or "mm" (millimetres)')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ bore, stroke, cylinders, unit }) => {
      const r = calcDisplacement(bore, stroke, cylinders, unit);
      return ok({
        ci: parseFloat(r.ci.toFixed(2)),
        cc: parseFloat(r.cc.toFixed(1)),
        liters: parseFloat(r.liters.toFixed(3)),
        sweptPerCylinder_cc: parseFloat(r.sweptPerCylinder_cc.toFixed(2)),
        inputs: r.inputs
      });
    }
  );

  // ── 2. compression_ratio ────────────────────────────────────────────────────
  server.registerTool(
    "compression_ratio",
    {
      title: "Compression Ratio Calculator",
      description:
        "Calculate compression ratio from bore, stroke, and clearance volumes. " +
        "Bore and stroke are in inches or mm; all volume inputs (chamberCc, gasketCc, deckCc, pistonCc) " +
        "are in cubic centimetres (cc). " +
        "pistonCc is SIGNED: positive = dish piston (adds clearance volume); negative = dome piston (subtracts). " +
        "This tool handles the common unit-mix trap — bore/stroke in length units, volumes in cc. " +
        "Returns sweptCc, clearanceCc, ratio, and ratioLabel (e.g. '10.55:1'). " +
        "Returns an error if clearance volume is zero or negative.",
      inputSchema: {
        bore: z.number().positive().describe("Bore diameter (must be > 0)"),
        stroke: z.number().positive().describe("Stroke length (must be > 0)"),
        unit: z
          .enum(["in", "mm"])
          .default("in")
          .describe('Length unit for bore and stroke: "in" or "mm"'),
        chamberCc: z
          .number()
          .positive()
          .describe("Combustion chamber volume in cc (must be > 0)"),
        gasketCc: z
          .number()
          .nonnegative()
          .describe("Head gasket compressed volume in cc (>= 0)"),
        deckCc: z
          .number()
          .nonnegative()
          .describe("Deck clearance volume in cc (>= 0)"),
        pistonCc: z
          .number()
          .describe(
            "Piston volume in cc: positive = dish (adds clearance), negative = dome (subtracts clearance)"
          )
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ bore, stroke, unit, chamberCc, gasketCc, deckCc, pistonCc }) => {
      const r = calcCompressionRatio(bore, stroke, unit, chamberCc, gasketCc, deckCc, pistonCc);

      if ("error" in r) {
        return ok({ error: r.error, inputs: r.inputs });
      }

      return ok({
        sweptCc: parseFloat(r.sweptCc.toFixed(2)),
        clearanceCc: parseFloat(r.clearanceCc.toFixed(2)),
        ratio: parseFloat(r.ratio.toFixed(2)),
        ratioLabel: r.ratioLabel,
        inputs: r.inputs
      });
    }
  );

  // ── 3. bore_stroke_ratio ────────────────────────────────────────────────────
  server.registerTool(
    "bore_stroke_ratio",
    {
      title: "Bore/Stroke Ratio Classifier",
      description:
        "Calculate bore-to-stroke ratio and classify engine character. " +
        "Both bore and stroke must be in the same unit (ratio is unitless). " +
        "Returns the ratio, a classification (oversquare / undersquare / square), " +
        "and a one-line meaning. " +
        "Thresholds: ratio > 1.05 = oversquare; ratio < 0.95 = undersquare; otherwise square.",
      inputSchema: {
        bore: z.number().positive().describe("Bore diameter (must be > 0, same unit as stroke)"),
        stroke: z.number().positive().describe("Stroke length (must be > 0, same unit as bore)")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ bore, stroke }) => {
      const r = calcBoreStrokeRatio(bore, stroke);
      return ok({
        ratio: parseFloat(r.ratio.toFixed(4)),
        classification: r.classification,
        meaning: r.meaning,
        inputs: r.inputs
      });
    }
  );

  // ── 4. mean_piston_speed ────────────────────────────────────────────────────
  server.registerTool(
    "mean_piston_speed",
    {
      title: "Mean Piston Speed Calculator",
      description:
        "Calculate mean piston speed from stroke and RPM. " +
        "Returns both feet per minute (ftPerMin) and metres per second (mPerSec). " +
        "Mean piston speed = 2 × stroke × rpm (in consistent length/time units). " +
        "Includes a note about high-stress piston speed thresholds.",
      inputSchema: {
        stroke: z.number().positive().describe("Stroke length (must be > 0)"),
        unit: z
          .enum(["in", "mm"])
          .default("in")
          .describe('Length unit for stroke: "in" (inches) or "mm" (millimetres)'),
        rpm: z.number().positive().describe("Engine speed in RPM (must be > 0)")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ stroke, unit, rpm }) => {
      const r = calcMeanPistonSpeed(stroke, unit, rpm);
      return ok({
        ftPerMin: parseFloat(r.ftPerMin.toFixed(1)),
        mPerSec: parseFloat(r.mPerSec.toFixed(2)),
        note: r.note,
        inputs: r.inputs
      });
    }
  );

  // ── 5. engine_airflow_cfm ───────────────────────────────────────────────────
  server.registerTool(
    "engine_airflow_cfm",
    {
      title: "Engine Airflow CFM Calculator",
      description:
        "Calculate engine airflow demand in cubic feet per minute (CFM). " +
        "cfm = displacementCi × rpm × volumetricEfficiency / 3456. " +
        "3456 = 2 × 1728: a 4-stroke fills every other rev; 1728 in³ per ft³. " +
        "Volumetric efficiency > 1 is valid for forced induction (supercharger/turbocharger). " +
        "Useful for carburettor sizing and intake/exhaust design.",
      inputSchema: {
        displacementCi: z
          .number()
          .positive()
          .describe("Engine displacement in cubic inches (must be > 0)"),
        rpm: z.number().positive().describe("Engine speed in RPM (must be > 0)"),
        volumetricEfficiency: z
          .number()
          .positive()
          .default(0.85)
          .describe(
            "Volumetric efficiency as a decimal (default 0.85 for a naturally aspirated engine; > 1 for forced induction)"
          )
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ displacementCi, rpm, volumetricEfficiency }) => {
      const r = calcEngineAirflowCfm(displacementCi, rpm, volumetricEfficiency);
      return ok({
        cfm: parseFloat(r.cfm.toFixed(1)),
        note: r.note,
        inputs: r.inputs
      });
    }
  );

  // ── 6. injector_flow_convert ────────────────────────────────────────────────
  server.registerTool(
    "injector_flow_convert",
    {
      title: "Injector Flow Unit Converter",
      description:
        "Convert injector flow rate between cc/min and lb/hr. " +
        "Returns BOTH ccPerMin and lbPerHr regardless of input unit. " +
        "Conversion depends on fuel density; gasoline ≈ 0.72 g/cc, E85 ≈ 0.78 g/cc. " +
        "Formula: lbPerHr = ccPerMin × (60 × density / 453.592); " +
        "ccPerMin = lbPerHr × (453.592 / (60 × density)). " +
        "With gasoline (0.72 g/cc) the factor reduces to the well-known ÷10.5 rule.",
      inputSchema: {
        value: z.number().positive().describe("Flow rate value to convert (must be > 0)"),
        from: z
          .enum(["cc_min", "lb_hr"])
          .describe('Source unit: "cc_min" (cc per minute) or "lb_hr" (pounds per hour)'),
        fuelDensityGPerCc: z
          .number()
          .positive()
          .default(0.72)
          .describe(
            "Fuel density in g/cc (default 0.72 for gasoline; E85 ≈ 0.78; methanol ≈ 0.79)"
          )
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ value, from, fuelDensityGPerCc }) => {
      const r = injectorFlowConvert(value, from, fuelDensityGPerCc);
      return ok({
        ccPerMin: parseFloat(r.ccPerMin.toFixed(2)),
        lbPerHr: parseFloat(r.lbPerHr.toFixed(2)),
        fuelDensityGPerCc: r.fuelDensityGPerCc,
        note: r.note,
        inputs: r.inputs
      });
    }
  );

  // ── 7. injector_size_required ───────────────────────────────────────────────
  server.registerTool(
    "injector_size_required",
    {
      title: "Required Injector Size Calculator",
      description:
        "Calculate the minimum injector flow rating needed to support a target horsepower. " +
        "Returns required flow per injector in both lb/hr and cc/min. " +
        "Formula: totalFuelLbHr = targetHp × bsfc; " +
        "perInjectorLbHr = totalFuelLbHr / (cylinders × maxDutyCycle). " +
        "BSFC ≈ 0.45–0.5 for naturally-aspirated gasoline; ≈ 0.55–0.65 for forced induction. " +
        "80–85% max duty cycle is the usual safe ceiling; size up for headroom. " +
        "Results are rule-of-thumb estimates, not guarantees.",
      inputSchema: {
        targetHp: z.number().positive().describe("Target horsepower (must be > 0)"),
        cylinders: z
          .number()
          .int()
          .positive()
          .describe("Number of cylinders (positive integer)"),
        bsfc: z
          .number()
          .positive()
          .default(0.5)
          .describe(
            "Brake specific fuel consumption in lb/hr per HP (default 0.5; NA gas ≈ 0.45–0.5; forced ≈ 0.55–0.65)"
          ),
        maxDutyCycle: z
          .number()
          .positive()
          .max(1)
          .default(0.85)
          .describe(
            "Maximum injector duty cycle as a decimal 0–1 (default 0.85; safe ceiling is typically 0.80–0.85)"
          ),
        fuelDensityGPerCc: z
          .number()
          .positive()
          .default(0.72)
          .describe(
            "Fuel density in g/cc (default 0.72 for gasoline; E85 ≈ 0.78; methanol ≈ 0.79)"
          )
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ targetHp, cylinders, bsfc, maxDutyCycle, fuelDensityGPerCc }) => {
      const r = injectorSizeRequired(targetHp, cylinders, bsfc, maxDutyCycle, fuelDensityGPerCc);
      return ok({
        perInjectorLbHr: parseFloat(r.perInjectorLbHr.toFixed(2)),
        perInjectorCcMin: parseFloat(r.perInjectorCcMin.toFixed(1)),
        totalFuelLbHr: parseFloat(r.totalFuelLbHr.toFixed(2)),
        assumptions: r.assumptions,
        note: r.note
      });
    }
  );

  // ── 8. injector_max_hp ──────────────────────────────────────────────────────
  server.registerTool(
    "injector_max_hp",
    {
      title: "Injector Maximum HP Calculator",
      description:
        "Calculate the maximum horsepower an injector set can support at a given duty cycle. " +
        "Formula: maxHp = injectorLbHr × cylinders × maxDutyCycle / bsfc. " +
        "Supply injector flow in cc/min or lb/hr; the tool converts internally. " +
        "BSFC ≈ 0.45–0.5 for naturally-aspirated gasoline; ≈ 0.55–0.65 for forced induction. " +
        "80–85% max duty cycle is the usual safe ceiling. " +
        "Results are rule-of-thumb estimates, not guarantees.",
      inputSchema: {
        injectorFlow: z
          .number()
          .positive()
          .describe("Injector flow rating (must be > 0)"),
        flowUnit: z
          .enum(["cc_min", "lb_hr"])
          .describe('Flow unit: "cc_min" (cc per minute) or "lb_hr" (pounds per hour)'),
        cylinders: z
          .number()
          .int()
          .positive()
          .describe("Number of cylinders (positive integer)"),
        bsfc: z
          .number()
          .positive()
          .default(0.5)
          .describe(
            "Brake specific fuel consumption in lb/hr per HP (default 0.5; NA gas ≈ 0.45–0.5; forced ≈ 0.55–0.65)"
          ),
        maxDutyCycle: z
          .number()
          .positive()
          .max(1)
          .default(0.85)
          .describe(
            "Maximum injector duty cycle as a decimal 0–1 (default 0.85; safe ceiling is typically 0.80–0.85)"
          ),
        fuelDensityGPerCc: z
          .number()
          .positive()
          .default(0.72)
          .describe(
            "Fuel density in g/cc (default 0.72 for gasoline; E85 ≈ 0.78; methanol ≈ 0.79)"
          )
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ injectorFlow, flowUnit, cylinders, bsfc, maxDutyCycle, fuelDensityGPerCc }) => {
      const r = injectorMaxHp(injectorFlow, flowUnit, cylinders, bsfc, maxDutyCycle, fuelDensityGPerCc);
      return ok({
        maxHp: parseFloat(r.maxHp.toFixed(1)),
        injectorLbHr: parseFloat(r.injectorLbHr.toFixed(2)),
        injectorCcMin: parseFloat(r.injectorCcMin.toFixed(2)),
        assumptions: r.assumptions,
        note: r.note
      });
    }
  );
}
