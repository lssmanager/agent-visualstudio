// Markdown loaders — fuente primaria para loading dinámico desde disco
export {
  loadProfileFromMarkdown,
  loadProfilesCatalog,
  invalidateProfilesCatalog,
  loadRoutineMarkdown,
  loadRoutinesCatalog,
  invalidateRoutinesCatalog,
  type RoutineInfo,
} from './loaders/index.js'

export * from './routines.js'

// ProfilePropagatorService — persistencia en Prisma (AgentProfile)
export type {
  AgentPersona,
  KnowledgeBaseEntry,
  PropagateProfileInput,
  ResolvedProfile,
} from './profile-propagator.service.js'

export { ProfilePropagatorService } from './profile-propagator.service.js'

// ModelCapabilityRegistry — catálogo de capacidades por modelo y resolución de fallback
export type { ModelFamily, ModelCapability, ModelResolution } from './model-capability-registry.js'
export type { ModelResolution as OrchestratorModelResolution } from './agent-builder.js'
export {
  CAPABILITY_REGISTRY,
  resolveModelFallbackChain,
  ModelCapabilityRegistry,
} from './model-capability-registry.js'

// AgentBuilder — creación/eliminación de agentes con propagación de orchestrator prompts
export type {
  CreateAgentInput,
  UpdateAgentInput,
  BuiltAgent,
} from './agent-builder.js'

export {
  AgentBuilder,
  OrchestratorModelResolver,
  OrchestratorPromptPropagator,
} from './agent-builder.js'
