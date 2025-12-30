// OpenAI-compatible provider implementation for MCP External Expert Server

import { DELEGATE_BASE_URL, DELEGATE_API_KEY, DELEGATE_OPENAI_PATH, DELEGATE_TIMEOUT_MS } from '../config/index.js';

export async function callOpenAICompat(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  // Normalize base URL: remove trailing slash
  let baseUrl = DELEGATE_BASE_URL.replace(/\/$/, '');
  
  // Normalize path: ensure it starts with /
  let path = DELEGATE_OPENAI_PATH.startsWith('/') ? DELEGATE_OPENAI_PATH : `/${DELEGATE_OPENAI_PATH}`;
  
  // If base URL already ends with /v1, and path starts with /v1, remove the duplicate
  // This handles cases where users set DELEGATE_BASE_URL to include /v1/
  if (baseUrl.endsWith('/v1') && path.startsWith('/v1/')) {
    path = path.substring(3); // Remove '/v1' prefix from path
  }
  
  const url = `${baseUrl}${path}`;

  if (process.env.DEBUG === 'true') {
    console.error(`[OpenAI Compat] Request URL: ${url}`);
    console.error(`[OpenAI Compat] Model: ${model}, Max tokens: ${maxTokens}, Timeout: ${DELEGATE_TIMEOUT_MS}ms`);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (DELEGATE_API_KEY) {
    headers["Authorization"] = `Bearer ${DELEGATE_API_KEY}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        max_tokens: maxTokens,
        temperature,
        stream: false
      }),
      signal: AbortSignal.timeout(DELEGATE_TIMEOUT_MS)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unable to read error response");
      throw new Error(`OpenAI-compatible API error (${url}): ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    if (!content && data.choices?.[0]?.finish_reason === "length") {
      throw new Error("Response was truncated due to max_tokens limit");
    }
    
    if (!content) {
      throw new Error("OpenAI-compatible API returned empty response");
    }
    
    return content;
  } catch (error) {
    if (error instanceof Error) {
      // Handle timeout and network errors
      if (error.name === "TimeoutError" || error.message.includes("timeout")) {
        throw new Error(`OpenAI-compatible API request timed out after ${DELEGATE_TIMEOUT_MS}ms`);
      }
      if (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED") || error.message.includes("ENOTFOUND")) {
        throw new Error(`Failed to connect to OpenAI-compatible API at ${url}. Is the server running and accessible? Check DELEGATE_BASE_URL and network connectivity.`);
      }
      // Re-throw if it's already our formatted error
      if (error.message.includes("OpenAI-compatible API error") || error.message.includes("truncated")) {
        throw error;
      }
    }
    throw new Error(`OpenAI-compatible API request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
