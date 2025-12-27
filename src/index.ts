#!/usr/bin/env node

// Main entry point for MCP External Expert Server

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { setupServerHandlers } from "./handlers/mcp-handlers.js";
import { startHttpServer } from "./server/http-server.js";
import { validateConfiguration, MCP_STDIO, MCP_HTTP } from "./config/index.js";
import { delegate } from "./core/delegate.js";
import { SERVER_NAME, VERSION } from "./constants.js";

export { redactSecrets, clampText } from "./utils/text-processing.js";
export { delegate };

const server = new Server(
  {
    name: SERVER_NAME,
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

setupServerHandlers(server);

async function start() {
  validateConfiguration();
  
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  
  const promises = [];
  
  if (MCP_STDIO) {
    const transport = new StdioServerTransport();
    promises.push(
      server.connect(transport).then(() => {
        console.error("MCP External Expert Server running on STDIO");
      })
    );
  }
  
  if (MCP_HTTP) {
    promises.push(startHttpServer());
  }
  
  await Promise.all(promises);
}

if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
  start().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
