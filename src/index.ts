#!/usr/bin/env node

// Load environment variables from .env file (if it exists)
import { config } from "dotenv";
config();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import { randomUUID } from "crypto";

// Configuration from environment variables
const DELEGATE_PROVIDER = process.env.DELEGATE_PROVIDER || "ollama";
const DELEGATE_BASE_URL = process.env.DELEGATE_BASE_URL || "http://localhost:11434";
const DELEGATE_MODEL = process.env.DELEGATE_MODEL || "";
const DELEGATE_API_KEY = process.env.DELEGATE_API_KEY || "";
const DELEGATE_OPENAI_PATH = process.env.DELEGATE_OPENAI_PATH || "/v1/chat/completions";
const DELEGATE_TIMEOUT_MS = parseInt(process.env.DELEGATE_TIMEOUT_MS || "60000", 10);
const DELEGATE_MAX_TOKENS = parseInt(process.env.DELEGATE_MAX_TOKENS || "800", 10);
const DELEGATE_TEMPERATURE = parseFloat(process.env.DELEGATE_TEMPERATURE || "0.2");
const DELEGATE_EXTRACT_THINKING = process.env.DELEGATE_EXTRACT_THINKING !== "false"; // default true

// Mode-specific system prompts
const SYSTEM_PROMPTS = {
  plan: process.env.DELEGATE_SYSTEM_PLAN || 
    "You are a planning assistant. Provide a step-by-step plan, list assumptions, and identify risks.",
  review: process.env.DELEGATE_SYSTEM_REVIEW || 
    "You are a code reviewer. Review the provided code and identify: bugs, code quality issues, potential improvements, and best practice violations. Rate severity and provide specific, actionable fixes. Focus on correctness, maintainability, and code quality.",
  challenge: process.env.DELEGATE_SYSTEM_CHALLENGE || 
    "You are a devil's advocate and critical thinker. Your role is to challenge ideas, find flaws, weaknesses, and potential problems in ANY proposal, plan, or concept (not just code). Be thorough, skeptical, and question assumptions. Look for: logical fallacies, missing considerations, edge cases, unintended consequences, scalability issues, and any other potential weaknesses. Be constructive but rigorous - your goal is to strengthen ideas by finding their weak points.",
  tests: process.env.DELEGATE_SYSTEM_TESTS || 
    "You are a test design assistant. Provide a test checklist and edge cases to consider.",
  explain: process.env.DELEGATE_SYSTEM_EXPLAIN || 
    "You are an explanation assistant. Provide concise, clear explanations."
};

// MCP transport configuration
const MCP_HTTP = process.env.MCP_HTTP === "true";
const MCP_HTTP_PORT = parseInt(process.env.MCP_HTTP_PORT || "3333", 10);
const MCP_STDIO = process.env.MCP_STDIO !== "false"; // default true

// Redact obvious secrets from text
export function redactSecrets(text: string): string {
  // Redact API keys (sk-..., bearer tokens, etc.)
  return text
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***REDACTED***")
    .replace(/Bearer\s+[a-zA-Z0-9\-_]{20,}/gi, "Bearer ***REDACTED***")
    .replace(/api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9\-_]{20,}['"]?/gi, "api_key: ***REDACTED***");
}

// Clamp text to maxChars
export function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + "\n\n[Truncated...]";
}

// Extract thinking tags from response
function extractThinking(text: string): { thinking: string | null; content: string } {
  // Match <think>...</think> tags (case-insensitive, allowing whitespace)
  const thinkPattern = /<think>([\s\S]*?)<\/think>/i;
  const match = text.match(thinkPattern);
  
  if (match) {
    const thinking = match[1].trim();
    const content = text.replace(thinkPattern, '').trim();
    return { thinking, content };
  }
  
  return { thinking: null, content: text };
}

// Provider implementations
async function callOllama(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  temperature: number,
  maxChars?: number
): Promise<string> {
  const url = `${DELEGATE_BASE_URL}/api/chat`;
  
  // Calculate max tokens based on maxChars if provided
  // Rough estimate: 1 token ≈ 4 characters for English text
  // Use the smaller of: configured maxTokens or estimated from maxChars
  let numPredict = maxTokens;
  if (maxChars !== undefined) {
    // Estimate tokens from characters (conservative: 1 token = 3.5 chars to account for longer tokens)
    const estimatedTokens = Math.floor(maxChars / 3.5);
    // Use the smaller value to ensure we don't exceed maxChars
    numPredict = Math.min(maxTokens, estimatedTokens);
  }
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      options: {
        num_predict: numPredict,
        temperature
      },
      stream: false
    }),
    signal: AbortSignal.timeout(DELEGATE_TIMEOUT_MS)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data.message?.content || data.response || "";
}

