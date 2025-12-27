// Core delegate function for MCP External Expert Server

import { redactSecrets, clampText, extractThinking } from "../utils/text-processing.js";
import { callOllama, callOpenAICompat } from "../providers/index.js";
import {
  DELEGATE_PROVIDER,
  DELEGATE_MODEL,
  DELEGATE_MAX_TOKENS,
  DELEGATE_TEMPERATURE,
  DELEGATE_EXTRACT_THINKING,
  SYSTEM_PROMPTS
} from "../config/index.js";

// Main delegate function - now using tokens ONLY, no character-based limits
export async function delegate(
  mode: string,
  input: string,
  context?: string,
  maxTokens?: number
): Promise<string> {
  // Use provided maxTokens or fall back to configured default
  const maxTokensToUse = maxTokens || DELEGATE_MAX_TOKENS;
  
  // For backwards compatibility with existing text clamping, we'll use a reasonable character limit
  // that should be safe for most token limits. This is a conservative estimate.
  // Note: This is only for input/output clamping, not for token estimation.
  const safeCharLimit = maxTokensToUse * 4; // Conservative: 1 token ≈ 4 chars for English
  
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
  
  // Clamp input size using safe character limit derived from token limit
  userMessage = clampText(userMessage, safeCharLimit);
  
  // Redact secrets
  userMessage = redactSecrets(userMessage);
  
  // Read provider from process.env directly to support dynamic changes in tests
  const delegateProvider = process.env.DELEGATE_PROVIDER || DELEGATE_PROVIDER;
  
  // Call appropriate provider - now using tokens ONLY, no maxChars parameter
  let result: string;
  if (delegateProvider === "ollama") {
    result = await callOllama(
      delegateModel,
      systemPrompt,
      userMessage,
      maxTokensToUse,
      DELEGATE_TEMPERATURE
    );
  } else if (delegateProvider === "openai_compat") {
    result = await callOpenAICompat(
      delegateModel,
      systemPrompt,
      userMessage,
      maxTokensToUse,
      DELEGATE_TEMPERATURE
    );
  } else {
    throw new Error(`Unknown provider: ${delegateProvider}. Must be 'ollama' or 'openai_compat'`);
  }
  
  // Extract thinking if enabled
  if (DELEGATE_EXTRACT_THINKING) {
    const { thinking, content } = extractThinking(result);
    if (thinking) {
      // Return thinking separately - will be handled in the response
      return JSON.stringify({ thinking, content: clampText(content, safeCharLimit) });
    }
  }
  
  // Clamp result using safe character limit
  return clampText(result, safeCharLimit);
}
