// HTTP Server setup for MCP External Expert Server

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import cors from "cors";
import type { Request, Response } from "express";
import { setupServerHandlers } from "../handlers/mcp-handlers.js";
import { MCP_HTTP_PORT } from "../config/index.js";
import { SERVER_NAME, VERSION } from "../constants.js";

export async function startHttpServer() {
  // Create Express app with MCP support (includes DNS rebinding protection)
  const app = createMcpExpressApp();

  // Enable CORS for web-based MCP clients (like MCP Inspector)
  app.use(cors({
    origin: true, // Allow all origins (for local development)
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Session-Id',
      'Mcp-Session-Id',
      'Mcp-Protocol-Version',
      'Accept',
      'Last-Event-ID'
    ],
  }));

  // Create a separate server instance for HTTP to avoid transport conflicts
  const httpServer = new Server(
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

  setupServerHandlers(httpServer);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
  });

  await httpServer.connect(transport);

  // Transport handles GET (SSE), POST (JSON-RPC), and OPTIONS (CORS)
  const handleTransportRequest = async (req: Request, res: Response) => {
    try {
      // GET/OPTIONS have no body; POST body is parsed by Express
      const body = (req.method === 'GET' || req.method === 'OPTIONS') ? undefined : req.body;

      if (process.env.DEBUG === 'true') {
        console.error(`[MCP] ${req.method} ${req.url}`, {
          method: req.method,
          bodyMethod: body?.method
        });
      }

      await transport.handleRequest(req, res, body);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MCP] Error handling ${req.method} ${req.url}:`, errorMessage);

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: {
            code: -32603,
            message: "Internal error",
            data: errorMessage
          }
        });
      } else {
        // SSE stream already started, can't send JSON
        console.error("Error in transport request:", errorMessage);
      }
    }
  };

  app.all("/mcp", handleTransportRequest);
  app.all("/sse", handleTransportRequest);

  return new Promise<void>((resolve) => {
    app.listen(MCP_HTTP_PORT, () => {
      console.error(`MCP External Expert Server v${VERSION} running on HTTP/SSE at http://localhost:${MCP_HTTP_PORT}/mcp`);
      console.error(`  - Supports regular HTTP POST (JSON-RPC)`);
      console.error(`  - Supports SSE (Server-Sent Events) streaming`);
      console.error(`  - Compatible with MCP Inspector, Goose Desktop, Cursor, and other MCP clients`);
      resolve();
    });
  });
}
