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
  PropagateUpResult,
} from './profile-propagator.service.js'

export { ProfilePropagatorService } from './profile-propagator.service.js'

// ModelCapabilityRegistry — catálogo seed y resolución de fallback (uso legacy/tests)
export type { ModelFamily, ModelCapability } from './model-capability-registry.js'
export {
  CAPABILITY_REGISTRY,
  seedFamiliesForModel,
  seedContextKForModel,
  resolveModelFallbackChain,
  ModelCapabilityRegistry,
} from './model-capability-registry.js'

// ProviderCatalogService — CRUD de credenciales + sync desde APIs de proveedores
export type {
  CreateProviderInput,
  UpdateProviderInput,
  ModelFilter,
  ResolvedModel,
} from './provider-catalog.service.js'
export {
  encryptApiKey,
  decryptApiKey,
  ProviderCatalogService,
} from './provider-catalog.service.js'

// ModelCatalogService — consulta del catálogo en DB
export type { ModelCatalogEntryWithProvider } from './model-catalog.service.js'
export { ModelCatalogService } from './model-catalog.service.js'

// AgentBuilder — creación/eliminación de agentes con propagación de orchestrator prompts
export type {
  CreateAgentInput,
  UpdateAgentInput,
  BuiltAgent,
  ModelResolution as OrchestratorModelResolution,
} from './agent-builder.js'

export {
  AgentBuilder,
  OrchestratorModelResolver,
  OrchestratorPromptPropagator,
} from './agent-builder.js'
