# Security Documentation

## ToolGuard

Every tool call passes through ToolGuard:

```
Agent requests tool execution
  → Check agent has permission for this tool
  → Check tool is not blocked at workspace/dept/agency level
  → Check input against injection patterns
  → Check rate limits
  → Check budget
  → Check if HITL required
  → Execute tool
  → Validate output schema
  → Log to audit trail
```

## Prompt Injection Detection

All user-provided inputs are scanned before being passed to LLMs:
- Pattern matching against known injection templates
- Anomaly scoring for unusual instruction patterns
- Configurable rejection thresholds per workspace

## Audit Logging

Immutable audit log records:
- All tool executions (who, what, when, result)
- All HITL decisions
- All hierarchy configuration changes
- All credential access
- All authentication events

## RBAC

Role-Based Access Control at every layer:
- System Admin
- Agency Owner
- Department Manager  
- Workspace Manager
- Agent Operator
- Viewer

Permissions are scoped to hierarchy level.
