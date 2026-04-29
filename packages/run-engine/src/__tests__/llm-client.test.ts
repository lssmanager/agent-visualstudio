/**
 * llm-client.test.ts
 *
 * Unit tests for:
 *   - resolveProvider()   — maps model-id prefix → LLMProvider enum
 *   - PROVIDER_MAP        — completeness check
 *   - buildLLMClient()    — factory routing, API-key guard, compat fallback
 *   - OpenAIAdapter       — fetch path, SDK path (mocked), message serialisation
 *   - AnthropicAdapter    — message translation, tool_use → ToolCallRequest
 *   - stripProviderPrefix — utility
 */

import {
  LLMProvider,
  PROVIDER_MAP,
  resolveProvider,
  buildLLMClient,
  MissingApiKeyError,
  OpenAIAdapter,
  AnthropicAdapter,
  stripProviderPrefix,
  type ChatMessage,
  type ToolDefinition,
} from '../llm-client';

// ─── 1. PROVIDER_MAP completeness ──────────────────────────────────────────

describe('PROVIDER_MAP', () => {
  const EXPECTED_PROVIDERS: LLMProvider[] = [
    LLMProvider.OPENAI,
    LLMProvider.ANTHROPIC,
    LLMProvider.OPENROUTER,
    LLMProvider.QWEN,
    LLMProvider.DEEPSEEK,
    LLMProvider.MISTRAL,
    LLMProvider.GROQ,
  ];

  it('contains all expected provider keys', () => {
    for (const provider of EXPECTED_PROVIDERS) {
      const hasKey = Object.values(PROVIDER_MAP).includes(provider);
      expect(hasKey).toBe(true);
    }
  });

  it('does NOT include COMPAT in the map (COMPAT is a fallthrough sentinel)', () => {
    expect(Object.values(PROVIDER_MAP)).not.toContain(LLMProvider.COMPAT);
  });

  it('is case-sensitive and uses lowercase keys', () => {
    expect(PROVIDER_MAP['openai']).toBe(LLMProvider.OPENAI);
    expect(PROVIDER_MAP['OPENAI']).toBeUndefined();
  });
});

// ─── 2. resolveProvider() ───────────────────────────────────────────────

describe('resolveProvider()', () => {
  const cases: [string, LLMProvider][] = [
    ['openai/gpt-4o',                        LLMProvider.OPENAI],
    ['openai/gpt-4o-mini',                   LLMProvider.OPENAI],
    ['anthropic/claude-3-7-sonnet-20250219', LLMProvider.ANTHROPIC],
    ['anthropic/claude-3-haiku',             LLMProvider.ANTHROPIC],
    ['openrouter/auto',                      LLMProvider.OPENROUTER],
    ['qwen/qwen-plus',                       LLMProvider.QWEN],
    ['qwen/qwen-max',                        LLMProvider.QWEN],
    ['deepseek/deepseek-chat',               LLMProvider.DEEPSEEK],
    ['mistral/mistral-large-latest',         LLMProvider.MISTRAL],
    ['groq/llama-3-70b-8192',               LLMProvider.GROQ],
    // Unknown → COMPAT
    ['unknown-provider/some-model',          LLMProvider.COMPAT],
    ['x-ai/grok-2',                         LLMProvider.COMPAT],
    // No slash → COMPAT
    ['gpt-4o',                              LLMProvider.COMPAT],
  ];

  test.each(cases)('resolveProvider(%s) === %s', (modelId, expected) => {
    expect(resolveProvider(modelId)).toBe(expected);
  });

  it('is case-insensitive for the prefix segment', () => {
    // normalises to lowercase internally
    expect(resolveProvider('Openai/gpt-4o')).toBe(LLMProvider.OPENAI);
    expect(resolveProvider('ANTHROPIC/claude-3-haiku')).toBe(LLMProvider.ANTHROPIC);
  });
});

// ─── 3. stripProviderPrefix() ────────────────────────────────────────────

describe('stripProviderPrefix()', () => {
  it('strips the provider prefix from a full model id', () => {
    expect(stripProviderPrefix('openai/gpt-4o')).toBe('gpt-4o');
    expect(stripProviderPrefix('anthropic/claude-3-7-sonnet-20250219')).toBe('claude-3-7-sonnet-20250219');
    expect(stripProviderPrefix('openrouter/nousresearch/hermes-3-llama-3.1-405b'))
      .toBe('nousresearch/hermes-3-llama-3.1-405b');
  });

  it('is a no-op when there is no slash', () => {
    expect(stripProviderPrefix('gpt-4o')).toBe('gpt-4o');
  });
});

// ─── 4. buildLLMClient() — API-key guard ───────────────────────────────

