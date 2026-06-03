#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createObdDiagnosticsMcpServer } from "./server.js";

const server = createObdDiagnosticsMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("obd-diagnostics MCP server running on stdio");
