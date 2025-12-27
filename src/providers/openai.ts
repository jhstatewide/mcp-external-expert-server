// OpenAI-compatible provider implementation for MCP External Expert Server

import { DELEGATE_BASE_URL, DELEGATE_API_KEY, DELEGATE_OPENAI_PATH, DELEGATE_TIMEOUT_MS } from '../config/environment.js';

export async function callOpenAICompat(
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
