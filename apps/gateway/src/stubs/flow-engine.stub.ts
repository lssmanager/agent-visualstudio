/**
 * stubs/flow-engine.stub.ts
 * Stub de @agent-vs/flow-engine hasta que el paquete exista.
 */

export interface RunInput {
  workspaceId: string
  agentId:     string
  sessionId:   string
  channelKind: string
  inputData:   Record<string, unknown>
}

export interface RunResult {
  status: 'ok' | 'failed'
  output: Record<string, unknown> | null
  error?: unknown
}

export class AgentRunner {
  constructor(_opts: { prisma: unknown }) {}

  async run(_input: RunInput): Promise<RunResult> {
    return { status: 'ok', output: { reply: '(flow-engine stub)' } }
  }
}
