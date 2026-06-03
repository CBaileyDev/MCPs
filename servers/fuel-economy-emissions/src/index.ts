#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createFuelEconomyMcpServer } from "./server.js";

const server = createFuelEconomyMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("fuel-economy-emissions MCP server running on stdio");
