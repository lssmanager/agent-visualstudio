// packages/profile-engine/src/index.ts
// @lss/profile-engine — public API

// Markdown loaders — fuente primaria para loading dinámico desde disco
export {
  loadProfileFromMarkdown,
  loadProfilesCatalog,
  invalidateProfilesCatalog,
  loadRoutineMarkdown,
  loadRoutinesCatalog,
  invalidateRoutinesCatalog,
  type RoutineInfo,
} from './loaders/index'

export * from './routines'

// ProfilePropagatorService — persistencia en Prisma (AgentProfile)
export type {
  AgentPersona,
  KnowledgeBaseEntry,
  PropagateProfileInput,
  ResolvedProfile,
  PropagateUpResult,
} from './profile-propagator.service'

export { ProfilePropagatorService } from './profile-propagator.service'

// ModelCapabilityRegistry — catálogo seed y resolución de fallback (uso legacy/tests)
export type { ModelFamily, ModelCapability } from './model-capability-registry'
export {
  CAPABILITY_REGISTRY,
  seedFamiliesForModel,
  seedContextKForModel,
  resolveModelFallbackChain,
  ModelCapabilityRegistry,
} from './model-capability-registry'

// ProviderCatalogService — CRUD de credenciales + sync desde APIs de proveedores
export type {
  CreateProviderInput,
  UpdateProviderInput,
  ModelFilter,
  ResolvedModel,
} from './provider-catalog.service'
export {
  encryptApiKey,
  decryptApiKey,
  ProviderCatalogService,
} from './provider-catalog.service'

// ModelCatalogService — consulta del catálogo en DB
export type { ModelCatalogEntryWithProvider } from './model-catalog.service'
export { ModelCatalogService } from './model-catalog.service'

// AgentBuilder — creación/eliminación de agentes con propagación de orchestrator prompts
export type {
  CreateAgentInput,
  UpdateAgentInput,
  BuiltAgent,
  ModelResolution,
  OrchestratorModelResolver,
  OrchestratorPromptPropagator,
} from './agent-builder'

export { AgentBuilder } from './agent-builder'
