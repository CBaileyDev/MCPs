#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createEvChargingMcpServer } from "./server.js";

const server = createEvChargingMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("ev-charging-range MCP server running on stdio");
