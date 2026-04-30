/**
 * llm-client.test.ts
 *
 * Unit tests for the refactored llm-client (PR: consolidate provider config).
 *
 * Covers:
 *   - PROVIDER_CONFIG_MAP: structure, adapter types, env var assignments
 *   - resolveProviderConfig(): known prefixes, unknown → COMPAT, aliases (z.ai, z-ai),
 *     case insensitivity, no-slash model ids
 *   - resolveProvider(): backward-compat alias
 *   - buildLLMClient(): routing (Anthropic vs OpenAI), API-key guard, local providers
 *   - MissingApiKeyError: message format, name, constructor args
 *   - OpenAIAdapter._chatViaFetch(): happy path, error path, model prefix stripping,
 *     tools omitted when empty, custom baseURL, defaultHeaders
 *   - OpenAIAdapter._chatViaSDK(): happy path, model prefix stripping
 *   - AnthropicAdapter.chat(): text-only response, tool_use blocks, system message,
 *     baseURL override (kimi/synthetic), tool result messages
 */

import {
  LLMProvider,
  PROVIDER_CONFIG_MAP,
  resolveProviderConfig,
  resolveProvider,
  buildLLMClient,
  MissingApiKeyError,
  OpenAIAdapter,
  AnthropicAdapter,
  type ChatMessage,
  type ToolDefinition,
  type ChatOptions,
  type ProviderConfig,
} from '../llm-client';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OPTS: ChatOptions = { model: 'openai/gpt-4o', temperature: 0.7, maxTokens: 100 };

const MSG: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

function mockFetchOk(body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

function mockFetchError(status: number, text = 'error') {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(text),
  }) as unknown as typeof fetch;
}

// ─── 1. PROVIDER_CONFIG_MAP structure ────────────────────────────────────────

describe('PROVIDER_CONFIG_MAP', () => {
  it('has an entry for every known provider prefix', () => {
    const expectedPrefixes = [
      'openai', 'anthropic', 'google', 'xai', 'deepseek', 'qwen', 'mistral',
      'groq', 'together', 'cerebras', 'nvidia', 'ollama', 'lmstudio', 'vllm',
      'sglang', 'openrouter', 'kimi', 'synthetic', 'litellm', 'kilocode',
    ];
    for (const prefix of expectedPrefixes) {
      expect(PROVIDER_CONFIG_MAP[prefix]).toBeDefined();
    }
  });

  it('all entries have a provider enum value and adapter type', () => {
    for (const [key, config] of Object.entries(PROVIDER_CONFIG_MAP)) {
      expect(config.provider).toBeDefined();
      expect(['openai', 'anthropic', 'local']).toContain(config.adapter);
    }
  });

  it('kimi entry uses anthropic adapter with custom baseURL', () => {
    const config = PROVIDER_CONFIG_MAP['kimi'];
    expect(config).toBeDefined();
    expect(config.adapter).toBe('anthropic');
    expect(config.baseURL).toContain('moonshot');
    expect(config.apiKeyEnv).toBe('KIMI_API_KEY');
  });

  it('synthetic entry uses anthropic adapter', () => {
    const config = PROVIDER_CONFIG_MAP['synthetic'];
    expect(config).toBeDefined();
    expect(config.adapter).toBe('anthropic');
    expect(config.provider).toBe(LLMProvider.SYNTHETIC);
  });

  it('ollama entry is a local adapter with no apiKeyEnv', () => {
    const config = PROVIDER_CONFIG_MAP['ollama'];
    expect(config.adapter).toBe('local');
    expect(config.apiKeyEnv).toBeUndefined();
  });

  it('lmstudio entry is a local adapter with optional LM_API_TOKEN', () => {
    const config = PROVIDER_CONFIG_MAP['lmstudio'];
    expect(config.adapter).toBe('local');
    expect(config.apiKeyEnv).toBe('LM_API_TOKEN');
  });

  it('openai-codex uses OPENAI_API_KEY', () => {
    const config = PROVIDER_CONFIG_MAP['openai-codex'];
    expect(config.provider).toBe(LLMProvider.OPENAI_CODEX);
    expect(config.apiKeyEnv).toBe('OPENAI_API_KEY');
    expect(config.adapter).toBe('openai');
  });

  it('google has GEMINI_API_KEY primary + GOOGLE_API_KEY alt', () => {
    const config = PROVIDER_CONFIG_MAP['google'];
    expect(config.apiKeyEnv).toBe('GEMINI_API_KEY');
    expect(config.apiKeyEnvAlt).toContain('GOOGLE_API_KEY');
  });

  it('zai, z.ai, z-ai are all aliases for ZAI provider', () => {
    expect(PROVIDER_CONFIG_MAP['zai'].provider).toBe(LLMProvider.ZAI);
    expect(PROVIDER_CONFIG_MAP['z.ai'].provider).toBe(LLMProvider.ZAI);
    expect(PROVIDER_CONFIG_MAP['z-ai'].provider).toBe(LLMProvider.ZAI);
  });

  it('github-copilot has multiple key fallbacks (GH_TOKEN, GITHUB_TOKEN)', () => {
    const config = PROVIDER_CONFIG_MAP['github-copilot'];
    expect(config.apiKeyEnv).toBe('COPILOT_GITHUB_TOKEN');
    expect(config.apiKeyEnvAlt).toContain('GH_TOKEN');
    expect(config.apiKeyEnvAlt).toContain('GITHUB_TOKEN');
  });
});

