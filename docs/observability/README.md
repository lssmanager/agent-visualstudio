# Observability Documentation

## Stack

| Component | Technology |
|-----------|------------|
| Tracing | OpenTelemetry + Jaeger/Tempo |
| Metrics | OpenTelemetry + Prometheus |
| Logging | Pino (structured JSON) |
| Dashboards | Grafana |

## Instrumented Events

### Runtime
- `run.created`, `run.started`, `run.completed`, `run.failed`
- `run_step.started`, `run_step.completed`, `run_step.failed`, `run_step.retried`

### LLM Calls
- `llm.request`, `llm.response`, `llm.error`, `llm.fallback`
- Token counts (input, output, total)
- Latency, cost estimate

### Tool Calls
- `tool.requested`, `tool.guard_passed`, `tool.guard_rejected`
- `tool.executed`, `tool.failed`, `tool.hitl_requested`, `tool.hitl_approved`

### Channels
- `channel.message_received`, `channel.message_sent`
- `channel.connected`, `channel.disconnected`, `channel.reconnecting`

## Cost Tracking

Every LLM call records:
- Provider, model
- Input tokens, output tokens
- Estimated cost (based on current provider pricing)
- Hierarchy path (agency → agent)

Costs are aggregatable at any level of the hierarchy.
