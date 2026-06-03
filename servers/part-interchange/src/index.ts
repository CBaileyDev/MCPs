#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createInterchangeMcpServer } from "./server.js";

const server = createInterchangeMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("part-interchange MCP server running on stdio");
