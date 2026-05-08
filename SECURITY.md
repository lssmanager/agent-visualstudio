# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| main    | ✅ |
| beta    | ✅ |

## Reporting a Vulnerability

**DO NOT open a public GitHub issue for security vulnerabilities.**

Please report security issues by emailing: security@agent-visualstudio.dev

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

We will respond within 48 hours and aim to release a patch within 7 days for critical issues.

## Security Architecture

### ToolGuard
All tool calls pass through ToolGuard which validates:
- Permission scope against the executing agent's authorization level
- Input sanitization against injection patterns
- Output validation against defined schemas
- Rate limiting per agent/workspace/agency

### Prompt Injection Detection
All user inputs are scanned for prompt injection patterns before being passed to LLM providers.

### Audit Logging
All sensitive operations (tool execution, credential access, agent creation, hierarchy modifications) are written to an immutable audit log.

### Credential Management
LLM API keys and channel credentials are never stored in plaintext. All secrets use encrypted storage with key rotation support.

### Human-in-the-Loop (HITL)
High-risk tool executions require explicit human approval before proceeding. Approvals survive system restarts.