// ─── 2. resolveProviderConfig() ──────────────────────────────────────────────

describe('resolveProviderConfig()', () => {
  const cases: Array<[string, LLMProvider]> = [
    ['openai/gpt-4o',                LLMProvider.OPENAI],
    ['anthropic/claude-3-haiku',     LLMProvider.ANTHROPIC],
    ['google/gemini-2.5-pro',        LLMProvider.GOOGLE],
    ['deepseek/deepseek-v3',         LLMProvider.DEEPSEEK],
    ['kimi/kimi-k2',                 LLMProvider.KIMI],
    ['ollama/llama3.3',              LLMProvider.OLLAMA],
    ['openrouter/auto',              LLMProvider.OPENROUTER],
    ['z.ai/glm-5.1',                LLMProvider.ZAI],
    ['z-ai/glm-5',                   LLMProvider.ZAI],
    ['zai/some-model',               LLMProvider.ZAI],
    // Unknown prefix → COMPAT
    ['unknown-provider/model',       LLMProvider.COMPAT],
    ['my-custom/model',              LLMProvider.COMPAT],
  ];

  test.each(cases)('resolveProviderConfig(%s).provider === %s', (modelId, expected) => {
    expect(resolveProviderConfig(modelId).provider).toBe(expected);
  });

  it('is case-insensitive for the prefix', () => {
    expect(resolveProviderConfig('OpenAI/gpt-4o').provider).toBe(LLMProvider.OPENAI);
    expect(resolveProviderConfig('ANTHROPIC/claude').provider).toBe(LLMProvider.ANTHROPIC);
    expect(resolveProviderConfig('GROQ/llama').provider).toBe(LLMProvider.GROQ);
  });

  it('returns COMPAT for a model id with no slash', () => {
    const config = resolveProviderConfig('gpt-4o');
    expect(config.provider).toBe(LLMProvider.COMPAT);
    expect(config.adapter).toBe('openai');
  });

  it('returns a config with adapter="openai" for COMPAT fallback', () => {
    const config = resolveProviderConfig('totally-unknown/model');
    expect(config.adapter).toBe('openai');
  });

  it('correctly resolves lmstudio as local adapter', () => {
    const config = resolveProviderConfig('lmstudio/my-model');
    expect(config.adapter).toBe('local');
    expect(config.provider).toBe(LLMProvider.LMSTUDIO);
  });

  it('handles z.ai alias (dots in prefix)', () => {
    const config = resolveProviderConfig('z.ai/glm-5.1');
    expect(config.provider).toBe(LLMProvider.ZAI);
  });
});

