import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ok } from "../result.js";
import {
  resolveTireDiameter,
  speedFromRpm,
  rpmFromSpeed,
  recommendFinalDrive,
  tireGearingEffect
} from "../domain/gearing.js";

// Shared tire input shape used by most tools
const tireInputShape = {
  tireSize: z.string().optional().describe("Metric tire size string e.g. \"275/40R20\""),
  tireDiameterIn: z.number().positive().optional().describe("Overall tire diameter in inches (explicit)")
};

export function registerDrivetrainGearingTools(server: McpServer): void {
  // ── 1. speed_from_rpm ───────────────────────────────────────────────────────
  server.registerTool(
    "speed_from_rpm",
    {
      title: "Speed from RPM",
      description:
        "Calculate vehicle speed in mph given engine RPM, transmission gear ratio, final drive ratio, and tire size. " +
        "Provide either tireSize (e.g. \"275/40R20\") or tireDiameterIn — not both.",
      inputSchema: {
        engineRpm: z.number().positive().describe("Engine RPM"),
        transGearRatio: z.number().positive().default(1.0).describe("Transmission gear ratio (default 1.0)"),
        finalDriveRatio: z.number().positive().describe("Axle/differential final drive ratio"),
        ...tireInputShape
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ engineRpm, transGearRatio, finalDriveRatio, tireSize, tireDiameterIn }) => {
      const diamIn = resolveTireDiameter({ tireSize, tireDiameterIn });
      const speedMph = speedFromRpm(engineRpm, transGearRatio, finalDriveRatio, diamIn);
      const wheelRpm = engineRpm / (transGearRatio * finalDriveRatio);
      return ok({
        speedMph: parseFloat(speedMph.toFixed(2)),
        wheelRpm: parseFloat(wheelRpm.toFixed(1)),
        inputs: {
          engineRpm,
          transGearRatio,
          finalDriveRatio,
          tireDiameterIn: parseFloat(diamIn.toFixed(3))
        },
        assumptions: "Results are theoretical; ignores drivetrain loss, tire growth at speed, and slip."
      });
    }
  );

  // ── 2. rpm_from_speed ───────────────────────────────────────────────────────
  server.registerTool(
    "rpm_from_speed",
    {
      title: "RPM from Speed",
      description:
        "Calculate engine RPM required to sustain a given speed in mph. Useful for determining cruising RPM in a specific gear. " +
        "Provide either tireSize (e.g. \"275/40R20\") or tireDiameterIn — not both.",
      inputSchema: {
        speedMph: z.number().positive().describe("Vehicle speed in mph"),
        transGearRatio: z.number().positive().default(1.0).describe("Transmission gear ratio (default 1.0)"),
        finalDriveRatio: z.number().positive().describe("Axle/differential final drive ratio"),
        ...tireInputShape
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ speedMph, transGearRatio, finalDriveRatio, tireSize, tireDiameterIn }) => {
      const diamIn = resolveTireDiameter({ tireSize, tireDiameterIn });
      const engineRpm = rpmFromSpeed(speedMph, transGearRatio, finalDriveRatio, diamIn);
      return ok({
        engineRpm: parseFloat(engineRpm.toFixed(0)),
        inputs: {
          speedMph,
          transGearRatio,
          finalDriveRatio,
          tireDiameterIn: parseFloat(diamIn.toFixed(3))
        },
        assumptions: "Results are theoretical; ignores drivetrain loss, tire growth at speed, and slip."
      });
    }
  );

  // ── 3. gear_speed_table ─────────────────────────────────────────────────────
  server.registerTool(
    "gear_speed_table",
    {
      title: "Gear Speed Table",
      description:
        "Calculate the vehicle speed at a given engine RPM for each gear in a transmission. Useful for mapping redline or cruise speeds across all gears. " +
        "Provide either tireSize (e.g. \"275/40R20\") or tireDiameterIn — not both.",
      inputSchema: {
        gearRatios: z.array(z.number().positive()).min(1).describe("Array of transmission gear ratios ordered from 1st to top gear"),
        finalDriveRatio: z.number().positive().describe("Axle/differential final drive ratio"),
        atRpm: z.number().positive().describe("Engine RPM to evaluate (e.g. redline or cruise RPM)"),
        ...tireInputShape
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ gearRatios, finalDriveRatio, atRpm, tireSize, tireDiameterIn }) => {
      const diamIn = resolveTireDiameter({ tireSize, tireDiameterIn });
      const gears = gearRatios.map((ratio, idx) => ({
        gear: idx + 1,
        gearRatio: ratio,
        speedMph: parseFloat(speedFromRpm(atRpm, ratio, finalDriveRatio, diamIn).toFixed(2))
      }));
      return ok({
        atRpm,
        finalDriveRatio,
        tireDiameterIn: parseFloat(diamIn.toFixed(3)),
        gears,
        assumptions: "Results are theoretical; ignores drivetrain loss, tire growth at speed, and slip."
      });
    }
  );

  // ── 4. tire_gearing_effect ──────────────────────────────────────────────────
  server.registerTool(
    "tire_gearing_effect",
    {
      title: "Tire Gearing Effect",
      description:
        "Calculate the gearing effect of swapping to a different tire diameter. " +
        "Returns the effective ratio your new tire behaves like with the stock final drive, " +
        "the equivalent final drive needed to restore original RPM/speed, " +
        "the percent change in effective gearing, and a speedometer note. " +
        "A larger tire is numerically taller (lower effective ratio). " +
        "Provide either originalTireSize or originalTireDiameterIn, and either newTireSize or newTireDiameterIn.",
      inputSchema: {
        originalTireSize: z.string().optional().describe("Original metric tire size string e.g. \"275/40R20\""),
        originalTireDiameterIn: z.number().positive().optional().describe("Original overall tire diameter in inches"),
        newTireSize: z.string().optional().describe("New metric tire size string e.g. \"295/45R20\""),
        newTireDiameterIn: z.number().positive().optional().describe("New overall tire diameter in inches"),
        finalDriveRatio: z.number().positive().describe("Stock axle/differential final drive ratio")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ originalTireSize, originalTireDiameterIn, newTireSize, newTireDiameterIn, finalDriveRatio }) => {
      const originalDiamIn = resolveTireDiameter({
        tireSize: originalTireSize,
        tireDiameterIn: originalTireDiameterIn
      });
      const newDiamIn = resolveTireDiameter({
        tireSize: newTireSize,
        tireDiameterIn: newTireDiameterIn
      });
      const effect = tireGearingEffect(originalDiamIn, newDiamIn, finalDriveRatio);
      return ok({
        originalDiameterIn: parseFloat(effect.originalDiameterIn.toFixed(3)),
        newDiameterIn: parseFloat(effect.newDiameterIn.toFixed(3)),
        stockFinalDrive: effect.stockFinalDrive,
        effectiveRatio: parseFloat(effect.effectiveRatio.toFixed(4)),
        restoringFinalDrive: parseFloat(effect.restoringFinalDrive.toFixed(4)),
        percentChange: parseFloat(effect.percentChange.toFixed(2)),
        speedometerNote: effect.speedometerNote
      });
    }
  );

  // ── 5. recommend_final_drive ────────────────────────────────────────────────
  server.registerTool(
    "recommend_final_drive",
    {
      title: "Recommend Final Drive",
      description:
        "Recommend a final drive ratio to hit a target engine RPM at a target vehicle speed in the top/overdrive gear. " +
        "Provide either tireSize (e.g. \"275/40R20\") or tireDiameterIn — not both.",
      inputSchema: {
        targetRpm: z.number().positive().describe("Target engine RPM at the given speed"),
        targetSpeedMph: z.number().positive().describe("Target vehicle speed in mph"),
        topGearRatio: z.number().positive().default(1.0).describe("Top gear transmission ratio (default 1.0, use <1 for overdrive)"),
        ...tireInputShape
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ targetRpm, targetSpeedMph, topGearRatio, tireSize, tireDiameterIn }) => {
      const diamIn = resolveTireDiameter({ tireSize, tireDiameterIn });
      const finalDrive = recommendFinalDrive(targetRpm, targetSpeedMph, topGearRatio, diamIn);
      return ok({
        recommendedFinalDrive: parseFloat(finalDrive.toFixed(4)),
        inputs: {
          targetRpm,
          targetSpeedMph,
          topGearRatio,
          tireDiameterIn: parseFloat(diamIn.toFixed(3))
        },
        assumptions: "Results are theoretical; ignores drivetrain loss, tire growth at speed, and slip."
      });
    }
  );
}
