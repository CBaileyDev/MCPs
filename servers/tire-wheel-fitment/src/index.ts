#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTireWheelFitmentMcpServer } from "./server.js";

const server = createTireWheelFitmentMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("tire-wheel-fitment MCP server running on stdio");
