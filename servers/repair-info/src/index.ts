#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRepairInfoMcpServer } from "./server.js";

const server = createRepairInfoMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("repair-info MCP server running on stdio");
