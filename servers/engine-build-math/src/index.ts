#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createEngineBuildMathMcpServer } from "./server.js";

const server = createEngineBuildMathMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("engine-build-math MCP server running on stdio");
