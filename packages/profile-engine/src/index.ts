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
