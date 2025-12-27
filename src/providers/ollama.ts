// Ollama provider implementation for MCP External Expert Server

import { DELEGATE_BASE_URL, DELEGATE_TIMEOUT_MS } from '../config/environment.js';
import { clampText } from '../utils/text-processing.js';

export async function callOllama(
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
