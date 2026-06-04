import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ok } from "../result.js";
import {
  convertFuelEconomy,
  convertPower,
  convertTorque,
  convertPressure,
  convertVolume,
  convertSocketSize
} from "../domain/convert.js";

export function registerAutomotiveUnitConverterTools(server: McpServer): void {
  // ── 1. convert_fuel_economy ─────────────────────────────────────────────────
  server.registerTool(
    "convert_fuel_economy",
    {
      title: "Convert Fuel Economy",
      description:
        "Convert a fuel economy value between US MPG, Imperial MPG, L/100km, and km/L. " +
        "Returns all four units at once. Note: L/100km is inverse (lower is better), " +
        "while mpg and km/L are higher-is-better.",
      inputSchema: {
        value: z.number().positive().describe("Fuel economy value to convert"),
        from: z
          .enum(["mpg_us", "mpg_imp", "l_per_100km", "km_per_l"])
          .describe("Unit of the input value")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ value, from }) => {
      const r = convertFuelEconomy(value, from);
      return ok({
        mpg_us: parseFloat(r.mpg_us.toFixed(2)),
        mpg_imp: parseFloat(r.mpg_imp.toFixed(2)),
        l_per_100km: parseFloat(r.l_per_100km.toFixed(2)),
        km_per_l: parseFloat(r.km_per_l.toFixed(2)),
        note: r.note,
        inputs: r.inputs
      });
    }
  );

  // ── 2. convert_power ────────────────────────────────────────────────────────
  server.registerTool(
    "convert_power",
    {
      title: "Convert Power",
      description:
        "Convert a power value between mechanical horsepower (hp/SAE), kilowatts (kw), and metric horsepower (ps/CV). " +
        "Returns all three units at once. Note: PS (metric hp) ≠ hp (mechanical).",
      inputSchema: {
        value: z.number().positive().describe("Power value to convert"),
        from: z.enum(["hp", "kw", "ps"]).describe("Unit of the input value")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ value, from }) => {
      const r = convertPower(value, from);
      return ok({
        hp: parseFloat(r.hp.toFixed(2)),
        kw: parseFloat(r.kw.toFixed(2)),
        ps: parseFloat(r.ps.toFixed(2)),
        inputs: r.inputs
      });
    }
  );

  // ── 3. convert_torque ───────────────────────────────────────────────────────
  server.registerTool(
    "convert_torque",
    {
      title: "Convert Torque",
      description:
        "Convert a torque value between pound-feet (lb_ft), Newton-meters (nm), and kilogram-force-meters (kg_m). " +
        "Returns all three units at once.",
      inputSchema: {
        value: z.number().positive().describe("Torque value to convert"),
        from: z.enum(["lb_ft", "nm", "kg_m"]).describe("Unit of the input value")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ value, from }) => {
      const r = convertTorque(value, from);
      return ok({
        lb_ft: parseFloat(r.lb_ft.toFixed(2)),
        nm: parseFloat(r.nm.toFixed(2)),
        kg_m: parseFloat(r.kg_m.toFixed(2)),
        inputs: r.inputs
      });
    }
  );

  // ── 4. convert_pressure ─────────────────────────────────────────────────────
  server.registerTool(
    "convert_pressure",
    {
      title: "Convert Pressure",
      description:
        "Convert a pressure value between PSI, bar, kilopascals (kpa), and inches of mercury (inhg). " +
        "Returns all four units at once. Useful for tire pressure, boost pressure, and atmospheric readings.",
      inputSchema: {
        value: z.number().positive().describe("Pressure value to convert"),
        from: z
          .enum(["psi", "bar", "kpa", "inhg"])
          .describe("Unit of the input value")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ value, from }) => {
      const r = convertPressure(value, from);
      return ok({
        psi: parseFloat(r.psi.toFixed(2)),
        bar: parseFloat(r.bar.toFixed(2)),
        kpa: parseFloat(r.kpa.toFixed(2)),
        inhg: parseFloat(r.inhg.toFixed(2)),
        inputs: r.inputs
      });
    }
  );

  // ── 5. convert_volume ───────────────────────────────────────────────────────
  server.registerTool(
    "convert_volume",
    {
      title: "Convert Volume",
      description:
        "Convert a volume value between liters (l), milliliters (ml), US quarts (us_qt), US gallons (us_gal), " +
        "Imperial quarts (imp_qt), and Imperial gallons (imp_gal). Returns all six units at once. " +
        "Note: US gallon ≠ Imperial gallon.",
      inputSchema: {
        value: z.number().positive().describe("Volume value to convert"),
        from: z
          .enum(["l", "ml", "us_qt", "us_gal", "imp_qt", "imp_gal"])
          .describe("Unit of the input value")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ value, from }) => {
      const r = convertVolume(value, from);
      return ok({
        l: parseFloat(r.l.toFixed(2)),
        ml: parseFloat(r.ml.toFixed(2)),
        us_qt: parseFloat(r.us_qt.toFixed(2)),
        us_gal: parseFloat(r.us_gal.toFixed(2)),
        imp_qt: parseFloat(r.imp_qt.toFixed(2)),
        imp_gal: parseFloat(r.imp_gal.toFixed(2)),
        inputs: r.inputs
      });
    }
  );

  // ── 6. socket_size ──────────────────────────────────────────────────────────
  server.registerTool(
    "socket_size",
    {
      title: "Socket Size Finder",
      description:
        "Given a socket size in mm or decimal inches, find the nearest standard socket in the OTHER measurement system. " +
        "Returns the input in mm, the nearest socket label and its mm value, the absolute gap (deltaMm), " +
        "and a verdict heuristic. " +
        "Verdict heuristic (practical rule of thumb, NOT a guarantee of fit): " +
        "≤0.15 mm = interchangeable; 0.15–0.40 mm = usable in a pinch with rounding risk; >0.40 mm = do not substitute. " +
        "For inch input, provide decimal inches (e.g. 0.75 for 3/4\").",
      inputSchema: {
        value: z
          .number()
          .positive()
          .describe('Socket size — in mm, or decimal inches (e.g. 0.75 for 3/4")'),
        unit: z.enum(["mm", "in"]).describe('Measurement system of the input value: "mm" or "in"')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ value, unit }) => {
      const r = convertSocketSize(value, unit);
      return ok({
        inputMm: parseFloat(r.inputMm.toFixed(3)),
        nearestLabel: r.nearestLabel,
        nearestMm: parseFloat(r.nearestMm.toFixed(3)),
        deltaMm: r.deltaMm,
        verdict: r.verdict,
        inputs: r.inputs
      });
    }
  );
}
