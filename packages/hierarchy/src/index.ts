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
} from './hierarchy-orchestrator.js'

export {
  HierarchyOrchestrator,
  tokenize,
  jaccardScore,
  parseDelegateBlocks,
  DELEGATION_TIMEOUT_MS,
} from './hierarchy-orchestrator.js'

// [F2b-03] generateOrchestratorPrompt() — función pura para sintetizar
// el systemPrompt del orchestrator a partir de capacidades de hijos.
export type {
  ChildCapabilitySummary,
  GenerateOrchestratorPromptParams,
} from './profile-propagator.service.js'

export {
  generateOrchestratorPrompt,
  buildChildSummary,
  aggregateCapabilities,
} from './profile-propagator.service.js'
