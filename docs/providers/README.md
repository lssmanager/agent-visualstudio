# LLM Providers Documentation

## Supported Providers

| Provider | Models | Auth |
|----------|--------|------|
| OpenAI | GPT-4o, GPT-4.1, o3 | API Key |
| Anthropic | Claude 3.5, Claude 4 | API Key |
| Google Gemini | Gemini 2.5 Pro/Flash | API Key |
| OpenRouter | All models | API Key |
| Groq | Llama 3.3, Mixtral | API Key |
| Ollama | Any local model | Local URL |
| DeepSeek | DeepSeek V3/R2 | API Key |
| Mistral | Mistral Large | API Key |

## Provider Abstraction

All providers implement the `ILLMProvider` interface:

```typescript
interface ILLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<CompletionChunk>;
  getTokenCount(text: string): number;
  isHealthy(): Promise<boolean>;
}
```

## Fallback Chains

Each model config can define an ordered fallback chain:

```yaml
model_config:
  primary:
    provider: anthropic
    model: claude-sonnet-4
  fallback:
    - provider: openai
      model: gpt-4o
    - provider: openrouter
      model: anthropic/claude-3-haiku
```

## Budget Enforcement

All LLM calls go through the Budget Engine which checks:
- Per-run token budget
- Per-agent daily token budget
- Per-workspace cost budget
- Per-agency monthly cost budget
