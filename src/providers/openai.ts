// OpenAI-compatible provider implementation for MCP External Expert Server

import { DELEGATE_BASE_URL, DELEGATE_API_KEY, DELEGATE_OPENAI_PATH, DELEGATE_TIMEOUT_MS } from '../config/environment.js';

export async function callOpenAICompat(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const url = `${DELEGATE_BASE_URL}${DELEGATE_OPENAI_PATH}`;
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (DELEGATE_API_KEY) {
    headers["Authorization"] = `Bearer ${DELEGATE_API_KEY}`;
  }
  
  // Use maxTokens directly for consistent token-based limiting
  const maxTokensToUse = maxTokens;
  
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
