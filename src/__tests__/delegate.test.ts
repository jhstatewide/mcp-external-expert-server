import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { redactSecrets, clampText, delegate } from '../index.js';
import { redactSecrets as redactSecretsUtil, clampText as clampTextUtil } from '../utils/text-processing.js';

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('redactSecrets', () => {
  it('should redact API keys starting with sk-', () => {
    const input = 'My API key is sk-123456789012345678901234567890';
    const result = redactSecretsUtil(input);
    expect(result).toContain('sk-***REDACTED***');
    expect(result).not.toContain('123456789012345678901234567890');
  });

  it('should redact Bearer tokens', () => {
    const input = 'Authorization: Bearer abc123def456ghi789jkl012mno345pqr678';
    const result = redactSecretsUtil(input);
    expect(result).toContain('Bearer ***REDACTED***');
    expect(result).not.toContain('abc123def456ghi789jkl012mno345pqr678');
  });

  it('should redact api_key patterns', () => {
    const input = 'api_key: secret12345678901234567890';
    const result = redactSecretsUtil(input);
    expect(result).toContain('api_key: ***REDACTED***');
    expect(result).not.toContain('secret12345678901234567890');
  });

  it('should not redact short strings', () => {
    const input = 'sk-short';
    const result = redactSecretsUtil(input);
    expect(result).toBe(input);
  });

  it('should handle text without secrets', () => {
    const input = 'This is normal text without any secrets';
    const result = redactSecretsUtil(input);
    expect(result).toBe(input);
  });
});

describe('clampText', () => {
  it('should return text unchanged if within limit', () => {
    const text = 'Short text';
    const result = clampTextUtil(text, 100);
    expect(result).toBe(text);
  });

  it('should clamp text exceeding limit', () => {
    const text = 'a'.repeat(200);
    const result = clampTextUtil(text, 100);
    expect(result.length).toBeLessThanOrEqual(100 + 20); // 100 chars + truncation message
    expect(result).toContain('[Truncated...]');
  });

  it('should handle exact limit', () => {
    const text = 'a'.repeat(100);
    const result = clampTextUtil(text, 100);
    expect(result).toBe(text);
  });

  it('should handle empty string', () => {
    const result = clampTextUtil('', 100);
    expect(result).toBe('');
  });
});

describe('delegate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DELEGATE_MODEL = 'test-model';
    process.env.DELEGATE_PROVIDER = 'ollama';
    process.env.DELEGATE_BASE_URL = 'http://localhost:11434';
    process.env.DELEGATE_MAX_TOKENS = '800';
    process.env.DELEGATE_TEMPERATURE = '0.2';
  });

  it('should throw error if DELEGATE_MODEL is not set', async () => {
    const originalModel = process.env.DELEGATE_MODEL;
    process.env.DELEGATE_MODEL = '';
    try {
      await expect(delegate('plan', 'test input')).rejects.toThrow('DELEGATE_MODEL');
    } finally {
      if (originalModel) {
        process.env.DELEGATE_MODEL = originalModel;
      } else {
        delete process.env.DELEGATE_MODEL;
      }
    }
  });

  it('should throw error for invalid mode', async () => {
    process.env.DELEGATE_MODEL = 'test-model';
    await expect(delegate('invalid', 'test input')).rejects.toThrow('Invalid mode');
  });

  it('should call Ollama API with correct parameters', async () => {
    const mockResponse = {
      message: { content: 'Test response' }
    };
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await delegate('plan', 'test input');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(result).toBe('Test response');
  });

  it('should handle context parameter', async () => {
    const mockResponse = {
      message: { content: 'Test response' }
    };
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    await delegate('plan', 'test input', 'context info');

    const callArgs = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.messages[1].content).toContain('Context:');
    expect(body.messages[1].content).toContain('context info');
  });

  it('should respect maxTokens parameter', async () => {
    const longInput = 'a'.repeat(20000);
    const mockResponse = {
      message: { content: 'Test response' }
    };
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    await delegate('plan', longInput, undefined, 100);

    const callArgs = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);
    // With token-based approach, we check that the input was clamped appropriately
    expect(body.messages[1].content.length).toBeLessThanOrEqual(100 * 4 + 20); // 100 tokens * 4 chars + truncation
  });

  it('should handle OpenAI-compatible provider', async () => {
    process.env.DELEGATE_PROVIDER = 'openai_compat';
    process.env.DELEGATE_BASE_URL = 'http://localhost:8080';
    
    const mockResponse = {
      choices: [{ message: { content: 'OpenAI response' } }]
    };
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await delegate('challenge', 'test input');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/chat/completions'),
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(result).toBe('OpenAI response');
  });

  it('should handle API errors', async () => {
    process.env.DELEGATE_MODEL = 'test-model';
    
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Error message',
    } as Response);

    await expect(delegate('plan', 'test input')).rejects.toThrow('Ollama API error');
  });
});
