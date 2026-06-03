#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPricingMcpServer } from "./server.js";

const server = createPricingMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("marketplace-pricing MCP server running on stdio");
