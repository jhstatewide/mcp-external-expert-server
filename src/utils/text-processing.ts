// Text processing utilities for the MCP External Expert Server

// Redact obvious secrets from text
export function redactSecrets(text: string): string {
  // Redact API keys (sk-..., bearer tokens, etc.)
  return text
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***REDACTED***")
    .replace(/Bearer\s+[a-zA-Z0-9\-_]{20,}/gi, "Bearer ***REDACTED***")
    .replace(/api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9\-_]{20,}['"]?/gi, "api_key: ***REDACTED***");
}

// Clamp text to maxChars
export function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + "\n\n[Truncated...]";
}

// Extract thinking tags from response
export function extractThinking(text: string): { thinking: string | null; content: string } {
  // Match <think>...</think> tags (case-insensitive, allowing whitespace)
  const thinkPattern = /<think>([\s\S]*?)<\/think>/i;
  const match = text.match(thinkPattern);
  
  if (match) {
    const thinking = match[1].trim();
    const content = text.replace(thinkPattern, '').trim();
    return { thinking, content };
  }
  
  return { thinking: null, content: text };
}
