import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ok } from "../result.js";
import type { GarageStore } from "../store.js";

const writeHint = { readOnlyHint: false, openWorldHint: false };
const readHint = { readOnlyHint: true, openWorldHint: false };

export function registerGarageTools(server: McpServer, store: GarageStore): void {
  // --- Vehicles ---------------------------------------------------------

  server.registerTool(
    "save_vehicle",
    {
      title: "Save Vehicle",
      description: "Save a vehicle to the user's garage so it can be recalled in future sessions.",
      inputSchema: {
        nickname: z.string().min(1),
        vin: z.string().optional(),
        year: z.number().int().optional(),
        make: z.string().optional(),
        model: z.string().optional(),
        trim: z.string().optional(),
        notes: z.string().optional()
      },
      annotations: writeHint
    },
    async input => ok(await store.saveVehicle(input))
  );

  server.registerTool(
    "list_vehicles",
    {
      title: "List Vehicles",
      description: "List all saved vehicles in the user's garage.",
      inputSchema: {},
      annotations: readHint
    },
    async () => ok(await store.listVehicles())
  );

  server.registerTool(
    "get_vehicle",
    {
      title: "Get Vehicle",
      description: "Get one saved vehicle by id.",
      inputSchema: { id: z.string().min(1) },
      annotations: readHint
    },
    async ({ id }) => {
      const vehicle = await store.getVehicle(id);
      if (!vehicle) throw new Error(`No vehicle with id ${id}`);
      return ok(vehicle);
    }
  );

  server.registerTool(
    "update_vehicle",
    {
      title: "Update Vehicle",
      description: "Update fields on a saved vehicle.",
      inputSchema: {
        id: z.string().min(1),
        nickname: z.string().optional(),
        vin: z.string().optional(),
        year: z.number().int().optional(),
        make: z.string().optional(),
        model: z.string().optional(),
        trim: z.string().optional(),
        notes: z.string().optional()
      },
      annotations: writeHint
    },
    async ({ id, ...patch }) => {
      const vehicle = await store.updateVehicle(id, patch);
      if (!vehicle) throw new Error(`No vehicle with id ${id}`);
      return ok(vehicle);
    }
  );

  server.registerTool(
    "delete_vehicle",
    {
      title: "Delete Vehicle",
      description: "Remove a saved vehicle from the garage.",
      inputSchema: { id: z.string().min(1) },
      annotations: writeHint
    },
    async ({ id }) => {
      if (!(await store.deleteVehicle(id))) throw new Error(`No vehicle with id ${id}`);
      return ok(`Deleted vehicle ${id}`);
    }
  );

  // --- Searches ---------------------------------------------------------

  server.registerTool(
    "log_search",
    {
      title: "Log Search",
      description: "Record a parts/repair search the user ran, optionally tied to a vehicle.",
      inputSchema: {
        query: z.string().min(1),
        context: z.string().optional(),
        vehicleId: z.string().optional()
      },
      annotations: writeHint
    },
    async input => ok(await store.logSearch(input))
  );

  server.registerTool(
    "list_recent_searches",
    {
      title: "List Recent Searches",
      description: "List the most recent searches the user has logged (newest first).",
      inputSchema: { limit: z.number().int().min(1).max(200).optional() },
      annotations: readHint
    },
    async ({ limit }) => ok(await store.listRecentSearches(limit))
  );

  // --- Preferred brands -------------------------------------------------

  server.registerTool(
    "set_preferred_brand",
    {
      title: "Set Preferred Brand",
      description: "Mark a parts brand as preferred, or remove the preference.",
      inputSchema: { brand: z.string().min(1), preferred: z.boolean().default(true) },
      annotations: writeHint
    },
    async ({ brand, preferred }) => ok(await store.setPreferredBrand(brand, preferred))
  );

  server.registerTool(
    "list_preferred_brands",
    {
      title: "List Preferred Brands",
      description: "List the user's preferred parts brands.",
      inputSchema: {},
      annotations: readHint
    },
    async () => ok(await store.listPreferredBrands())
  );

  // --- Project builds ---------------------------------------------------

  server.registerTool(
    "create_project_build",
    {
      title: "Create Project Build",
      description: "Start a project build (e.g. a restoration or mod list), optionally tied to a vehicle.",
      inputSchema: {
        name: z.string().min(1),
        goal: z.string().optional(),
        vehicleId: z.string().optional()
      },
      annotations: writeHint
    },
    async input => ok(await store.createProjectBuild(input))
  );

  server.registerTool(
    "add_project_note",
    {
      title: "Add Project Note",
      description: "Append a note to a project build.",
      inputSchema: { projectId: z.string().min(1), text: z.string().min(1) },
      annotations: writeHint
    },
    async ({ projectId, text }) => {
      const project = await store.addProjectNote(projectId, text);
      if (!project) throw new Error(`No project with id ${projectId}`);
      return ok(project);
    }
  );

  server.registerTool(
    "list_project_builds",
    {
      title: "List Project Builds",
      description: "List all project builds.",
      inputSchema: {},
      annotations: readHint
    },
    async () => ok(await store.listProjectBuilds())
  );
}
