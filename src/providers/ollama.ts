// Ollama provider implementation for MCP External Expert Server

import { DELEGATE_BASE_URL, DELEGATE_TIMEOUT_MS } from '../config/index.js';

export async function callOllama(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const url = `${DELEGATE_BASE_URL}/api/chat`;

  // Use maxTokens directly for consistent token-based limiting
  const numPredict = maxTokens;

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
