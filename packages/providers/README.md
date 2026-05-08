# @agent-vs/providers

LLM provider abstraction layer for agent-visualstudio.

## Supported Providers

- `OpenAIProvider` — OpenAI API (GPT-4o, GPT-4.1, o3)
- `AnthropicProvider` — Anthropic API (Claude 3.5, Claude 4)
- `GeminiProvider` — Google Generative AI (Gemini 2.5)
- `OpenRouterProvider` — OpenRouter (all models)
- `GroqProvider` — Groq API (Llama 3, Mixtral)
- `OllamaProvider` — Ollama local server
- `DeepSeekProvider` — DeepSeek API
- `MistralProvider` — Mistral API

## Usage

```typescript
import { ProviderFactory } from '@agent-vs/providers';

const provider = ProviderFactory.create({
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const response = await provider.complete({
  messages: [...],
  maxTokens: 4096,
});
```

## Fallback Chain

```typescript
import { FallbackChainProvider } from '@agent-vs/providers';

const provider = new FallbackChainProvider([
  { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  { provider: 'openai', model: 'gpt-4o' },
  { provider: 'openrouter', model: 'anthropic/claude-3-haiku' },
]);
```