async function callOpenAICompat(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  temperature: number,
  maxChars?: number
): Promise<string> {
  const url = `${DELEGATE_BASE_URL}${DELEGATE_OPENAI_PATH}`;
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (DELEGATE_API_KEY) {
    headers["Authorization"] = `Bearer ${DELEGATE_API_KEY}`;
  }

  // Calculate max tokens based on maxChars if provided
  // Rough estimate: 1 token ≈ 4 characters for English text
  // Use the smaller of: configured maxTokens or estimated from maxChars
  let maxTokensToUse = maxTokens;
  if (maxChars !== undefined) {
    // Estimate tokens from characters (conservative: 1 token = 3.5 chars to account for longer tokens)
    const estimatedTokens = Math.floor(maxChars / 3.5);
    // Use the smaller value to ensure we don't exceed maxChars
    maxTokensToUse = Math.min(maxTokens, estimatedTokens);
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      max_tokens: maxTokensToUse,
      temperature,
      stream: false
    }),
    signal: AbortSignal.timeout(DELEGATE_TIMEOUT_MS)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI-compatible API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// Main delegate function
export async function delegate(
  mode: string,
  input: string,
  context?: string,
  maxChars?: number
): Promise<string> {
  const maxCharsValue = maxChars || 12000;
  
  // Read from process.env directly to support dynamic changes in tests
  // Check if the property exists in process.env (even if empty), otherwise use constant
  const delegateModel = ('DELEGATE_MODEL' in process.env)
    ? process.env.DELEGATE_MODEL
    : DELEGATE_MODEL;
  
  if (!delegateModel || delegateModel.trim() === "") {
    throw new Error("DELEGATE_MODEL environment variable is required");
  }

  if (!["plan", "review", "challenge", "explain", "tests"].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}. Must be one of: plan, review, challenge, explain, tests`);
  }

  const systemPrompt = SYSTEM_PROMPTS[mode as keyof typeof SYSTEM_PROMPTS];
  
  // Build user message with explicit isolation reminder
  // Add a reminder that this model has no access to the caller's context
  let userMessage = input;
  if (context) {
    userMessage = `Context:\n${context}\n\nTask:\n${input}`;
  }
  
  // Prepend isolation reminder to help the helper model understand its constraints
  const isolationReminder = `[IMPORTANT: You are being called as a helper model. You have NO access to the calling model's context, files, or conversation history. You ONLY have the information provided below. Do not reference or assume knowledge of anything not explicitly stated here.]\n\n`;
  userMessage = isolationReminder + userMessage;
  
  // Clamp input size
  userMessage = clampText(userMessage, maxCharsValue);
  
  // Redact secrets
  userMessage = redactSecrets(userMessage);

  // Read provider from process.env directly to support dynamic changes in tests
  const delegateProvider = process.env.DELEGATE_PROVIDER || DELEGATE_PROVIDER;
  
  // Call appropriate provider
  // Pass maxChars to help the model limit its output
  let result: string;
  if (delegateProvider === "ollama") {
    result = await callOllama(
      delegateModel,
      systemPrompt,
      userMessage,
      DELEGATE_MAX_TOKENS,
      DELEGATE_TEMPERATURE,
      maxCharsValue
    );
  } else if (delegateProvider === "openai_compat") {
    result = await callOpenAICompat(
      delegateModel,
      systemPrompt,
      userMessage,
      DELEGATE_MAX_TOKENS,
      DELEGATE_TEMPERATURE,
      maxCharsValue
    );
  } else {
    throw new Error(`Unknown provider: ${delegateProvider}. Must be 'ollama' or 'openai_compat'`);
  }

  // Extract thinking if enabled
  if (DELEGATE_EXTRACT_THINKING) {
    const { thinking, content } = extractThinking(result);
    if (thinking) {
      // Return thinking separately - will be handled in the response
      return JSON.stringify({ thinking, content: clampText(content, maxCharsValue) });
    }
  }
  
  // Clamp result
  return clampText(result, maxCharsValue);
}

// Handler functions (shared between STDIO and HTTP)
const toolsListHandler = async () => {
  return {
    tools: [
      {
        name: "delegate",
        description: "Delegate a subtask to a helper model for planning, critique, testing, or explanation.\n\n⚠️ CRITICAL: The helper model is COMPLETELY ISOLATED from your context. It CANNOT see:\n- Your conversation history\n- Any files you have open\n- Any code you're working on\n- Any previous tool results\n- Any context from your current session\n\nThe helper model ONLY receives:\n1. What you explicitly pass in the 'input' parameter\n2. What you explicitly pass in the 'context' parameter (if provided)\n3. Its own training knowledge (general knowledge only)\n\nYou MUST include ALL relevant information in 'input' or 'context' parameters. Do NOT assume the helper model can see anything else. If you reference files, code, or previous conversations, you MUST paste that content into the parameters.",
        inputSchema: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["plan", "review", "challenge", "explain", "tests"],
              description: "The type of delegation: plan (step-by-step plan), review (code review - bugs, quality, fixes), challenge (devil's advocate - challenge ideas/find flaws in any concept), explain (explanation), tests (test design)"
            },
            input: {
              type: "string",
              description: "The input/task to delegate (required). ⚠️ CRITICAL: Include ALL relevant information here - the helper model cannot see your files, conversation history, or any other context!"
            },
            context: {
              type: "string",
              description: "Optional context for the task. ⚠️ If you reference files, code, or previous conversations, you MUST paste that content here - the helper model has NO other access to your context!"
            },
            maxChars: {
              type: "number",
              description: "Maximum characters for input/output (default: 12000)"
            }
          },
          required: ["mode", "input"]
        }
      }
    ]
  };
};

