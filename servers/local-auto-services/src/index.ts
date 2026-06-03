#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLocalAutoServicesMcpServer } from "./server.js";

const server = createLocalAutoServicesMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("local-auto-services MCP server running on stdio");
