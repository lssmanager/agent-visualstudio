# Providers Overview

## Architecture

Agent VisualStudio supports 50+ LLM providers organized in 7 tiers. Providers are registered in **Settings** before they can be used at any hierarchy level.

## Model Resolution

For each run, the system resolves the effective model by traversing:
```
Agent → Workspace → Department → Agency → global default
```
The most specific assignment wins.

## Fallback Chain

Each level can define a fallback chain — an ordered list of models to try on failure. Fallback triggers only on:
- `429 Too Many Requests`
- Quota exhaustion
- Throttling
- `resource_exhausted`

## Provider Tiers

| Tier | Category | Examples |
|------|----------|----------|
| 1 | Primary Cloud | OpenAI, Anthropic, Google Gemini, Amazon Bedrock, NVIDIA |
| 2 | Fast Inference & Routing | Groq, Cerebras, Fireworks, Together, Mistral, DeepSeek, xAI, Perplexity, OpenRouter |
| 3 | Gateways & Proxies | LiteLLM, Cloudflare AI Gateway, Vercel AI Gateway |
| 4 | Asian Cloud | Moonshot, MiniMax, GLM, Qwen, Qianfan, Volcengine, Tencent |
| 5 | Specialized & Niche | Venice, Arcee, HuggingFace, GitHub Copilot |
| 6 | Local Inference | Ollama, LM Studio, vLLM, SGLang |
| 7 | Coding & Media Specialists | ElevenLabs, Runway, fal, ComfyUI, OpenCode |

## Auth Profile Types

| Type | Description |
|------|-------------|
| `api_key` | Static API key stored as SecretRef |
| `oauth` | OAuth 2.0 flow (GitHub Copilot, Azure) |
| `aws_sdk` | IAM role or access key + secret (Bedrock) |
| `cli_backend` | Local CLI tool as backend (Anthropic Claude CLI, Ollama) |

## SecretRef

Secrets are never stored in plaintext. The `SecretRef` pattern supports:
- `env:VAR_NAME` — read from environment variable
- `file:/path/to/secret` — read from file
- `exec:command` — execute command and use stdout