// ─── 3. resolveProvider() — backward-compat alias ────────────────────────────

describe('resolveProvider()', () => {
  it('returns the same value as resolveProviderConfig().provider', () => {
    const modelIds = ['openai/gpt-4o', 'anthropic/claude', 'ollama/llama3', 'unknown/model'];
    for (const modelId of modelIds) {
      expect(resolveProvider(modelId)).toBe(resolveProviderConfig(modelId).provider);
    }
  });

  it('returns COMPAT for unknown prefixes', () => {
    expect(resolveProvider('my-weird-provider/model')).toBe(LLMProvider.COMPAT);
  });
});

// ─── 4. MissingApiKeyError ────────────────────────────────────────────────────

describe('MissingApiKeyError', () => {
  it('has name MissingApiKeyError', () => {
    const err = new MissingApiKeyError(LLMProvider.OPENAI, ['OPENAI_API_KEY']);
    expect(err.name).toBe('MissingApiKeyError');
  });

  it('message includes the provider name and env var names', () => {
    const err = new MissingApiKeyError(LLMProvider.GROQ, ['GROQ_API_KEY']);
    expect(err.message).toContain('groq');
    expect(err.message).toContain('GROQ_API_KEY');
  });

  it('message mentions OPENROUTER_API_KEY as universal fallback', () => {
    const err = new MissingApiKeyError(LLMProvider.DEEPSEEK, ['DEEPSEEK_API_KEY']);
    expect(err.message).toContain('OPENROUTER_API_KEY');
  });

  it('is an instance of Error', () => {
    const err = new MissingApiKeyError(LLMProvider.OPENAI, ['OPENAI_API_KEY']);
    expect(err).toBeInstanceOf(Error);
  });

  it('includes all tried env vars in the message', () => {
    const err = new MissingApiKeyError(LLMProvider.QWEN, ['QWEN_API_KEY', 'MODELSTUDIO_API_KEY', 'DASHSCOPE_API_KEY']);
    expect(err.message).toContain('QWEN_API_KEY');
    expect(err.message).toContain('MODELSTUDIO_API_KEY');
    expect(err.message).toContain('DASHSCOPE_API_KEY');
  });
});

// ─── 5. buildLLMClient() — API key guard and adapter routing ─────────────────

