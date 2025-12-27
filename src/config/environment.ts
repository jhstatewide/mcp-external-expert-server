// Environment configuration for MCP External Expert Server

export const DELEGATE_PROVIDER = process.env.DELEGATE_PROVIDER || "ollama";
export const DELEGATE_BASE_URL = process.env.DELEGATE_BASE_URL || "http://localhost:11434";
export const DELEGATE_MODEL = process.env.DELEGATE_MODEL || "";
export const DELEGATE_API_KEY = process.env.DELEGATE_API_KEY || "";
export const DELEGATE_OPENAI_PATH = process.env.DELEGATE_OPENAI_PATH || "/v1/chat/completions";
export const DELEGATE_TIMEOUT_MS = parseInt(process.env.DELEGATE_TIMEOUT_MS || "60000", 10);
export const DELEGATE_MAX_TOKENS = parseInt(process.env.DELEGATE_MAX_TOKENS || "800", 10);
export const DELEGATE_TEMPERATURE = parseFloat(process.env.DELEGATE_TEMPERATURE || "0.2");
export const DELEGATE_EXTRACT_THINKING = process.env.DELEGATE_EXTRACT_THINKING !== "false"; // default true
