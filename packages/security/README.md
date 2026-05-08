# @agent-vs/security

Security primitives for agent-visualstudio: ToolGuard, injection detection, output validation, audit logging.

## ToolGuard

The central tool execution guardian:

```typescript
import { ToolGuard } from '@agent-vs/security';

const guard = new ToolGuard({
  agentContext,
  auditLogger,
});

// Before any tool execution:
const result = await guard.validate({
  toolId: 'web_search',
  input: { query: '...' },
  executingAgent: agent,
});

if (!result.allowed) {
  throw new ToolGuardRejectionError(result.reason);
}
```

## Injection Detection

```typescript
import { InjectionDetector } from '@agent-vs/security';

const detector = new InjectionDetector();
const scan = detector.scan(userInput);

if (scan.suspicious) {
  // log, reject, or sanitize
}
```

## Audit Logger

All security events written to immutable audit log:

```typescript
auditLogger.log({
  event: 'tool_execution',
  agent: agent.id,
  tool: toolId,
  input: sanitizedInput,
  result: 'allowed' | 'rejected',
  timestamp: new Date(),
});
```
