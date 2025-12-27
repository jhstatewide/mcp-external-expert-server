// HTTP Server setup for MCP External Expert Server

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import cors from "cors";
import { setupServerHandlers } from "../handlers/mcp-handlers.js";
import { MCP_HTTP_PORT } from "../config/index.js";

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
      name: "mcp-external-expert",
      version: "0.2.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );
 
  setupServerHandlers(httpServer);
 
  // Create streamable HTTP transport (supports both SSE and direct HTTP)
  // Try stateless mode first - MCP Inspector may work better without session management
  // If this doesn't work, we can switch back to stateful mode
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode - no session validation
  });
 
  // Connect server to transport
  await httpServer.connect(transport);
 
  // Handle MCP requests via streamable HTTP transport
  // The transport handles all HTTP methods (GET for SSE, POST for JSON-RPC, OPTIONS for CORS)
  // Use a single handler that works for both /mcp and /sse endpoints
  const handleTransportRequest = async (req: any, res: any) => {
    try {
      // For GET/OPTIONS requests (SSE/CORS), there's no body
      // For POST requests, body is already parsed by Express middleware
      const body = (req.method === 'GET' || req.method === 'OPTIONS') ? undefined : req.body;
      
      // Debug logging for troubleshooting (set DEBUG=true to enable)
      if (process.env.DEBUG === 'true') {
        console.error(`[MCP] ${req.method} ${req.url}`, {
          method: req.method,
          bodyMethod: body?.method
        });
      }
      
      // The transport's handleRequest method expects Node.js IncomingMessage/ServerResponse
      await transport.handleRequest(req, res, body);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MCP] Error handling ${req.method} ${req.url}:`, errorMessage);
      // Only send error response if headers haven't been sent (e.g., SSE stream not started)
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
        // For SSE streams, log the error but don't try to send JSON
        console.error("Error in transport request:", errorMessage);
      }
    }
  };
  
  // Handle all methods on /mcp endpoint (main MCP endpoint)
  // This handles both regular HTTP POST and SSE GET requests
  app.all("/mcp", handleTransportRequest);
  
  // Also handle /sse endpoint for clients that use it explicitly
  app.all("/sse", handleTransportRequest);
  
  return new Promise<void>((resolve) => {
    app.listen(MCP_HTTP_PORT, () => {
      console.error(`MCP External Expert Server running on HTTP/SSE at http://localhost:${MCP_HTTP_PORT}/mcp`);
      console.error(`  - Supports regular HTTP POST (JSON-RPC)`);
      console.error(`  - Supports SSE (Server-Sent Events) streaming`);
      console.error(`  - Compatible with MCP Inspector, Goose Desktop, Cursor, and other MCP clients`);
      resolve();
    });
  });
}
