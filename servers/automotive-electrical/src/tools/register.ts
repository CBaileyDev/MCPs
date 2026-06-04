import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ok } from "../result.js";
import {
  calcVoltageDrop,
  recommendWireGauge,
  calcOhmsLaw,
  calcFuseSize,
  calcBatteryRuntime,
  calcBatteryBank,
  AWG_TABLE
} from "../domain/electrical.js";

// ─── shared helpers ──────────────────────────────────────────────────────────

const AWG_LABELS = AWG_TABLE.map(e => e.label) as [string, ...string[]];

// ─── 1. voltage_drop ─────────────────────────────────────────────────────────

export function registerAutomotiveElectricalTools(server: McpServer): void {
  server.registerTool(
    "voltage_drop",
    {
      title: "Voltage Drop Calculator",
      description:
        "Calculate the voltage drop in a 2-wire DC run (current flows out AND back). " +
        "Returns the absolute voltage drop (V), drop as a percentage of system voltage, " +
        "and the voltage at the end of the run. " +
        "3% is a common limit for critical/sensitive circuits; 10% for non-critical loads. " +
        "Material: 'copper' (default) uses the AWG table directly; 'aluminum' multiplies resistance by 1.64 (approximation). " +
        "lengthFeet is the one-way run length in feet.",
      inputSchema: {
        awg: z.enum(AWG_LABELS).describe("Wire gauge (AWG label, e.g. '10', '4/0')"),
        amps: z.number().positive().describe("Current draw in amps"),
        lengthFeet: z.number().positive().describe("One-way run length in feet"),
        systemVolts: z
          .number()
          .positive()
          .default(12)
          .describe("System voltage in volts (default 12)"),
        material: z
          .enum(["copper", "aluminum"])
          .default("copper")
          .describe("Wire material (default 'copper')")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ awg, amps, lengthFeet, systemVolts, material }) => {
      const r = calcVoltageDrop(awg, amps, lengthFeet, systemVolts ?? 12, material ?? "copper");
      return ok({
        vDrop: parseFloat(r.vDrop.toFixed(2)),
        dropPercent: parseFloat(r.dropPercent.toFixed(2)),
        endVolts: parseFloat(r.endVolts.toFixed(2)),
        note: r.note,
        inputs: r.inputs
      });
    }
  );

  // ── 2. recommend_wire_gauge ─────────────────────────────────────────────────

  server.registerTool(
    "recommend_wire_gauge",
    {
      title: "Wire Gauge Recommender",
      description:
        "Recommend the smallest (thinnest) wire gauge that keeps the voltage drop at or below the specified limit. " +
        "Finds the highest AWG number (least copper) whose drop percentage does not exceed maxDropPercent. " +
        "If no standard gauge can meet the requirement, returns the best available with a note.",
      inputSchema: {
        amps: z.number().positive().describe("Current draw in amps"),
        lengthFeet: z.number().positive().describe("One-way run length in feet"),
        systemVolts: z
          .number()
          .positive()
          .default(12)
          .describe("System voltage in volts (default 12)"),
        maxDropPercent: z
          .number()
          .positive()
          .default(3)
          .describe("Maximum allowable voltage drop as a percentage (default 3)"),
        material: z
          .enum(["copper", "aluminum"])
          .default("copper")
          .describe("Wire material (default 'copper')")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ amps, lengthFeet, systemVolts, maxDropPercent, material }) => {
      const r = recommendWireGauge(
        amps,
        lengthFeet,
        systemVolts ?? 12,
        maxDropPercent ?? 3,
        material ?? "copper"
      );
      if (r.success) {
        return ok({
          awg: r.awg,
          vDrop: parseFloat(r.vDrop.toFixed(2)),
          dropPercent: parseFloat(r.dropPercent.toFixed(2)),
          systemVolts: r.systemVolts,
          amps: r.amps,
          lengthFeet: r.lengthFeet,
          maxDropPercent: r.maxDropPercent,
          material: r.material
        });
      } else {
        return ok({
          success: false,
          message: r.message,
          awg: r.awg,
          dropPercent: parseFloat(r.dropPercent.toFixed(2)),
          note: r.note,
          systemVolts: r.systemVolts,
          amps: r.amps,
          lengthFeet: r.lengthFeet,
          maxDropPercent: r.maxDropPercent,
          material: r.material
        });
      }
    }
  );

  // ── 3. ohms_law ─────────────────────────────────────────────────────────────

  server.registerTool(
    "ohms_law",
    {
      title: "Ohm's Law Calculator",
      description:
        "Compute all four Ohm's law quantities (volts, amps, ohms, watts) from exactly two known inputs. " +
        "Provide exactly 2 of: volts, amps, ohms, watts. " +
        "Formulas: V = I·R, P = V·I = I²·R = V²/R. " +
        "Returns all four quantities.",
      inputSchema: {
        volts: z.number().positive().optional().describe("Voltage in volts"),
        amps: z.number().positive().optional().describe("Current in amps"),
        ohms: z.number().positive().optional().describe("Resistance in ohms"),
        watts: z.number().positive().optional().describe("Power in watts")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ volts, amps, ohms, watts }) => {
      const inputs = {
        ...(volts !== undefined ? { volts } : {}),
        ...(amps !== undefined ? { amps } : {}),
        ...(ohms !== undefined ? { ohms } : {}),
        ...(watts !== undefined ? { watts } : {})
      };
      const r = calcOhmsLaw(inputs);
      if ("error" in r) {
        return ok({ error: r.error });
      }
      return ok({
        volts: parseFloat(r.volts.toFixed(4)),
        amps: parseFloat(r.amps.toFixed(4)),
        ohms: parseFloat(r.ohms.toFixed(4)),
        watts: parseFloat(r.watts.toFixed(4)),
        inputs: r.inputs
      });
    }
  );

  // ── 4. fuse_size ────────────────────────────────────────────────────────────

  server.registerTool(
    "fuse_size",
    {
      title: "Fuse Size Recommender",
      description:
        "Recommend the smallest standard automotive blade-fuse rating for a given continuous load. " +
        "Standard fuse rule: fuse at 125% of the continuous current draw (factor 1.25). " +
        "Optionally checks if the recommended fuse exceeds the wire's ampacity. " +
        "Standard automotive blade fuse sizes: 1, 2, 3, 4, 5, 7.5, 10, 15, 20, 25, 30, 35, 40 A. " +
        "The fuse protects the wire — it must not exceed the wire's ampacity. This is guidance, not a code-compliant spec.",
      inputSchema: {
        continuousAmps: z.number().positive().describe("Continuous current draw in amps"),
        factor: z
          .number()
          .positive()
          .default(1.25)
          .describe("Overcurrent factor (default 1.25 = 125% of continuous load)"),
        wireAmpacity: z
          .number()
          .positive()
          .optional()
          .describe("Wire ampacity in amps (optional; used to check if fuse exceeds wire rating)")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ continuousAmps, factor, wireAmpacity }) => {
      const r = calcFuseSize(continuousAmps, factor ?? 1.25, wireAmpacity);
      return ok({
        minRequiredAmps: parseFloat(r.minRequiredAmps.toFixed(2)),
        recommendedFuseAmps: r.recommendedFuseAmps,
        standardSizes: r.standardSizes,
        wireWarning: r.wireWarning,
        caveat: r.caveat,
        inputs: r.inputs
      });
    }
  );

  // ── 5. battery_runtime ──────────────────────────────────────────────────────

  server.registerTool(
    "battery_runtime",
    {
      title: "Battery Runtime Estimator",
      description:
        "Estimate how long a battery will power a load given its capacity and depth of discharge. " +
        "Provide either loadAmps or loadWatts (not both). " +
        "usableDepthPercent: 50% is a conservative default for lead-acid/AGM; LiFePO4 is often 80–100%. " +
        "This is an ideal estimate ignoring the Peukert effect, temperature derating, and inverter losses.",
      inputSchema: {
        capacityAh: z.number().positive().describe("Battery capacity in amp-hours (Ah)"),
        loadAmps: z.number().positive().optional().describe("Continuous load in amps"),
        loadWatts: z.number().positive().optional().describe("Continuous load in watts"),
        systemVolts: z
          .number()
          .positive()
          .default(12)
          .describe("System voltage (used to convert watts to amps, default 12)"),
        usableDepthPercent: z
          .number()
          .positive()
          .default(50)
          .describe("Usable depth of discharge as a percentage (default 50)")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ capacityAh, loadAmps, loadWatts, systemVolts, usableDepthPercent }) => {
      const r = calcBatteryRuntime(
        capacityAh,
        systemVolts ?? 12,
        usableDepthPercent ?? 50,
        loadAmps,
        loadWatts
      );
      if ("error" in r) {
        return ok({ error: r.error });
      }
      return ok({
        runtimeHours: parseFloat(r.runtimeHours.toFixed(2)),
        loadAmps: parseFloat(r.loadAmps.toFixed(4)),
        usableAh: parseFloat(r.usableAh.toFixed(2)),
        capacityAh: r.capacityAh,
        usableDepthPercent: r.usableDepthPercent,
        note: r.note,
        inputs: r.inputs
      });
    }
  );

  // ── 6. battery_bank ─────────────────────────────────────────────────────────

  server.registerTool(
    "battery_bank",
    {
      title: "Battery Bank Calculator",
      description:
        "Calculate the total voltage, amp-hours, watt-hours, and cell count for a series/parallel battery bank. " +
        "Series connection increases voltage; parallel connection increases amp-hours. " +
        "totalVolts = cellVolts × series; totalAh = cellAh × parallel; totalWh = cellVolts × cellAh × series × parallel.",
      inputSchema: {
        cellVolts: z.number().positive().describe("Nominal voltage of each cell/battery in volts"),
        cellAh: z
          .number()
          .positive()
          .describe("Capacity of each cell/battery in amp-hours (Ah)"),
        series: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe("Number of cells in series (default 1)"),
        parallel: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe("Number of parallel strings (default 1)")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ cellVolts, cellAh, series, parallel }) => {
      const r = calcBatteryBank(cellVolts, cellAh, series ?? 1, parallel ?? 1);
      return ok({
        totalVolts: parseFloat(r.totalVolts.toFixed(2)),
        totalAh: parseFloat(r.totalAh.toFixed(2)),
        totalWh: parseFloat(r.totalWh.toFixed(2)),
        count: r.count,
        configuration: r.configuration,
        inputs: r.inputs
      });
    }
  );
}
