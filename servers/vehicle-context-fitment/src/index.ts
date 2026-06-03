#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createVehicleContextMcpServer } from "./server.js";

const server = createVehicleContextMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("vehicle-context-fitment MCP server running on stdio");
