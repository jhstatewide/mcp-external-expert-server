// Configuration module for MCP External Expert Server
// Centralizes environment variables and constants

import { config } from "dotenv";

// Load environment variables from .env file (if it exists)
config();

// Helper function to safely parse integer with validation
function parseIntSafe(value: string | undefined, defaultValue: number, min?: number, max?: number): number {
  const parsed = value ? parseInt(value, 10) : defaultValue;
  if (isNaN(parsed)) {
    return defaultValue;
  }
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}

// Helper function to safely parse float with validation
function parseFloatSafe(value: string | undefined, defaultValue: number, min?: number, max?: number): number {
  const parsed = value ? parseFloat(value) : defaultValue;
  if (isNaN(parsed)) {
    return defaultValue;
  }
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}

// Validate URL format
function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Extract hostname from URL
function extractHostname(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return "localhost";
  }
}

// Generate tool name from model and hostname
function generateToolName(model: string, baseUrl: string): string {
  const hostname = extractHostname(baseUrl);
  
  // Sanitize model name: remove slashes, colons, special chars, replace with underscores
  const sanitizedModel = model
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  // Sanitize hostname: remove dots, replace with underscores
  const sanitizedHost = hostname
    .replace(/\./g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  // Combine: expert_host_model (max 59 chars to stay under 60)
  const toolName = `expert_${sanitizedHost}_${sanitizedModel}`;
  
  // Truncate if too long, prioritizing model name (more important for identification)
  if (toolName.length >= 60) {
    const prefix = "expert_";
    const separator = "_";
    
    // Calculate available space: 59 total - prefix - separator
    const availableSpace = 59 - prefix.length - separator.length;
    
    // If hostname is very long, truncate it first
    let hostPart = sanitizedHost;
    let modelPart = sanitizedModel;
    
    // Limit hostname to reasonable size (max 25 chars or 40% of available space)
    const maxHostLength = Math.min(25, Math.floor(availableSpace * 0.4));
    if (hostPart.length > maxHostLength) {
      hostPart = hostPart.substring(0, maxHostLength);
    }
    
    // Calculate remaining space for model
    const remainingForModel = availableSpace - hostPart.length;
    
    if (remainingForModel > 0) {
      // Truncate model to fit in remaining space
      if (modelPart.length > remainingForModel) {
        modelPart = modelPart.substring(0, remainingForModel);
      }
      return `${prefix}${hostPart}${separator}${modelPart}`;
    } else {
      // Hostname took all space, just use model name (truncated)
      const maxModelLength = 59 - prefix.length;
      return prefix + modelPart.substring(0, maxModelLength);
    }
  }
  
  return toolName;
}

// Configuration from environment variables
export const DELEGATE_PROVIDER = process.env.DELEGATE_PROVIDER || "ollama";
export const DELEGATE_BASE_URL = process.env.DELEGATE_BASE_URL || "http://localhost:11434";
export const DELEGATE_MODEL = process.env.DELEGATE_MODEL || "";
export const DELEGATE_API_KEY = process.env.DELEGATE_API_KEY || "";
export const DELEGATE_OPENAI_PATH = process.env.DELEGATE_OPENAI_PATH || "/v1/chat/completions";
// Generate default tool name from model and hostname if not explicitly set
const explicitToolName = process.env.MCP_TOOL_NAME || "";
const defaultModel = process.env.DELEGATE_MODEL || "";
const defaultBaseUrl = process.env.DELEGATE_BASE_URL || "http://localhost:11434";
export const MCP_TOOL_NAME = explicitToolName || (defaultModel ? generateToolName(defaultModel, defaultBaseUrl) : "");
export const DELEGATE_TIMEOUT_MS = parseIntSafe(process.env.DELEGATE_TIMEOUT_MS, 60000, 1000, 600000); // 1s to 10min
export const DELEGATE_MAX_TOKENS = parseIntSafe(process.env.DELEGATE_MAX_TOKENS, 32000, 1, 100000); // 1 to 100k tokens
export const DELEGATE_TEMPERATURE = parseFloatSafe(process.env.DELEGATE_TEMPERATURE, 0.2, 0, 2); // 0 to 2
export const DELEGATE_EXTRACT_THINKING = process.env.DELEGATE_EXTRACT_THINKING !== "false"; // default true
// Ollama context window size (num_ctx) - default 32k tokens for large code reviews
export const DELEGATE_CONTEXT_SIZE = parseIntSafe(process.env.DELEGATE_CONTEXT_SIZE, 32768, 512, 1000000); // 512 to 1M tokens
// Maximum input size in characters (separate from output tokens) - default 2MB
export const DELEGATE_MAX_INPUT_CHARS = parseIntSafe(process.env.DELEGATE_MAX_INPUT_CHARS, 2097152, 1000, 10000000); // 1KB to 10MB

// Mode-specific system prompts
export const SYSTEM_PROMPTS = {
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
export const MCP_HTTP = process.env.MCP_HTTP === "true";
export const MCP_HTTP_PORT = parseIntSafe(process.env.MCP_HTTP_PORT, 3333, 1, 65535);
export const MCP_STDIO = process.env.MCP_STDIO !== "false"; // default true

// Validate required configuration
export function validateConfiguration() {
  if (!DELEGATE_MODEL || DELEGATE_MODEL.trim() === "") {
    throw new Error("DELEGATE_MODEL environment variable is required");
  }

  if (!MCP_TOOL_NAME || MCP_TOOL_NAME.trim() === "") {
    throw new Error("MCP_TOOL_NAME is required. It can be set explicitly via MCP_TOOL_NAME env var, or will be auto-generated from DELEGATE_MODEL and DELEGATE_BASE_URL if DELEGATE_MODEL is set.");
  }

  if (MCP_TOOL_NAME.length >= 60) {
    throw new Error(`MCP_TOOL_NAME must be less than 60 characters, got ${MCP_TOOL_NAME.length} characters: ${MCP_TOOL_NAME}`);
  }

  if (!validateUrl(DELEGATE_BASE_URL)) {
    throw new Error(`DELEGATE_BASE_URL must be a valid HTTP/HTTPS URL: ${DELEGATE_BASE_URL}`);
  }

  if (DELEGATE_PROVIDER !== "ollama" && DELEGATE_PROVIDER !== "openai_compat") {
    throw new Error(`DELEGATE_PROVIDER must be 'ollama' or 'openai_compat', got: ${DELEGATE_PROVIDER}`);
  }

  if (!MCP_STDIO && !MCP_HTTP) {
    throw new Error("At least one transport (STDIO or HTTP) must be enabled");
  }

  if (MCP_HTTP_PORT < 1 || MCP_HTTP_PORT > 65535) {
    throw new Error(`MCP_HTTP_PORT must be between 1 and 65535, got: ${MCP_HTTP_PORT}`);
  }
}
