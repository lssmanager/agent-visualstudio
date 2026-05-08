# Run Worker Service

The Run Worker is an async queue-based service that processes agent runs from a Redis queue.

## Responsibilities

- Consume run tasks from Redis queue (BullMQ)
- Execute runs using the @agent-vs/runtime engine
- Update run state in PostgreSQL
- Emit OTel spans for all execution steps
- Handle retries and dead-letter queuing
- Support horizontal scaling (multiple worker instances)

## Queue Architecture

```
API creates Run
  → Enqueue run_id to BullMQ
  → Run Worker dequeues
  → Load Run from PostgreSQL
  → Execute with RuntimeEngine
  → Persist each RunStep
  → Emit events
  → Complete/fail Run
```

## Scaling

Run Workers are stateless and can scale horizontally. Run state coordination uses PostgreSQL row-level locking to prevent double-execution.
