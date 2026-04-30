/**
 * @deprecated F0-08 — This package is deprecated.
 *
 * `workspaceStore` (JSON/YAML file-based persistence) has been replaced by
 * Prisma-backed repositories. Importing from this package produces
 * TypeScript `@deprecated` warnings in your IDE (strikethrough on usage sites).
 *
 * Migration guide: packages/workspace-store/DEPRECATED.md
 * Removal milestone: F1 — Agentes & Ejecución
 */

// Re-export deprecated symbols so existing imports compile during F0.
// Every re-export is tagged @deprecated → IDE shows strikethrough at import site.

/** @deprecated See packages/workspace-store/DEPRECATED.md */
export { WorkspaceStore }       from './workspace-store';
/** @deprecated Use offline export/import tooling only. */
export { JsonWorkspaceStore }   from './json-workspace-store';
/** @deprecated Use offline export/import tooling only. */
export { YamlWorkspaceStore }   from './yaml-workspace-store';
/** @deprecated Use offline export/import tooling only. */
export { DualFormatStore }      from './dual-format-store';
/** @deprecated Will be removed together with this package in F1. */
export type { StoreFormat }     from './dual-format-store';
/**
 * @deprecated Superseded by individual Prisma repositories.
 * Do not instantiate.
 */
export { PrismaWorkspaceStore } from './prisma-workspace-store';
