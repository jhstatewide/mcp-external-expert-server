# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2024-XX-XX

### Added
- Initial public release
- Support for Ollama and OpenAI-compatible providers
- Multiple delegation modes: plan, review, challenge, tests, explain
- STDIO and HTTP transport modes
- SSE (Server-Sent Events) streaming support
- Secret redaction in logs
- Configurable system prompts per mode
- Comprehensive test suite

### Features
- Delegates sub-tasks to external expert models
- Avoids KV cache eviction on primary inference host
- Supports both desktop (STDIO) and remote (HTTP) usage
- CORS enabled for web-based clients
