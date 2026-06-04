#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTowingPayloadMathMcpServer } from "./server.js";

const server = createTowingPayloadMathMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("towing-payload-math MCP server running on stdio");
