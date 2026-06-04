#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDrivetrainGearingMcpServer } from "./server.js";

const server = createDrivetrainGearingMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error("drivetrain-gearing MCP server running on stdio");