describe('buildLLMClient() — API key guard and routing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_COMPAT_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws MissingApiKeyError for openai/* when OPENAI_API_KEY absent', () => {
    expect(() => buildLLMClient('openai/gpt-4o')).toThrow(MissingApiKeyError);
  });

  it('throws MissingApiKeyError for anthropic/* when ANTHROPIC_API_KEY absent', () => {
    expect(() => buildLLMClient('anthropic/claude-3-haiku')).toThrow(MissingApiKeyError);
  });

  it('throws MissingApiKeyError for deepseek/* when no key available', () => {
    expect(() => buildLLMClient('deepseek/deepseek-v3')).toThrow(MissingApiKeyError);
  });

  it('returns OpenAIAdapter for openai/* when key is set', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    const client = buildLLMClient('openai/gpt-4o');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('returns AnthropicAdapter for anthropic/* when key is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const client = buildLLMClient('anthropic/claude-3-haiku');
    expect(client).toBeInstanceOf(AnthropicAdapter);
  });

  it('returns AnthropicAdapter for kimi/* (anthropic-compat)', () => {
    process.env.KIMI_API_KEY = 'sk-kimi-test';
    const client = buildLLMClient('kimi/kimi-k2');
    expect(client).toBeInstanceOf(AnthropicAdapter);
  });

  it('returns AnthropicAdapter for synthetic/* (anthropic-compat)', () => {
    process.env.SYNTHETIC_API_KEY = 'sk-synthetic-test';
    const client = buildLLMClient('synthetic/model');
    expect(client).toBeInstanceOf(AnthropicAdapter);
  });

  it('returns OpenAIAdapter for ollama/* without any API key (local adapter)', () => {
    // No env vars set — local adapters don't require a key
    const client = buildLLMClient('ollama/llama3.3');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('returns OpenAIAdapter for lmstudio/* without any API key', () => {
    const client = buildLLMClient('lmstudio/local-model');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('returns OpenAIAdapter for vllm/* without any API key', () => {
    const client = buildLLMClient('vllm/my-model');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('returns OpenAIAdapter for sglang/* without any API key', () => {
    const client = buildLLMClient('sglang/llama');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('uses OPENROUTER_API_KEY as universal fallback for any non-local provider', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    // deepseek without its own key → falls back to OPENROUTER_API_KEY
    const client = buildLLMClient('deepseek/deepseek-v3');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('uses OPENAI_COMPAT_API_KEY as last-resort fallback', () => {
    process.env.OPENAI_COMPAT_API_KEY = 'sk-compat-test';
    const client = buildLLMClient('groq/llama3-70b');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('does NOT require opts argument (removed LLMClientOptions)', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    // buildLLMClient now takes only one argument
    expect(() => buildLLMClient('openai/gpt-4o')).not.toThrow();
  });

  it('returns OpenAIAdapter for openai-codex/ (uses OPENAI_API_KEY)', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const client = buildLLMClient('openai-codex/gpt-5');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('returns OpenAIAdapter for google/* with GEMINI_API_KEY', () => {
    process.env.GEMINI_API_KEY = 'AIzaSyTest';
    const client = buildLLMClient('google/gemini-2.5-pro');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('returns OpenAIAdapter for google/* with GOOGLE_API_KEY (alternative)', () => {
    process.env.GOOGLE_API_KEY = 'AIzaSyTest-alt';
    const client = buildLLMClient('google/gemini-2.5-pro');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });

  it('returns OpenAIAdapter for unknown prefix using OPENROUTER fallback', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    const client = buildLLMClient('my-new-provider/some-model');
    expect(client).toBeInstanceOf(OpenAIAdapter);
  });
});

// ─── 6. OpenAIAdapter._chatViaFetch() ────────────────────────────────────────

describe('OpenAIAdapter._chatViaFetch()', () => {
  const FETCH_OPTS: ChatOptions = { model: 'openai/gpt-4o', temperature: 0.7, maxTokens: 100 };

  it('returns LlmResponse on success', async () => {
    mockFetchOk({
      choices: [{ message: { content: 'Hello world', tool_calls: [] }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      model: 'gpt-4o',
    });

    const adapter = new OpenAIAdapter('sk-test');
    const resp = await adapter._chatViaFetch(MSG, [], FETCH_OPTS);

    expect(resp.content).toBe('Hello world');
    expect(resp.tool_calls).toEqual([]);
    expect(resp.usage).toEqual({ input: 10, output: 5 });
    expect(resp.model).toBe('gpt-4o');
    expect(resp.finishReason).toBe('stop');
  });

  it('strips provider prefix from model id in request body', async () => {
    let capturedBody: Record<string, unknown> = {};
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
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
    await adapter._chatViaFetch(MSG, [], { model: 'openai/gpt-4o', temperature: 0, maxTokens: 10 });

    expect(capturedBody['model']).toBe('gpt-4o');  // NOT 'openai/gpt-4o'
  });

  it('omits tools field when tools array is empty', async () => {
    let capturedBody: Record<string, unknown> = {};
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
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
    await adapter._chatViaFetch(MSG, [], FETCH_OPTS);

    expect(capturedBody['tools']).toBeUndefined();
  });

  it('includes tools when provided', async () => {
    let capturedBody: Record<string, unknown> = {};
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      });
    }) as unknown as typeof fetch;

    const tools: ToolDefinition[] = [{
      type: 'function',
      function: { name: 'search', description: 'Search the web' },
    }];

    const adapter = new OpenAIAdapter('sk-test');
    await adapter._chatViaFetch(MSG, tools, FETCH_OPTS);

    expect(capturedBody['tools']).toBeDefined();
    expect(Array.isArray(capturedBody['tools'])).toBe(true);
  });

  it('throws on non-2xx response', async () => {
    mockFetchError(429, 'rate limited');
    const adapter = new OpenAIAdapter('sk-test');
    await expect(adapter._chatViaFetch(MSG, [], FETCH_OPTS)).rejects.toThrow('429');
  });

  it('uses custom baseURL when provided', async () => {
    let capturedUrl = '';
    global.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      });
    }) as unknown as typeof fetch;

    const adapter = new OpenAIAdapter('sk-test', 'https://custom.api.example.com/v1');
    await adapter._chatViaFetch(MSG, [], FETCH_OPTS);

    expect(capturedUrl).toContain('custom.api.example.com');
  });

  it('falls back to api.openai.com when no baseURL specified', async () => {
    let capturedUrl = '';
    global.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      });
    }) as unknown as typeof fetch;

    const adapter = new OpenAIAdapter('sk-test');
    await adapter._chatViaFetch(MSG, [], FETCH_OPTS);

    expect(capturedUrl).toContain('api.openai.com');
  });

  it('sends defaultHeaders in request when provided', async () => {
    let capturedHeaders: Record<string, string> = {};
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      });
    }) as unknown as typeof fetch;

    const adapter = new OpenAIAdapter('sk-test', undefined, { 'HTTP-Referer': 'https://myapp.com' });
    await adapter._chatViaFetch(MSG, [], FETCH_OPTS);

    expect(capturedHeaders['HTTP-Referer']).toBe('https://myapp.com');
  });

  it('handles null content in response gracefully', async () => {
    mockFetchOk({
      choices: [{ message: { content: null, tool_calls: [] }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 5, completion_tokens: 10 },
      model: 'gpt-4o',
    });

    const adapter = new OpenAIAdapter('sk-test');
    const resp = await adapter._chatViaFetch(MSG, [], FETCH_OPTS);

    expect(resp.content).toBeNull();
  });

  it('uses 0 for usage tokens when usage is absent', async () => {
    mockFetchOk({
      choices: [{ message: { content: 'reply' }, finish_reason: 'stop' }],
      // no usage field
    });

    const adapter = new OpenAIAdapter('sk-test');
    const resp = await adapter._chatViaFetch(MSG, [], FETCH_OPTS);

    expect(resp.usage.input).toBe(0);
    expect(resp.usage.output).toBe(0);
  });
});

