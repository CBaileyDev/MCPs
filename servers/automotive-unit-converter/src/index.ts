#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAutomotiveUnitConverterMcpServer } from "./server.js";

const server = createAutomotiveUnitConverterMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("automotive-unit-converter MCP server running on stdio");
