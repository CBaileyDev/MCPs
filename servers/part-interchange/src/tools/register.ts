import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { getProvider, type InterchangeProvider } from "../provider.js";
import { ok } from "../result.js";

export function registerInterchangeTools(
  server: McpServer,
  provider: InterchangeProvider = getProvider()
): void {
  server.registerTool(
    "cross_reference_part",
    {
      title: "Cross-Reference Part",
      description:
        "Cross-reference a part number to equivalent OEM and aftermarket numbers. Requires a configured data provider.",
      inputSchema: { partNumber: z.string().min(1), brand: z.string().optional() },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ partNumber, brand }) => ok(await provider.crossReference(partNumber, brand))
  );

  server.registerTool(
    "find_aftermarket_equivalents",
    {
      title: "Find Aftermarket Equivalents",
      description:
        "Given an OEM part number, find aftermarket equivalents. Requires a configured data provider.",
      inputSchema: { oemNumber: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ oemNumber }) => ok(await provider.findAftermarket(oemNumber))
  );
}
