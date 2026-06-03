import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ok } from "../result.js";
import * as vpic from "../client.js";

export function registerVpicTools(server: McpServer): void {
  server.registerTool(
    "decode_vin",
    {
      title: "Decode VIN",
      description:
        "Decode a 17-character VIN into make, model, year, engine, plant, and dozens of other attributes via NHTSA vPIC. Pass modelYear to improve accuracy.",
      inputSchema: {
        vin: z.string().min(1),
        modelYear: z.number().int().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ vin, modelYear }) => ok(await vpic.decodeVin(vin, modelYear))
  );

  server.registerTool(
    "decode_vin_batch",
    {
      title: "Decode VIN Batch",
      description: "Decode multiple VINs in a single request. Returns one decoded record per VIN.",
      inputSchema: {
        vins: z.array(z.string().min(1)).min(1).max(50)
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ vins }) => ok(await vpic.decodeVinBatch(vins))
  );

  server.registerTool(
    "get_all_makes",
    {
      title: "Get All Makes",
      description: "List every vehicle make known to NHTSA vPIC.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => ok(await vpic.getAllMakes())
  );

  server.registerTool(
    "get_models_for_make_year",
    {
      title: "Get Models For Make/Year",
      description: "List the models a given make produced in a given model year.",
      inputSchema: {
        make: z.string().min(1),
        modelYear: z.number().int()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ make, modelYear }) => ok(await vpic.getModelsForMakeYear(make, modelYear))
  );

  server.registerTool(
    "get_vehicle_types_for_make",
    {
      title: "Get Vehicle Types For Make",
      description: "List the vehicle types (car, truck, motorcycle, etc.) associated with a make.",
      inputSchema: {
        make: z.string().min(1)
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ make }) => ok(await vpic.getVehicleTypesForMake(make))
  );

  server.registerTool(
    "decode_wmi",
    {
      title: "Decode WMI",
      description:
        "Decode a World Manufacturer Identifier (the first 3 characters of a VIN) into manufacturer details.",
      inputSchema: {
        wmi: z.string().length(3)
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ wmi }) => ok(await vpic.decodeWmi(wmi))
  );

  server.registerTool(
    "validate_make_model_year",
    {
      title: "Validate Make/Model/Year",
      description:
        "Check whether a make/model/year combination is valid. Returns valid:true/false plus the canonical NHTSA spelling when found.",
      inputSchema: {
        make: z.string().min(1),
        model: z.string().min(1),
        modelYear: z.number().int()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ make, model, modelYear }) => ok(await vpic.validateMakeModelYear(make, model, modelYear))
  );
}
