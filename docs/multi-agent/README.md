# Multi-Agent Orchestration

## Patterns

### Supervisor Pattern
A supervisor agent manages a team of sub-agents, delegates tasks, monitors progress, and aggregates results. Inspired by CrewAI and AutoGen.

### GroupChat
Multiple agents collaborate in a shared conversation, each contributing based on their capabilities. A moderator manages speaking order.

### Debate Protocol
Two or more agents argue opposing positions on a topic, with a judge agent producing a final synthesis.

### Semantic Routing
Incoming messages are embedded and matched against Agent Cards using cosine similarity. The best-matching agent receives the task.

### Hierarchical Delegation
Agents delegate to sub-agents following the hierarchy. A Workspace-level agent can delegate to any Agent within its Workspace.

## Agent Cards

Every agent exposes an Agent Card:

```typescript
interface AgentCard {
  id: string;
  name: string;
  description: string;
  capabilities: string[];          // semantic capability descriptions
  tools: string[];                  // tool ids
  embedding: number[];              // capability embedding vector
  hierarchyPath: string;            // agency.dept.workspace.agent
  maxConcurrentRuns: number;
  budgetConstraints: BudgetConfig;
}
```

## Orchestration Engine

The orchestration engine maintains:
- Active run graph (which agents are executing what)
- Message routing table
- Supervision tree
- Aggregation buffers for parallel execution