// ─── 7. OpenAIAdapter._chatViaSDK() ──────────────────────────────────────────

describe('OpenAIAdapter._chatViaSDK()', () => {
  it('strips provider prefix from model id passed to SDK', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'SDK response', tool_calls: [] }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 8, completion_tokens: 4 },
      model: 'gpt-4o',
    });
    const mockClient = {
      chat: { completions: { create: mockCreate } },
    };

    const adapter = new OpenAIAdapter('sk-test');
    await adapter._chatViaSDK(mockClient as never, MSG, [], OPTS);

    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs['model']).toBe('gpt-4o'); // NOT 'openai/gpt-4o'
  });

  it('passes tools=undefined when empty', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      model: 'gpt-4o',
    });
    const mockClient = { chat: { completions: { create: mockCreate } } };

    const adapter = new OpenAIAdapter('sk-test');
    await adapter._chatViaSDK(mockClient as never, MSG, [], OPTS);

    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs['tools']).toBeUndefined();
  });

  it('returns correct LlmResponse fields', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'SDK text', tool_calls: [] }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 6 },
      model: 'gpt-4o-2024-01',
    });
    const mockClient = { chat: { completions: { create: mockCreate } } };

    const adapter = new OpenAIAdapter('sk-test');
    const resp = await adapter._chatViaSDK(mockClient as never, MSG, [], OPTS);

    expect(resp.content).toBe('SDK text');
    expect(resp.usage).toEqual({ input: 12, output: 6 });
    expect(resp.model).toBe('gpt-4o-2024-01');
    expect(resp.finishReason).toBe('stop');
    expect(resp.tool_calls).toEqual([]);
  });
});

// ─── 8. AnthropicAdapter.chat() ──────────────────────────────────────────────

