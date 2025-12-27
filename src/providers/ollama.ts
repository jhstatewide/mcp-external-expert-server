// Ollama provider implementation for MCP External Expert Server

import { DELEGATE_BASE_URL, DELEGATE_TIMEOUT_MS } from '../config/index.js';

export async function callOllama(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const baseUrl = DELEGATE_BASE_URL.replace(/\/$/, '');
  const url = `${baseUrl}/api/chat`;
  const numPredict = maxTokens;

  try {
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
      const errorText = await response.text().catch(() => "Unable to read error response");
      throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.message?.content || data.response || "";
    
    if (!content) {
      throw new Error("Ollama API returned empty response");
    }
    
    return content;
  } catch (error) {
    if (error instanceof Error) {
      // Handle timeout and network errors
      if (error.name === "TimeoutError" || error.message.includes("timeout")) {
        throw new Error(`Ollama API request timed out after ${DELEGATE_TIMEOUT_MS}ms`);
      }
      if (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED")) {
        throw new Error(`Failed to connect to Ollama at ${url}. Is the server running?`);
      }
      // Re-throw if it's already our formatted error
      if (error.message.includes("Ollama API error")) {
        throw error;
      }
    }
    throw new Error(`Ollama API request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
