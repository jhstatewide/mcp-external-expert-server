# MCP Delegate Server

An MCP (Model Context Protocol) server that allows a primary coding model to delegate sub-tasks to a secondary "helper" model.

## Purpose

This server enables:
- Fast primary coding models (e.g., Qwen3 Coder) to delegate planning, critique, testing, and explanation tasks
- Avoids unloading/cache loss on the primary `llama-server`
- Supports routing to Ollama or OpenAI-compatible endpoints
- Configurable via environment variables
- Supports both STDIO (for desktop tools) and HTTP (for remote/shared usage)

## Installation

```bash
npm install
```

## Configuration

The server can be configured via environment variables, either:
- **Environment variables** (set in your shell or system)
- **`.env` file** (recommended for local development - automatically loaded)

### Using .env File (Recommended)

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your settings:
   ```bash
   DELEGATE_PROVIDER=ollama
   DELEGATE_BASE_URL=http://localhost:11434
   DELEGATE_MODEL=qwen2.5:14b-instruct
   DELEGATE_API_KEY=your-api-key-here
   ```

The `.env` file is gitignored and will not be committed to version control.

### Environment Variables

### Provider Selection

```bash
# In .env file or as environment variables:
DELEGATE_PROVIDER=ollama | openai_compat
DELEGATE_BASE_URL=http://host:port
DELEGATE_MODEL=model-name
```

### OpenAI-compatible Only

```bash
# In .env file or as environment variables:
DELEGATE_API_KEY=sk-...
DELEGATE_OPENAI_PATH=/v1/chat/completions
```

### Behavior

```bash
# Timeout for API calls in milliseconds (default: 60000 = 60 seconds)
# Increase this if your Ollama server is slow (e.g., 300000 for 5 minutes)
DELEGATE_TIMEOUT_MS=60000
DELEGATE_MAX_TOKENS=800
DELEGATE_TEMPERATURE=0.2
```

### Optional Per-Mode System Prompts

```bash
DELEGATE_SYSTEM_PLAN="..."
DELEGATE_SYSTEM_CRITIC="..."
DELEGATE_SYSTEM_TESTS="..."
DELEGATE_SYSTEM_EXPLAIN="..."
```

### MCP Transport Toggles

```bash
MCP_HTTP=true
MCP_HTTP_PORT=3333
MCP_STDIO=true   # default
```

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Example Runs

### Using .env File (Recommended)

1. Create `.env` file with your configuration:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

2. Run the server:
   ```bash
   npm start
   ```

### Using Environment Variables

#### Ollama Helper (Remote Box)

```bash
DELEGATE_PROVIDER=ollama \
DELEGATE_BASE_URL=http://ollama-box:11434 \
DELEGATE_MODEL=qwen2.5:14b-instruct \
npm start
```

#### llama-server OpenAI API

```bash
DELEGATE_PROVIDER=openai_compat \
DELEGATE_BASE_URL=http://localhost:8080 \
DELEGATE_MODEL=qwen3-coder \
DELEGATE_API_KEY="" \
npm start
```

#### Enable HTTP MCP

```bash
MCP_HTTP=true MCP_HTTP_PORT=3333 npm start
```

**Note:** Environment variables set on the command line will override values in `.env` files.

## Exposed MCP Tool

### Tool: `delegate`

Delegates a subtask to a helper model.

**Input Schema:**
```json
{
  "mode": "plan | critic | explain | tests",
  "input": "string (required)",
  "context": "string (optional)",
  "maxChars": "number (optional, default 12000)"
}
```

**Modes:**
- `plan` → step-by-step plan + assumptions + risks
- `critic` → issues, severity, fixes
- `tests` → test checklist + edge cases
- `explain` → concise explanation

## Supported Providers

### 1. Ollama (Recommended)

- Keeps a helper model warm on a separate machine
- No auth complexity
- No impact on primary llama.cpp cache

Uses: `POST /api/chat`

### 2. OpenAI-compatible Endpoints

Works with:
- OpenAI
- llama-server (`--api`)
- LiteLLM
- vLLM OpenAI shims

Uses: `POST /v1/chat/completions`

## Transport Modes

### STDIO (Default)

Used by:
- Cursor
- Goose Desktop
- Claude Desktop
- Other MCP desktop tools

JSON-RPC over stdin/stdout.

### HTTP MCP (Optional)

- Long-running server
- Shared across machines
- Keeps helper model hot
- Supports both regular HTTP POST and SSE (Server-Sent Events) streaming
- CORS enabled for web-based clients (MCP Inspector, etc.)

Endpoints:
- `POST /mcp` - Main MCP endpoint (JSON-RPC)
- `GET/POST /sse` - SSE streaming endpoint
- `GET/POST /mcp` - Also supports SSE streaming

This is **MCP over HTTP** using the Streamable HTTP transport specification, which supports:
- Regular HTTP POST requests (JSON-RPC)
- SSE (Server-Sent Events) for streaming responses
- CORS headers for browser-based clients
- Compatible with MCP Inspector, Goose Desktop, Cursor, and other MCP clients

## Security Notes

- HTTP mode should be LAN-only or behind auth
- Delegated prompts may contain sensitive code
- STDIO mode is safest by default
- Secrets in input are automatically redacted

## Design Notes

- The helper model **must not** call tools recursively
- The helper model output is returned as plain text
- The main model decides *when* to delegate
- Delegation should be used sparingly (planning, critique, validation)
- This avoids KV cache eviction on the primary inference host
