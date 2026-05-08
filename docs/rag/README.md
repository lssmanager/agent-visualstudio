# Memory & RAG Documentation

## Overview

Every entity in the hierarchy can have its own memory scope. Memory is stored in vector form and retrieved semantically during agent execution.

## Memory Scopes

| Scope | Description | Visibility |
|-------|-------------|------------|
| Agent | Private to one agent | Agent only |
| Workspace | Shared within workspace | All workspace agents |
| Department | Shared within department | All department agents |
| Agency | Shared across all | All agents |
| Global | Platform-wide | Read-only reference data |

## RAG Pipeline

```
User query
  → Embed query (configured embedding model)
  → Search memory stores (agent + workspace + dept + agency)
  → Rank and filter by relevance threshold
  → Inject top-K chunks into agent context
  → Agent generates response with retrieved context
```

## Pluggable Backends

| Backend | Use Case |
|---------|----------|
| pgvector | Local dev, small-medium datasets |
| Pinecone | Large scale, managed cloud |
| Qdrant | Self-hosted, performance-critical |
| Weaviate | Enterprise, hybrid search |

## Memory Policies

Defined in `MEMORY.md` Core File:

```markdown
## Retention
- Short-term: 24 hours
- Long-term: 90 days
- Permanent: explicit tag required

## Scope
- Write scope: agent
- Read scope: agent + workspace

## Relevance Threshold
- Minimum similarity: 0.75
- Max chunks: 10
```
