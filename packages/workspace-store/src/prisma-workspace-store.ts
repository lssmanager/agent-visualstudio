/**
 * @deprecated F0-08
 *
 * PrismaWorkspaceStore was a transitional adapter that wrapped Prisma behind the
 * WorkspaceStore interface. Now that all modules have dedicated Prisma repositories,
 * this adapter is no longer needed.
 *
 * Replace usages with the appropriate repository:
 *   agents    → AgentRepository
 *   flows     → FlowRepository
 *   skills    → SkillRepository
 *   policies  → PoliciesRepository
 *   workspace → WorkspaceRepository
 *
 * @see packages/workspace-store/DEPRECATED.md
 */

import type { PrismaClient } from '@prisma/client';
import { WorkspaceStore } from './workspace-store';
import {
  AgentSpec, FlowSpec, SkillSpec, PolicySpec, WorkspaceSpec, HookSpec,
} from '../../core-types/src';

/**
 * @deprecated Use individual Prisma repositories directly.
 */
export class PrismaWorkspaceStore extends WorkspaceStore {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  // All methods below are deprecated stubs.
  // Replace with repository calls before F1.

  readWorkspace(): WorkspaceSpec | null {
    console.warn('[DEPRECATED] PrismaWorkspaceStore.readWorkspace() — use WorkspaceRepository');
    return null;
  }
  writeWorkspace(w: WorkspaceSpec): WorkspaceSpec {
    console.warn('[DEPRECATED] PrismaWorkspaceStore.writeWorkspace() — use WorkspaceRepository');
    return w;
  }
  listAgents(): AgentSpec[]                   { console.warn('[DEPRECATED] PrismaWorkspaceStore.listAgents() — use AgentRepository');    return []; }
  getAgent(_id: string): AgentSpec | null      { console.warn('[DEPRECATED] PrismaWorkspaceStore.getAgent()');    return null; }
  saveAgents(a: AgentSpec[]): AgentSpec[]      { console.warn('[DEPRECATED] PrismaWorkspaceStore.saveAgents()');  return a; }
  listFlows(): FlowSpec[]                      { console.warn('[DEPRECATED] PrismaWorkspaceStore.listFlows() — use FlowRepository');     return []; }
  getFlow(_id: string): FlowSpec | null        { console.warn('[DEPRECATED] PrismaWorkspaceStore.getFlow()');     return null; }
  saveFlows(f: FlowSpec[]): FlowSpec[]         { console.warn('[DEPRECATED] PrismaWorkspaceStore.saveFlows()');   return f; }
  listSkills(): SkillSpec[]                    { console.warn('[DEPRECATED] PrismaWorkspaceStore.listSkills() — use SkillRepository');   return []; }
  getSkill(_id: string): SkillSpec | null      { console.warn('[DEPRECATED] PrismaWorkspaceStore.getSkill()');    return null; }
  saveSkills(s: SkillSpec[]): SkillSpec[]      { console.warn('[DEPRECATED] PrismaWorkspaceStore.saveSkills()');  return s; }
  listPolicies(): PolicySpec[]                 { console.warn('[DEPRECATED] PrismaWorkspaceStore.listPolicies() — use PoliciesRepository'); return []; }
  getPolicy(_id: string): PolicySpec | null    { console.warn('[DEPRECATED] PrismaWorkspaceStore.getPolicy()');   return null; }
  savePolicies(p: PolicySpec[]): PolicySpec[]  { console.warn('[DEPRECATED] PrismaWorkspaceStore.savePolicies()'); return p; }
  listHooks(): HookSpec[]                      { console.warn('[DEPRECATED] PrismaWorkspaceStore.listHooks()');   return []; }
  getHook(_id: string): HookSpec | null        { console.warn('[DEPRECATED] PrismaWorkspaceStore.getHook()');     return null; }
  saveHooks(h: HookSpec[]): HookSpec[]         { console.warn('[DEPRECATED] PrismaWorkspaceStore.saveHooks()');   return h; }
}
