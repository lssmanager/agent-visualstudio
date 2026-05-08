# RAG Service

The RAG Service handles document ingestion, embedding, indexing, and semantic retrieval for the memory system.

## Responsibilities

- Document ingestion pipeline (PDF, Markdown, text, web)
- Chunking strategies (fixed-size, semantic, recursive)
- Embedding generation (configurable model per workspace)
- Vector index management across backends
- Semantic search with score filtering
- Memory scope enforcement

## Ingestion Pipeline

```
Document input
  → Extract text
  → Chunk (strategy per policy)
  → Embed chunks
  → Store in vector backend with scope metadata
  → Index for retrieval
```

## Retrieval Pipeline

```
Query string
  → Embed query
  → Search vector backend (scoped by memory policy)
  → Rank by cosine similarity
  → Filter by threshold
  → Return top-K chunks with metadata
```
