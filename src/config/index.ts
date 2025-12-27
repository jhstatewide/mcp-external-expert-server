// Configuration module for MCP External Expert Server
// Centralizes environment variables and constants

import { config } from "dotenv";

// Load environment variables from .env file (if it exists)
config();

// Configuration from environment variables
export const DELEGATE_PROVIDER = process.env.DELEGATE_PROVIDER || "ollama";
export const DELEGATE_BASE_URL = process.env.DELEGATE_BASE_URL || "http://localhost:11434";
export const DELEGATE_MODEL = process.env.DELEGATE_MODEL || "";
export const DELEGATE_API_KEY = process.env.DELEGATE_API_KEY || "";
export const DELEGATE_OPENAI_PATH = process.env.DELEGATE_OPENAI_PATH || "/v1/chat/completions";
export const DELEGATE_TIMEOUT_MS = parseInt(process.env.DELEGATE_TIMEOUT_MS || "60000", 10);
export const DELEGATE_MAX_TOKENS = parseInt(process.env.DELEGATE_MAX_TOKENS || "800", 10);
export const DELEGATE_TEMPERATURE = parseFloat(process.env.DELEGATE_TEMPERATURE || "0.2");
export const DELEGATE_EXTRACT_THINKING = process.env.DELEGATE_EXTRACT_THINKING !== "false"; // default true

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
export const MCP_HTTP_PORT = parseInt(process.env.MCP_HTTP_PORT || "3333", 10);
export const MCP_STDIO = process.env.MCP_STDIO !== "false"; // default true

// Validate required configuration
export function validateConfiguration() {
  if (!DELEGATE_MODEL || DELEGATE_MODEL.trim() === "") {
    throw new Error("DELEGATE_MODEL environment variable is required");
  }
  
  if (!MCP_STDIO && !MCP_HTTP) {
    throw new Error("At least one transport (STDIO or HTTP) must be enabled");
  }
}
