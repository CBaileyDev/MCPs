#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRockAutoMcpServer } from "./server.js";

const server = createRockAutoMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("rockauto-catalog-search MCP server running on stdio");
