# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| main    | ✅ Yes    |
| < 1.0   | ❌ No     |

---

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Please report security vulnerabilities via one of these channels:

1. **GitHub Private Security Advisory** (preferred): [Create Advisory](https://github.com/lssmanager/agent-visualstudio/security/advisories/new)
2. **Email**: security@agent-visualstudio.dev

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact / attack vector
- Suggested fix (optional)
- Your GitHub username (for credit)

---

## Disclosure Policy

1. **Acknowledgment**: We will acknowledge receipt within **48 hours**.
2. **Triage**: We will assess severity within **5 business days**.
3. **Fix**: Critical/High vulnerabilities patched within **14 days** of confirmation.
4. **Disclosure**: Coordinated public disclosure after patch is released.
5. **Credit**: Reporter credited in release notes (unless anonymity requested).

---

## Security Architecture

Agent VisualStudio implements defense in depth:

- **ToolGuard**: validates every tool call against name, args schema, and scope before execution
- **Prompt injection detection**: pattern + embedding-based detection before sensitive actions
- **Output guardrails**: response validation before delivery to channels
- **Immutable audit log**: append-only log for all sensitive actions
- **HTTP hardening**: helmet, rate limiting, CORS, security headers
- **Row-level security**: PostgreSQL RLS per Agency for multi-tenancy
- **Secret management**: secrets never stored in plaintext; SecretRef pattern (env/file/exec)

---

## Responsible Disclosure

We follow the principle of coordinated vulnerability disclosure. We ask that you:

- Give us reasonable time to fix the issue before public disclosure
- Avoid accessing or modifying user data without permission
- Not perform denial-of-service attacks
- Not exploit vulnerabilities in production systems
