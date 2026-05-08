# @agent-vs/observability

OpenTelemetry instrumentation, structured logging, and metrics for agent-visualstudio.

## Setup

```typescript
import { setupObservability } from '@agent-vs/observability';

setupObservability({
  serviceName: 'agent-vs-api',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  logLevel: 'info',
});
```

## Tracing

```typescript
import { tracer } from '@agent-vs/observability';

const span = tracer.startSpan('llm.complete', {
  attributes: {
    'llm.provider': 'anthropic',
    'llm.model': 'claude-sonnet-4-5',
    'agent.id': agent.id,
    'run.id': run.id,
  },
});

try {
  const result = await provider.complete(request);
  span.setAttributes({
    'llm.input_tokens': result.usage.inputTokens,
    'llm.output_tokens': result.usage.outputTokens,
    'llm.cost_usd': result.estimatedCost,
  });
} finally {
  span.end();
}
```

## Metrics

Key metrics exposed:
- `agent_vs.run.duration` — histogram of run durations
- `agent_vs.llm.tokens_total` — counter of total tokens
- `agent_vs.llm.cost_usd_total` — counter of total cost
- `agent_vs.tool.executions_total` — counter per tool
- `agent_vs.channel.messages_total` — counter per channel