describe('AnthropicAdapter.chat()', () => {
  const ANTHROPIC_OPTS: ChatOptions = {
    model: 'anthropic/claude-3-haiku',
    temperature: 0.5,
    maxTokens: 512,
  };

  it('returns text-only response when no tool_use blocks', async () => {
    mockFetchOk({
      content: [{ type: 'text', text: 'Just a reply' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      model: 'claude-3-haiku-20240307',
      stop_reason: 'end_turn',
    });

    const adapter = new AnthropicAdapter('sk-ant-test');
    const resp = await adapter.chat(
      [{ role: 'user', content: 'Hello' }],
      [],
      ANTHROPIC_OPTS,
    );

    expect(resp.content).toBe('Just a reply');
    expect(resp.tool_calls).toHaveLength(0);
    expect(resp.usage).toEqual({ input: 10, output: 5 });
    expect(resp.finishReason).toBe('end_turn');
  });

  it('parses tool_use blocks into ToolCallRequest[]', async () => {
    mockFetchOk({
      content: [
        { type: 'text', text: 'Calling search…' },
        { type: 'tool_use', id: 'tc_abc', name: 'search', input: { query: 'test' } },
      ],
      usage: { input_tokens: 20, output_tokens: 15 },
      model: 'claude-3-haiku-20240307',
      stop_reason: 'tool_use',
    });

    const adapter = new AnthropicAdapter('sk-ant-test');
    const resp = await adapter.chat(
      [{ role: 'user', content: 'Search for test' }],
      [{ type: 'function', function: { name: 'search', description: 'Search', parameters: {} } }],
      ANTHROPIC_OPTS,
    );

    expect(resp.content).toBe('Calling search…');
    expect(resp.tool_calls).toHaveLength(1);
    expect(resp.tool_calls[0].id).toBe('tc_abc');
    expect(resp.tool_calls[0].function.name).toBe('search');
    expect(JSON.parse(resp.tool_calls[0].function.arguments)).toEqual({ query: 'test' });
    expect(resp.finishReason).toBe('tool_use');
  });

  it('extracts system message and sends it as top-level system field', async () => {
    let capturedBody: Record<string, unknown> = {};
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
          model: 'claude-3-haiku',
          stop_reason: 'end_turn',
        }),
      });
    }) as unknown as typeof fetch;

    const adapter = new AnthropicAdapter('sk-ant-test');
    await adapter.chat(
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ],
      [],
      ANTHROPIC_OPTS,
    );

    expect(capturedBody['system']).toBe('You are a helpful assistant.');
    // system message should NOT appear in the messages array
    const messages = capturedBody['messages'] as Array<{ role: string }>;
    expect(messages.some((m) => m.role === 'system')).toBe(false);
  });

  it('strips provider prefix from model id in request body', async () => {
    let capturedBody: Record<string, unknown> = {};
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
          stop_reason: 'end_turn',
        }),
      });
    }) as unknown as typeof fetch;

    const adapter = new AnthropicAdapter('sk-ant-test');
    await adapter.chat(
      [{ role: 'user', content: 'Hello' }],
      [],
      { model: 'anthropic/claude-3-haiku', temperature: 0.5, maxTokens: 100 },
    );

    expect(capturedBody['model']).toBe('claude-3-haiku'); // NOT 'anthropic/claude-3-haiku'
  });

  it('uses custom baseURL for anthropic-compat providers (kimi)', async () => {
    let capturedUrl = '';
    global.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
          stop_reason: 'end_turn',
        }),
      });
    }) as unknown as typeof fetch;

    const adapter = new AnthropicAdapter('sk-kimi-test', 'https://api.moonshot.ai/anthropic');
    await adapter.chat(
      [{ role: 'user', content: 'Hello' }],
      [],
      { model: 'kimi/kimi-k2', temperature: 0, maxTokens: 10 },
    );

    expect(capturedUrl).toContain('moonshot.ai');
  });

  it('defaults to api.anthropic.com when no baseURL given', async () => {
    let capturedUrl = '';
    global.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
          stop_reason: 'end_turn',
        }),
      });
    }) as unknown as typeof fetch;

    const adapter = new AnthropicAdapter('sk-ant-test');
    await adapter.chat([{ role: 'user', content: 'hi' }], [], ANTHROPIC_OPTS);

    expect(capturedUrl).toContain('api.anthropic.com');
  });

  it('throws on non-2xx Anthropic API response', async () => {
    mockFetchError(401, 'Unauthorized');
    const adapter = new AnthropicAdapter('sk-ant-test');
    await expect(
      adapter.chat([{ role: 'user', content: 'hi' }], [], ANTHROPIC_OPTS)
    ).rejects.toThrow('401');
  });

  it('maps tool messages to Anthropic tool_result format', async () => {
    let capturedBody: Record<string, unknown> = {};
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'done' }],
          usage: { input_tokens: 1, output_tokens: 1 },
          stop_reason: 'end_turn',
        }),
      });
    }) as unknown as typeof fetch;

    const adapter = new AnthropicAdapter('sk-ant-test');
    await adapter.chat(
      [
        { role: 'user', content: 'Run the tool' },
        { role: 'tool', content: '{"result":"data"}', tool_call_id: 'tc_1', name: 'myTool' },
      ],
      [],
      ANTHROPIC_OPTS,
    );

    const messages = capturedBody['messages'] as Array<{ role: string; content: unknown[] }>;
    const toolResult = messages.find((m) => Array.isArray(m.content) && m.content.some(
      (c: unknown) => (c as Record<string, unknown>)['type'] === 'tool_result'
    ));
    expect(toolResult).toBeDefined();
  });

  it('sends x-api-key and anthropic-version headers', async () => {
    let capturedHeaders: Record<string, string> = {};
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
          stop_reason: 'end_turn',
        }),
      });
    }) as unknown as typeof fetch;

    const adapter = new AnthropicAdapter('my-ant-key');
    await adapter.chat([{ role: 'user', content: 'hi' }], [], ANTHROPIC_OPTS);

    expect(capturedHeaders['x-api-key']).toBe('my-ant-key');
    expect(capturedHeaders['anthropic-version']).toBeDefined();
  });

  it('returns null content when response has only tool_use blocks', async () => {
    mockFetchOk({
      content: [
        { type: 'tool_use', id: 'tc_1', name: 'search', input: { q: 'test' } },
      ],
      usage: { input_tokens: 5, output_tokens: 10 },
      model: 'claude-3-haiku',
      stop_reason: 'tool_use',
    });

    const adapter = new AnthropicAdapter('sk-ant-test');
    const resp = await adapter.chat(
      [{ role: 'user', content: 'Search' }],
      [{ type: 'function', function: { name: 'search' } }],
      ANTHROPIC_OPTS,
    );

    expect(resp.content).toBeNull();
    expect(resp.tool_calls).toHaveLength(1);
  });

  it('uses 0 for tokens when usage is absent', async () => {
    mockFetchOk({
      content: [{ type: 'text', text: 'ok' }],
      // no usage
      stop_reason: 'end_turn',
    });

    const adapter = new AnthropicAdapter('sk-ant-test');
    const resp = await adapter.chat([{ role: 'user', content: 'hi' }], [], ANTHROPIC_OPTS);

    expect(resp.usage.input).toBe(0);
    expect(resp.usage.output).toBe(0);
  });
});

// ─── 9. Regression: removed LLMClientOptions / configOverride ────────────────

describe('Regression: LLMClientOptions / configOverride removed', () => {
  it('buildLLMClient signature accepts exactly one argument', () => {
    // TypeScript compile-time check: signature is (modelId: string) => ProviderAdapter
    // At runtime we simply verify calling with one arg works (not two)
    process.env.OPENAI_API_KEY = 'sk-test';
    const fn = buildLLMClient;
    expect(fn.length).toBe(1); // function.length = number of declared params
  });

  afterAll(() => {
    delete process.env.OPENAI_API_KEY;
  });
});
