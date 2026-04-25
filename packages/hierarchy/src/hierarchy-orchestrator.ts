/**
 * HierarchyOrchestrator — Agency → Department → Workspace → Agent → Subagent
 *
 * Design sources:
 *  - CrewAI: Crew.kickoff() with parallel task decomposition and consolidation
 *  - AutoGen: GroupChatManager delegate-to-specialist pattern
 *  - LangGraph: supervisor node routing to subgraphs
 *  - Semantic Kernel: planner decomposing goals into steps
 */

// ── Hierarchy node types ──────────────────────────────────────────────────
export type HierarchyLevel = 'agency' | 'department' | 'workspace' | 'agent' | 'subagent';

export interface HierarchyNode {
  id: string;
  name: string;
  level: HierarchyLevel;
  parentId?: string;
  children?: HierarchyNode[];
  /** Agent model/systemPrompt config if level is agent/subagent */
  agentConfig?: {
    model: string;
    systemPrompt: string;
    skills?: string[];
  };
}

// ── Task / subtask types ──────────────────────────────────────────────────
export interface HierarchyTask {
  id: string;
  description: string;
  assignedNodeId: string;
  level: HierarchyLevel;
  input?: Record<string, unknown>;
}

export interface SubtaskResult {
  taskId: string;
  nodeId: string;
  status: 'completed' | 'failed';
  output: unknown;
  error?: string;
  durationMs: number;
}

export interface OrchestrationResult {
  rootTaskId: string;
  status: 'completed' | 'partial' | 'failed';
  consolidatedOutput: string;
  subtaskResults: SubtaskResult[];
  totalDurationMs: number;
}

// ── Executor interface: implemented by LLMStepExecutor or any adapter ──────
export interface AgentExecutorFn {
  (agentId: string, systemPrompt: string, task: string, skills?: string[]): Promise<string>;
}

// ── Main orchestrator class ───────────────────────────────────────────────
export class HierarchyOrchestrator {
  private readonly hierarchy: HierarchyNode;
  private readonly executorFn: AgentExecutorFn;

  constructor(hierarchy: HierarchyNode, executorFn: AgentExecutorFn) {
    this.hierarchy = hierarchy;
    this.executorFn = executorFn;
  }

  /**
   * Orchestrate a top-level task through the hierarchy.
   * Decomposes the task into subtasks, assigns them to agents/subagents,
   * executes in parallel, and consolidates responses.
   *
   * Pattern: CrewAI Crew.kickoff() + AutoGen GroupChatManager
   */
  async orchestrate(rootTask: string, input?: Record<string, unknown>): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const rootTaskId = `task-${Date.now()}`;

    // Decompose task across agents in this hierarchy
    const subtasks = await this.decomposeTasks(rootTask, input);

    // Execute subtasks in parallel (CrewAI parallel crew / AutoGen async chat)
    const subtaskResults = await this.executeParallel(subtasks);

    // Consolidate results into a final answer (LangGraph supervisor aggregation)
    const consolidatedOutput = await this.consolidateResults(rootTask, subtaskResults);

    const failed = subtaskResults.filter((r) => r.status === 'failed');
    const status = failed.length === 0 ? 'completed' : failed.length === subtaskResults.length ? 'failed' : 'partial';

    return {
      rootTaskId,
      status,
      consolidatedOutput,
      subtaskResults,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Decompose a top-level task into subtasks assigned to leaf agents.
   * Traverses the hierarchy depth-first and assigns work to agent/subagent nodes.
   */
  private async decomposeTasks(
    rootTask: string,
    input?: Record<string, unknown>,
  ): Promise<HierarchyTask[]> {
    const agents = this.collectAgentNodes(this.hierarchy);

    if (agents.length === 0) {
      // Single-agent mode: assign entire task to root node
      return [{
        id: `subtask-${this.hierarchy.id}`,
        description: rootTask,
        assignedNodeId: this.hierarchy.id,
        level: this.hierarchy.level,
        input,
      }];
    }

    // Multi-agent: distribute task by agent specialization
    // In a real implementation this calls a supervisor LLM to decompose;
    // here we apply a round-robin assignment as a functional baseline.
    return agents.map((agent, idx) => ({
      id: `subtask-${agent.id}-${idx}`,
      description: `[Subtask for ${agent.name}]: ${rootTask}`,
      assignedNodeId: agent.id,
      level: agent.level,
      input,
    }));
  }

  /**
   * Execute all subtasks in parallel using Promise.allSettled.
   * Pattern: CrewAI async task execution + AutoGen parallel agents.
   */
  private async executeParallel(subtasks: HierarchyTask[]): Promise<SubtaskResult[]> {
    const settled = await Promise.allSettled(
      subtasks.map((task) => this.executeSingleTask(task)),
    );

    return settled.map((result, idx) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        taskId: subtasks[idx].id,
        nodeId: subtasks[idx].assignedNodeId,
        status: 'failed' as const,
        output: null,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        durationMs: 0,
      };
    });
  }

  /** Execute a single subtask via the injected executor function. */
  private async executeSingleTask(task: HierarchyTask): Promise<SubtaskResult> {
    const start = Date.now();
    const node = this.findNode(task.assignedNodeId);
    const systemPrompt = node?.agentConfig?.systemPrompt ??
      `You are ${node?.name ?? task.assignedNodeId}. Complete your assigned task.`;
    const skills = node?.agentConfig?.skills;

    try {
      const output = await this.executorFn(
        task.assignedNodeId,
        systemPrompt,
        task.description,
        skills,
      );
      return {
        taskId: task.id,
        nodeId: task.assignedNodeId,
        status: 'completed',
        output,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        taskId: task.id,
        nodeId: task.assignedNodeId,
        status: 'failed',
        output: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Consolidate subtask results into a final answer.
   * Pattern: LangGraph supervisor aggregation / CrewAI crew output.
   * Returns plain concatenation as a functional baseline;
   * a real implementation calls the root-level LLM to synthesize.
   */
  private async consolidateResults(
    rootTask: string,
    results: SubtaskResult[],
  ): Promise<string> {
    const completed = results.filter((r) => r.status === 'completed');
    if (completed.length === 0) {
      return `Task failed: no subtasks completed successfully.`;
    }

    const outputs = completed
      .map((r, i) => `[Agent ${r.nodeId} result ${i + 1}]:\n${String(r.output)}`)
      .join('\n\n');

    return [
      `Consolidated output for: "${rootTask}"`,
      `(${completed.length}/${results.length} subtasks succeeded)`,
      '',
      outputs,
    ].join('\n');
  }

  /** Depth-first collect all agent/subagent leaf nodes. */
  private collectAgentNodes(node: HierarchyNode): HierarchyNode[] {
    if (!node.children || node.children.length === 0) {
      if (node.level === 'agent' || node.level === 'subagent') return [node];
      return [];
    }
    return node.children.flatMap((child) => this.collectAgentNodes(child));
  }

  /** Find a node by ID anywhere in the hierarchy tree. */
  private findNode(id: string): HierarchyNode | undefined {
    const search = (node: HierarchyNode): HierarchyNode | undefined => {
      if (node.id === id) return node;
      if (!node.children) return undefined;
      for (const child of node.children) {
        const found = search(child);
        if (found) return found;
      }
      return undefined;
    };
    return search(this.hierarchy);
  }
}