const toolsCallHandler = async (request: { params: { name: string; arguments?: any } }) => {
  const { name, arguments: args } = request.params;

  if (name !== "delegate") {
    throw new Error(`Unknown tool: ${name}`);
  }

  // Debug logging to see what we're receiving (set DEBUG=true to enable)
  if (process.env.DEBUG === 'true') {
    console.error('[MCP] tools/call:', { name, args });
  }

  if (!args || typeof args !== "object") {
    throw new Error(`Invalid arguments: ${JSON.stringify(args)}`);
  }

  const mode = args.mode as string;
  const input = args.input as string;
  const context = args.context as string | undefined;
  const maxChars = args.maxChars as number | undefined;

  if (!mode || !input) {
    throw new Error(`mode and input are required. Received: mode=${JSON.stringify(mode)}, input=${JSON.stringify(input)}`);
  }

  try {
    const startTime = Date.now();
    const result = await delegate(mode, input, context, maxChars);
    const duration = Date.now() - startTime;
    
    // Get provider and model info for metadata
    const delegateProvider = process.env.DELEGATE_PROVIDER || DELEGATE_PROVIDER;
    const delegateModel = ('DELEGATE_MODEL' in process.env)
      ? process.env.DELEGATE_MODEL
      : DELEGATE_MODEL;
    
    // Check if result contains extracted thinking (JSON format)
    let content: Array<{ 
      type: string; 
      text: string; 
      annotations?: { 
        audience?: string[];
        priority?: number;
      } 
    }> = [];
    let hasThinking = false;
    
    try {
      const parsed = JSON.parse(result);
      if (parsed.thinking && parsed.content) {
        hasThinking = true;
        // Return thinking and content as separate content blocks
        // Use annotations to mark thinking as internal (assistant-only) and response as for both
        content = [
          {
            type: "text",
            text: parsed.thinking,
            annotations: {
              audience: ["assistant"], // Thinking is internal reasoning for the calling model
              priority: 0 // Lower priority - internal detail
            }
          },
          {
            type: "text",
            text: parsed.content,
            annotations: {
              audience: ["assistant", "user"], // Response is for both
              priority: 1 // Higher priority - main content
            }
          }
        ];
      } else {
        // Not extracted thinking format, return as-is
        content = [{ 
          type: "text", 
          text: result,
          annotations: {
            audience: ["assistant", "user"],
            priority: 1
          }
        }];
      }
    } catch {
      // Not JSON, return as-is
      content = [{ 
        type: "text", 
        text: result,
        annotations: {
          audience: ["assistant", "user"],
          priority: 1
        }
      }];
    }
    
    // Add metadata as a final content block (for the calling model's reference)
    const metadata = {
      provider: delegateProvider,
      model: delegateModel,
      mode: mode,
      durationMs: duration,
      hasThinking: hasThinking,
      timestamp: new Date().toISOString()
    };
    
    // Append metadata with a reminder about context isolation
    const metadataText = `[Metadata] Provider: ${metadata.provider}, Model: ${metadata.model}, Mode: ${metadata.mode}, Duration: ${metadata.durationMs}ms, Thinking extracted: ${metadata.hasThinking}, Timestamp: ${metadata.timestamp}\n\n⚠️ REMINDER: The helper model that generated this response had NO access to your context, files, or conversation history. It only saw what you passed in the 'input' and 'context' parameters.`;
    
    content.push({
      type: "text",
      text: metadataText,
      annotations: {
        audience: ["assistant"], // Metadata is for the calling model only
        priority: -1 // Lowest priority - just reference info
      }
    });
    
    return { content };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`
        }
      ],
      isError: true
    };
  }
};

// Setup request handlers for an MCP server
function setupServerHandlers(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, toolsListHandler);
  server.setRequestHandler(CallToolRequestSchema, toolsCallHandler);
}

// Create MCP server for STDIO
const server = new Server(
  {
    name: "mcp-delegate",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

setupServerHandlers(server);

// Start server based on transport configuration
async function start() {
  // Don't start server if running in test environment
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  if (MCP_STDIO) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Delegate Server running on STDIO");
  }

  if (MCP_HTTP) {
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
        name: "mcp-delegate",
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

    app.listen(MCP_HTTP_PORT, () => {
      console.error(`MCP Delegate Server running on HTTP/SSE at http://localhost:${MCP_HTTP_PORT}/mcp`);
      console.error(`  - Supports regular HTTP POST (JSON-RPC)`);
      console.error(`  - Supports SSE (Server-Sent Events) streaming`);
      console.error(`  - Compatible with MCP Inspector, Goose Desktop, Cursor, and other MCP clients`);
    });
  }

  if (!MCP_STDIO && !MCP_HTTP) {
    console.error("Error: At least one transport (STDIO or HTTP) must be enabled");
    process.exit(1);
  }
}

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
  start().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
