#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGarageMcpServer } from "./server.js";

const server = createGarageMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("garage-memory MCP server running on stdio");
