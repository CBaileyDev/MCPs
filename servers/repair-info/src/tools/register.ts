import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import * as nhtsa from "../client.js";
import { maintenanceSchedule } from "../maintenance.js";
import { ok } from "../result.js";

const vehicleSchema = {
  make: z.string().min(1),
  model: z.string().min(1),
  modelYear: z.number().int()
};

export function registerRepairInfoTools(server: McpServer): void {
  server.registerTool(
    "get_recalls",
    {
      title: "Get Recalls",
      description: "Look up official NHTSA safety recalls for a make/model/year.",
      inputSchema: vehicleSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ make, model, modelYear }) => ok(await nhtsa.getRecalls(make, model, modelYear))
  );

  server.registerTool(
    "get_complaints",
    {
      title: "Get Complaints",
      description: "Look up NHTSA consumer complaints for a make/model/year.",
      inputSchema: vehicleSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ make, model, modelYear }) => ok(await nhtsa.getComplaints(make, model, modelYear))
  );

  server.registerTool(
    "get_safety_ratings",
    {
      title: "Get Safety Ratings",
      description: "Look up NHTSA NCAP safety ratings (crash-test stars) for a make/model/year.",
      inputSchema: vehicleSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ make, model, modelYear }) => ok(await nhtsa.getSafetyRatings(make, model, modelYear))
  );

  server.registerTool(
    "get_maintenance_schedule",
    {
      title: "Get Maintenance Schedule",
      description:
        "Return GENERIC, manufacturer-agnostic maintenance intervals. Pass currentMileage to flag items due soon. Set severe=true for severe/heavy-use driving (shorter intervals where applicable). NOTE: rule-of-thumb guidance only, not the OEM schedule (which is proprietary). Full TSB text is also proprietary and not available here.",
      inputSchema: {
        currentMileage: z.number().int().min(0).optional(),
        severe: z.boolean().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ currentMileage, severe }) =>
      ok(maintenanceSchedule(currentMileage, severe != null ? { severe } : undefined))
  );

  server.registerTool(
    "get_recalls_by_vin",
    {
      title: "Get Recalls by VIN",
      description:
        "Decode a VIN via the NHTSA vPIC API to identify the vehicle (make/model/year), then look up official NHTSA safety recalls for that vehicle. The VIN is decoded self-contained via a direct call to the NHTSA vPIC REST API.",
      inputSchema: { vin: z.string().min(11) },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ vin }) => ok(await nhtsa.getRecallsByVin(vin))
  );
}
