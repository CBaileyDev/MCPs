#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAutomotiveElectricalMcpServer } from "./server.js";

const server = createAutomotiveElectricalMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("automotive-electrical MCP server running on stdio");
