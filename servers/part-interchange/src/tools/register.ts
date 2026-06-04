import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { getProvider, ProviderNotConfiguredError, type InterchangeProvider } from "../provider.js";
import { ok } from "../result.js";
import { InterchangeStore } from "../store.js";

const writeHint = { readOnlyHint: false, openWorldHint: false };
const readHint = { readOnlyHint: true, openWorldHint: false };

const NO_LOCAL_GUIDANCE =
  "No local interchange recorded for this part number. " +
  "The licensed data provider is not configured. " +
  "You can record an interchange manually using the add_interchange tool.";

export function registerInterchangeTools(
  server: McpServer,
  provider: InterchangeProvider = getProvider(),
  store: InterchangeStore = new InterchangeStore()
): void {
  server.registerTool(
    "cross_reference_part",
    {
      title: "Cross-Reference Part",
      description:
        "Cross-reference a part number to equivalent OEM and aftermarket numbers. Checks the local interchange database first, then falls back to a licensed data provider if configured.",
      inputSchema: { partNumber: z.string().min(1), brand: z.string().optional() },
      annotations: readHint
    },
    async ({ partNumber, brand }) => {
      const result = await store.crossReference(partNumber, brand);
      if (result.matches.length > 0) {
        return ok(result);
      }
      // Fall back to provider
      try {
        return ok(await provider.crossReference(partNumber, brand));
      } catch (err) {
        if (err instanceof ProviderNotConfiguredError) {
          return ok({ inputNumber: partNumber, matches: [], message: NO_LOCAL_GUIDANCE });
        }
        throw err;
      }
    }
  );

  server.registerTool(
    "find_aftermarket_equivalents",
    {
      title: "Find Aftermarket Equivalents",
      description:
        "Given an OEM part number, find aftermarket equivalents. Checks the local interchange database first, then falls back to a licensed data provider if configured.",
      inputSchema: { oemNumber: z.string().min(1) },
      annotations: readHint
    },
    async ({ oemNumber }) => {
      const result = await store.crossReference(oemNumber);
      if (result.matches.length > 0) {
        // Filter equivalents to aftermarket only
        const filtered = {
          inputNumber: result.inputNumber,
          matches: result.matches.map(m => ({
            groupId: m.groupId,
            equivalents: m.equivalents.filter(e => e.type === "aftermarket")
          }))
        };
        return ok(filtered);
      }
      // Fall back to provider
      try {
        return ok(await provider.findAftermarket(oemNumber));
      } catch (err) {
        if (err instanceof ProviderNotConfiguredError) {
          return ok({
            oemNumber,
            matches: [],
            message: NO_LOCAL_GUIDANCE
          });
        }
        throw err;
      }
    }
  );

  server.registerTool(
    "add_interchange",
    {
      title: "Add Interchange",
      description:
        "Record a new interchange group — a set of equivalent part numbers (at least 2 members). Stores them in the local personal interchange database.",
      inputSchema: {
        members: z
          .array(
            z.object({
              number: z.string().min(1),
              brand: z.string().optional(),
              type: z.enum(["oem", "aftermarket"])
            })
          )
          .min(2),
        category: z.string().optional(),
        notes: z.string().optional()
      },
      annotations: writeHint
    },
    async ({ members, category, notes }) => {
      const group = await store.addGroup({ members, category, notes });
      return ok(group);
    }
  );

  server.registerTool(
    "add_part_to_interchange",
    {
      title: "Add Part to Interchange",
      description: "Add a part number to an existing interchange group.",
      inputSchema: {
        groupId: z.string().min(1),
        number: z.string().min(1),
        brand: z.string().optional(),
        type: z.enum(["oem", "aftermarket"]),
        notes: z.string().optional()
      },
      annotations: writeHint
    },
    async ({ groupId, number, brand, type, notes }) => {
      const group = await store.addMember(groupId, { number, brand, type, notes });
      if (!group) {
        return ok({ error: `No interchange group found with id ${groupId}` });
      }
      return ok(group);
    }
  );

  server.registerTool(
    "list_interchanges",
    {
      title: "List Interchanges",
      description: "List all interchange groups in the local personal database.",
      inputSchema: {},
      annotations: readHint
    },
    async () => {
      const groups = await store.listGroups();
      return ok({ groups });
    }
  );

  server.registerTool(
    "remove_interchange",
    {
      title: "Remove Interchange",
      description: "Delete an interchange group from the local personal database.",
      inputSchema: { groupId: z.string().min(1) },
      annotations: writeHint
    },
    async ({ groupId }) => {
      const removed = await store.removeGroup(groupId);
      if (!removed) {
        return ok({ removed: false, message: `No interchange group found with id ${groupId}` });
      }
      return ok({ removed: true, groupId });
    }
  );
}
