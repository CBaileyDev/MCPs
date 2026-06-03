#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createVpicMcpServer } from "./server.js";

const server = createVpicMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("vpic MCP server running on stdio");