describe('buildLLMClient() — API key guard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear all relevant keys
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_COMPAT_API_KEY;
    delete process.env.OPENAI_COMPAT_BASE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws MissingApiKeyError for openai/* when OPENAI_API_KEY is absent', () => {
    expect(() => buildLLMClient('openai/gpt-4o')).toThrow(MissingApiKeyError);
    expect(() => buildLLMClient('openai/gpt-4o')).toThrow('OPENAI_API_KEY');
  });

  it('throws MissingApiKeyError for anthropic/* when ANTHROPIC_API_KEY is absent', () => {
    expect(() => buildLLMClient('anthropic/claude-3-haiku')).toThrow(MissingApiKeyError);
    expect(() => buildLLMClient('anthropic/claude-3-haiku')).toThrow('ANTHROPIC_API_KEY');
  });

  it('throws MissingApiKeyError for compat providers when no compat key exists', () => {
    expect(() => buildLLMClient('qwen/qwen-plus')).toThrow(MissingApiKeyError);
    expect(() => buildLLMClient('deepseek/deepseek-chat')).toThrow(MissingApiKeyError);
  });

  it('returns OpenAIAdapter for openai/* when key is set', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const client = buildLLMClient('openai/gpt-4o');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('returns AnthropicAdapter for anthropic/* when key is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const client = buildLLMClient('anthropic/claude-3-haiku');
    expect(client).toBeInstanceOf(AnthropicAdapter);
  });

  it('returns OpenAIAdapter (compat) for qwen/* when OPENROUTER_API_KEY is set', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    const client = buildLLMClient('qwen/qwen-plus');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('returns OpenAIAdapter (compat) using OPENAI_COMPAT_API_KEY as fallback', () => {
    process.env.OPENAI_COMPAT_API_KEY  = 'sk-compat-test';
    process.env.OPENAI_COMPAT_BASE_URL = 'https://my-llm.internal/v1';
    const client = buildLLMClient('mistral/mistral-large-latest');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('MissingApiKeyError includes envVar, provider, and modelId properties', () => {
    let caught: MissingApiKeyError | undefined;
    try { buildLLMClient('openai/gpt-4o'); } catch (e) { caught = e as MissingApiKeyError; }
    expect(caught).toBeDefined();
    expect(caught!.envVar).toBe('OPENAI_API_KEY');
    expect(caught!.provider).toBe(LLMProvider.OPENAI);
    expect(caught!.modelId).toBe('openai/gpt-4o');
  });
});

// ─── 5. OpenAIAdapter._chatViaFetch() ────────────────────────────────────

describe('OpenAIAdapter._chatViaFetch()', () => {
  const MSG: ChatMessage[] = [
    { role: 'user', content: 'Hello' },
  ];
  const OPTS = { model: 'openai/gpt-4o', temperature: 0.7, maxTokens: 100 };

  it('returns LlmResponse from a successful fetch', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'World', tool_calls: [] }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
      model: 'gpt-4o',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }) as unknown as typeof fetch;

    const adapter = new OpenAIAdapter('sk-test');
    const resp    = await adapter._chatViaFetch(MSG, [], OPTS);

    expect(resp.content).toBe('World');
    expect(resp.tool_calls).toEqual([]);
    expect(resp.usage).toEqual({ input: 5, output: 3 });
    expect(resp.finishReason).toBe('stop');
  });

  it('throws on non-2xx HTTP response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    }) as unknown as typeof fetch;

    const adapter = new OpenAIAdapter('sk-test');
    await expect(adapter._chatViaFetch(MSG, [], OPTS)).rejects.toThrow('429');
  });

  it('sends the stripped model id (no provider prefix) in the request body', async () => {
    let capturedBody: Record<string, unknown> = {};
    global.fetch = jest.fn().mockImplementation((url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      });
    }) as unknown as typeof fetch;

    const adapter = new OpenAIAdapter('sk-test');
    await adapter._chatViaFetch(MSG, [], OPTS);

    // Should be 'gpt-4o', not 'openai/gpt-4o'
    expect(capturedBody.model).toBe('gpt-4o');
  });
});

// ─── 6. AnthropicAdapter — message translation ──────────────────────────

describe('AnthropicAdapter — message translation + tool_use parsing', () => {
  it('translates tool_use content blocks into ToolCallRequest[]', async () => {
    const mockResponse = {
      content: [
        { type: 'text', text: 'Calling tool…' },
        { type: 'tool_use', id: 'tc_1', name: 'search', input: { query: 'foo' } },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
      model: 'claude-3-haiku',
      stop_reason: 'tool_use',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }) as unknown as typeof fetch;

    const adapter = new AnthropicAdapter('sk-ant-test');
    const resp    = await adapter.chat(
      [{ role: 'user', content: 'Search for foo' }],
      [{ type: 'function', function: { name: 'search', description: 'Search', parameters: {} } }],
      { model: 'anthropic/claude-3-haiku', temperature: 0.5, maxTokens: 1024 },
    );

    expect(resp.tool_calls).toHaveLength(1);
    expect(resp.tool_calls[0].function.name).toBe('search');
    expect(JSON.parse(resp.tool_calls[0].function.arguments)).toEqual({ query: 'foo' });
    expect(resp.content).toBe('Calling tool…');
    expect(resp.usage).toEqual({ input: 10, output: 20 });
    expect(resp.finishReason).toBe('tool_use');
  });

  it('handles responses with no tool_use blocks (pure text)', async () => {
    const mockResponse = {
      content: [{ type: 'text', text: 'Just a reply' }],
      usage: { input_tokens: 5, output_tokens: 8 },
      model: 'claude-3-haiku',
      stop_reason: 'end_turn',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }) as unknown as typeof fetch;

    const adapter = new AnthropicAdapter('sk-ant-test');
    const resp    = await adapter.chat(
      [{ role: 'user', content: 'Hello' }],
      [],
      { model: 'anthropic/claude-3-haiku', temperature: 0.5, maxTokens: 512 },
    );

    expect(resp.content).toBe('Just a reply');
    expect(resp.tool_calls).toHaveLength(0);
  });
});
