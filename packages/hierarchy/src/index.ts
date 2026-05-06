export type {
  HierarchyLevel,
  HierarchyNode,
  HierarchyTask,
  SubtaskResult,
  OrchestrationResult,
  AgentExecutorFn,
  SupervisorFn,
  OrchestratorOptions,
  StepStatusResult,
  RouteDecision,
  CapabilityScore,
  SpecialistMatch,
  BlockedStatus,
  DelegateBlock,
} from './hierarchy-orchestrator'

export {
  HierarchyOrchestrator,
  tokenize,
  jaccardScore,
  parseDelegateBlocks,
  DELEGATION_TIMEOUT_MS,
} from './hierarchy-orchestrator'

// [F2b-03] generateOrchestratorPrompt() — función pura para sintetizar
// el systemPrompt del orchestrator a partir de capacidades de hijos.
export type {
  ChildCapabilitySummary,
  GenerateOrchestratorPromptParams,
} from './profile-propagator.service'

export {
  generateOrchestratorPrompt,
  buildChildSummary,
  aggregateCapabilities,
} from './profile-propagator.service'
