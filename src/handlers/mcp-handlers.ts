// MCP Server Handlers for External Expert Server

import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { delegate } from "../core/delegate.js";
import { redactSecrets, clampText } from "../utils/text-processing.js";
import { DELEGATE_PROVIDER, DELEGATE_MODEL } from "../config/index.js";

// Handler for listing available tools
export const toolsListHandler = async () => {
  return {
    tools: [
      {
        name: "delegate",
        description: "Delegate a subtask to an external expert model for planning, critique, testing, or explanation.\n\n⚠️ CRITICAL: The external expert model is COMPLETELY ISOLATED from your context. It CANNOT see:\n- Your conversation history\n- Any files you have open\n- Any code you're working on\n- Any previous tool results\n- Any context from your current session\n\nThe external expert model ONLY receives:\n1. What you explicitly pass in the 'input' parameter\n2. What you explicitly pass in the 'context' parameter (if provided)\n3. Its own training knowledge (general knowledge only)\n\nYou MUST include ALL relevant information in 'input' or 'context' parameters. Do NOT assume the external expert model can see anything else. If you reference files, code, or previous conversations, you MUST paste that content into the parameters.",
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
              description: "The input/task to delegate (required). ⚠️ CRITICAL: Include ALL relevant information here - the external expert model cannot see your files, conversation history, or any other context!"
            },
            context: {
              type: "string",
              description: "Optional context for the task. ⚠️ If you reference files, code, or previous conversations, you MUST paste that content here - the external expert model has NO other access to your context!"
            },
            maxTokens: {
              type: "number",
              description: "Maximum tokens for model output (default: from DELEGATE_MAX_TOKENS env var, typically 800)"
            }
          },
          required: ["mode", "input"]
        }
      }
    ]
  };
};

// Handler for tool calls
export const toolsCallHandler = async (request: { params: { name: string; arguments?: any } }) => {
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
  const maxTokens = args.maxTokens as number | undefined;
  
  if (!mode || !input) {
    throw new Error(`mode and input are required. Received: mode=${JSON.stringify(mode)}, input=${JSON.stringify(input)}`);
  }
  
  try {
    const startTime = Date.now();
    const result = await delegate(mode, input, context, maxTokens);
    const duration = Date.now() - startTime;
    
    // Get provider and model info for metadata
    const delegateProvider = process.env.DELEGATE_PROVIDER || DELEGATE_PROVIDER;
    const delegateModel = ('DELEGATE_MODEL' in process.env)
      ? process.env.DELEGATE_MODEL
      : DELEGATE_MODEL;
    
    // Log response metadata (not the full response to avoid console spam)
    const resultLength = result.length;
    const previewLength = 150;
    const preview = result.length > previewLength  
      ? result.substring(0, previewLength) + '...' 
      : result;
    
    console.error(`[MCP] Response received: mode=${mode}, provider=${delegateProvider}, model=${delegateModel}, duration=${duration}ms, length=${resultLength} chars, preview="${preview.replace(/\n/g, '\\n')}"`);
    
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
        const thinkingLength = parsed.thinking.length;
        const contentLength = parsed.content.length;
        
        // Log thinking extraction info
        console.error(`[MCP] Thinking extracted: thinking=${thinkingLength} chars, content=${contentLength} chars`);
        
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
            priority: 1 // Higher priority - main content
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
    const metadataText = `[Metadata] Provider: ${metadata.provider}, Model: ${metadata.model}, Mode: ${metadata.mode}, Duration: ${metadata.durationMs}ms, Thinking extracted: ${metadata.hasThinking}, Timestamp: ${metadata.timestamp}\n\n⚠️ REMINDER: The external expert model that generated this response had NO access to your context, files, or conversation history. It only saw what you passed in the 'input' and 'context' parameters.`;
    
    content.push({
      type: "text",
      text: metadataText,
      annotations: {
        audience: ["assistant"], // Metadata is for the calling model only
        priority: 0 // Lowest priority - just reference info (MCP requires >= 0)
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
export function setupServerHandlers(server: any) {
  server.setRequestHandler(ListToolsRequestSchema, toolsListHandler);
  server.setRequestHandler(CallToolRequestSchema, toolsCallHandler);
}
