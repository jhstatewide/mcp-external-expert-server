// Core delegate function for MCP External Expert Server

import { redactSecrets, clampText, extractThinking } from "../utils/text-processing.js";
import { callOllama, callOpenAICompat } from "../providers/index.js";
import {
  DELEGATE_PROVIDER,
  DELEGATE_MODEL,
  DELEGATE_MAX_TOKENS,
  DELEGATE_TEMPERATURE,
  DELEGATE_EXTRACT_THINKING,
  DELEGATE_MAX_INPUT_CHARS,
  SYSTEM_PROMPTS
} from "../config/index.js";

export async function delegate(
  mode: string,
  input: string,
  context?: string,
  maxTokens?: number
): Promise<string> {
  const maxTokensToUse = maxTokens
    ? Math.max(1, Math.min(100000, maxTokens))
    : DELEGATE_MAX_TOKENS;

  // Use separate input size limit (not tied to output tokens) for large code reviews
  const inputCharLimit = DELEGATE_MAX_INPUT_CHARS;

  // Read from process.env directly to support dynamic changes in tests
  // Check if the property exists in process.env (even if empty), otherwise use constant
  const delegateModel = ('DELEGATE_MODEL' in process.env)
    ? process.env.DELEGATE_MODEL
    : DELEGATE_MODEL;

  if (!delegateModel || delegateModel.trim() === "") {
    throw new Error("DELEGATE_MODEL environment variable is required");
  }

  const validModes = ["plan", "review", "challenge", "explain", "tests"] as const;
  if (!validModes.includes(mode as typeof validModes[number])) {
    throw new Error(`Invalid mode: ${mode}. Must be one of: ${validModes.join(", ")}`);
  }

  if (!input || typeof input !== "string" || input.trim() === "") {
    throw new Error("Input must be a non-empty string");
  }

  const systemPrompt = SYSTEM_PROMPTS[mode as keyof typeof SYSTEM_PROMPTS];

  let userMessage = input;
  if (context) {
    userMessage = `Context:\n${context}\n\nTask:\n${input}`;
  }

  // Remind helper model it has no access to caller's context
  const isolationReminder = `[IMPORTANT: You are being called as a helper model. You have NO access to the calling model's context, files, or conversation history. You ONLY have the information provided below. Do not reference or assume knowledge of anything not explicitly stated here.]\n\n`;
  userMessage = isolationReminder + userMessage;

  // Clamp input to configured limit (allows large code files for review)
  userMessage = clampText(userMessage, inputCharLimit);
  userMessage = redactSecrets(userMessage);

  // Read from process.env to support dynamic changes in tests
  const delegateProvider = process.env.DELEGATE_PROVIDER || DELEGATE_PROVIDER;
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

  if (DELEGATE_EXTRACT_THINKING) {
    const { thinking, content } = extractThinking(result);
    if (thinking) {
      // Don't clamp content - API already respects max_tokens
      return JSON.stringify({ thinking, content });
    }
  }

  // Don't clamp result - API already respects max_tokens
  return result;
}
