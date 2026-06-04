import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ok } from "../result.js";
import {
  calcTongueWeight,
  calcPayloadCheck,
  calcTowingHeadroom,
  calcTowSetupCheck
} from "../domain/towing.js";

export function registerTowingPayloadMathTools(server: McpServer): void {
  // ── 1. tongue_weight ─────────────────────────────────────────────────────────
  server.registerTool(
    "tongue_weight",
    {
      title: "Tongue Weight Calculator & Classifier",
      description:
        "Calculate tongue weight (or tongue-weight percentage) and classify against the conventional " +
        "bumper-pull guideline of 10–15% of trailer weight. " +
        "Provide EXACTLY ONE of tongueWeightLb or tonguePercent — the other is derived. " +
        "IMPORTANT: This server does arithmetic only. Vehicle hitch ratings and trailer tongue-weight " +
        "limits come from the manufacturer's towing guide and hitch documentation, not from this server. " +
        "Returns tongueWeightLb, tonguePercent, classification, and guidelineNote.",
      inputSchema: {
        trailerWeightLb: z
          .number()
          .positive()
          .describe("Total loaded trailer weight (must be > 0)"),
        tongueWeightLb: z
          .number()
          .positive()
          .optional()
          .describe(
            "Tongue weight in the chosen unit (must be > 0). Provide this OR tonguePercent, not both."
          ),
        tonguePercent: z
          .number()
          .gt(0)
          .lt(100)
          .optional()
          .describe(
            "Tongue weight as a percentage of trailer weight (must be > 0 and < 100). Provide this OR tongueWeightLb, not both."
          ),
        unit: z
          .string()
          .default("lb")
          .describe(
            "Weight unit label (default 'lb'). Echoed in output. Does NOT trigger conversion — all inputs must already be in consistent units."
          )
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ trailerWeightLb, tongueWeightLb, tonguePercent, unit }) => {
      const r = calcTongueWeight(trailerWeightLb, tongueWeightLb, tonguePercent, unit);

      if ("error" in r) {
        return ok({ error: r.error, inputs: r.inputs });
      }

      return ok({
        tongueWeightLb: parseFloat(r.tongueWeightLb.toFixed(1)),
        tonguePercent: parseFloat(r.tonguePercent.toFixed(2)),
        classification: r.classification,
        guidelineNote: r.guidelineNote,
        unit: r.unit,
        inputs: r.inputs
      });
    }
  );

  // ── 2. payload_check ─────────────────────────────────────────────────────────
  server.registerTool(
    "payload_check",
    {
      title: "Payload Check (Tongue Weight Counts Against Payload)",
      description:
        "Check whether passengers, cargo, and tongue weight fit within the tow vehicle's payload capacity. " +
        "KEY INSIGHT: Tongue weight presses down on the hitch and counts against the vehicle's payload — " +
        "this is the most commonly overlooked towing constraint. " +
        "Payload capacity = GVWR − curb weight (from the door-jamb label). " +
        "IMPORTANT: This server does arithmetic only. GVWR and curb weight come from your vehicle's " +
        "door-jamb label or manufacturer data, not from this server.",
      inputSchema: {
        payloadCapacityLb: z
          .number()
          .positive()
          .describe("Payload capacity in the chosen unit (GVWR − curb weight, from door-jamb label; must be > 0)"),
        passengersAndCargoLb: z
          .number()
          .nonnegative()
          .describe("Combined weight of passengers and in-vehicle cargo (>= 0)"),
        tongueWeightLb: z
          .number()
          .nonnegative()
          .default(0)
          .describe("Tongue weight pressing on the hitch (>= 0, default 0)"),
        otherHitchLoadLb: z
          .number()
          .nonnegative()
          .default(0)
          .describe("Any other hitch-mounted load (weight-distribution head, receiver cargo carrier, etc.) (>= 0, default 0)"),
        unit: z
          .string()
          .default("lb")
          .describe(
            "Weight unit label (default 'lb'). Echoed in output. Does NOT trigger conversion — all inputs must already be in consistent units."
          )
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ payloadCapacityLb, passengersAndCargoLb, tongueWeightLb, otherHitchLoadLb, unit }) => {
      const r = calcPayloadCheck(payloadCapacityLb, passengersAndCargoLb, tongueWeightLb, otherHitchLoadLb, unit);
      return ok({
        usedPayloadLb: parseFloat(r.usedPayloadLb.toFixed(1)),
        remainingPayloadLb: parseFloat(r.remainingPayloadLb.toFixed(1)),
        over: r.over,
        breakdown: r.breakdown,
        note: r.note,
        unit: r.unit,
        inputs: r.inputs
      });
    }
  );

  // ── 3. towing_headroom ───────────────────────────────────────────────────────
  server.registerTool(
    "towing_headroom",
    {
      title: "GCWR Towing Headroom Calculator",
      description:
        "Calculate remaining GCWR (Gross Combined Weight Rating) headroom and maximum trailer weight " +
        "at the vehicle's current loaded weight. " +
        "GCWR limits truck + trailer weight TOGETHER — many callers confuse it with GVWR (truck alone). " +
        "Max trailer = GCWR − ACTUAL loaded truck weight (not curb weight). " +
        "IMPORTANT: This server does arithmetic only. GCWR comes from your vehicle's towing guide, " +
        "not from this server. Use actual scale weight of the loaded truck, not curb weight.",
      inputSchema: {
        gcwrLb: z
          .number()
          .positive()
          .describe("Gross Combined Weight Rating from the towing guide (must be > 0)"),
        loadedTruckWeightLb: z
          .number()
          .positive()
          .describe("Actual loaded truck weight — scale weight of the truck with people and cargo (must be > 0; do NOT use curb weight)"),
        trailerWeightLb: z
          .number()
          .nonnegative()
          .default(0)
          .describe("Loaded trailer weight (>= 0, default 0)"),
        unit: z
          .string()
          .default("lb")
          .describe(
            "Weight unit label (default 'lb'). Echoed in output. Does NOT trigger conversion — all inputs must already be in consistent units."
          )
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ gcwrLb, loadedTruckWeightLb, trailerWeightLb, unit }) => {
      const r = calcTowingHeadroom(gcwrLb, loadedTruckWeightLb, trailerWeightLb, unit);
      return ok({
        combinedWeightLb: parseFloat(r.combinedWeightLb.toFixed(1)),
        remainingWithinGcwrLb: parseFloat(r.remainingWithinGcwrLb.toFixed(1)),
        maxTrailerAtThisLoadLb: parseFloat(r.maxTrailerAtThisLoadLb.toFixed(1)),
        over: r.over,
        note: r.note,
        unit: r.unit,
        inputs: r.inputs
      });
    }
  );

  // ── 4. tow_setup_check ───────────────────────────────────────────────────────
  server.registerTool(
    "tow_setup_check",
    {
      title: "Consolidated Tow Setup Check",
      description:
        "Run all three checks in one call — payload/GVWR, GCWR, and tongue weight — and identify " +
        "the binding constraint. Ideal for a complete towing safety audit before a trip. " +
        "Reports overall pass/fail, each individual check result, and which check is the binding constraint " +
        "(the tightest or failing limit). " +
        "IMPORTANT: This server does arithmetic only. GVWR, GCWR, and curb weight come from your vehicle's " +
        "door-jamb label and manufacturer towing guide — not from this server. Supply these from your actual " +
        "vehicle documentation.",
      inputSchema: {
        gvwrLb: z
          .number()
          .positive()
          .describe("Gross Vehicle Weight Rating from the door-jamb label (must be > 0)"),
        curbWeightLb: z
          .number()
          .positive()
          .describe("Curb weight of the tow vehicle (must be > 0)"),
        gcwrLb: z
          .number()
          .positive()
          .describe("Gross Combined Weight Rating from the towing guide (must be > 0)"),
        passengersAndCargoLb: z
          .number()
          .nonnegative()
          .describe("Combined weight of passengers and in-vehicle cargo (>= 0)"),
        trailerWeightLb: z
          .number()
          .positive()
          .describe("Total loaded trailer weight (must be > 0)"),
        tongueWeightLb: z
          .number()
          .positive()
          .describe("Tongue weight pressing on the hitch (must be > 0)"),
        unit: z
          .string()
          .default("lb")
          .describe(
            "Weight unit label (default 'lb'). Echoed in output. Does NOT trigger conversion — all inputs must already be in consistent units."
          )
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ gvwrLb, curbWeightLb, gcwrLb, passengersAndCargoLb, trailerWeightLb, tongueWeightLb, unit }) => {
      const r = calcTowSetupCheck(
        gvwrLb,
        curbWeightLb,
        gcwrLb,
        passengersAndCargoLb,
        trailerWeightLb,
        tongueWeightLb,
        unit
      );
      return ok({
        payloadCapacityLb: parseFloat(r.payloadCapacityLb.toFixed(1)),
        usedPayloadLb: parseFloat(r.usedPayloadLb.toFixed(1)),
        loadedTruckWeightLb: parseFloat(r.loadedTruckWeightLb.toFixed(1)),
        remainingPayloadLb: parseFloat(r.remainingPayloadLb.toFixed(1)),
        combinedWeightLb: parseFloat(r.combinedWeightLb.toFixed(1)),
        remainingWithinGcwrLb: parseFloat(r.remainingWithinGcwrLb.toFixed(1)),
        tonguePercent: parseFloat(r.tonguePercent.toFixed(2)),
        payloadOk: r.payloadOk,
        gcwrOk: r.gcwrOk,
        tongueOk: r.tongueOk,
        overall: r.overall,
        bindingConstraint: r.bindingConstraint,
        note: r.note,
        unit: r.unit,
        inputs: r.inputs
      });
    }
  );
}
