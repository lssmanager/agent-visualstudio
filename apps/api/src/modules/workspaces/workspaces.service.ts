import { WorkspaceSpec, ProfileSpec } from '../../../../../packages/core-types/src';
import { workspaceSpecSchema } from '../../../../../packages/schemas/src';
import { loadProfileFromMarkdown } from '../../../../../packages/profile-engine/src';

import { WorkspacesRepository } from './workspaces.repository';

function nowIso() {
  return new Date().toISOString();
}

function generateWorkspaceId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface BootstrapInput {
  profileId?: string;
  workspaceSpec: Partial<WorkspaceSpec>;
}

export class WorkspacesService {
  private readonly repository = new WorkspacesRepository();

  getCurrent() {
    return this.repository.getCurrent();
  }

  createFromPreset(input: { id: string; name: string; slug: string; profileId?: string }): WorkspaceSpec {
    const workspace = workspaceSpecSchema.parse({
      id: input.id,
      slug: input.slug,
      name: input.name,
      description: 'OpenClaw Studio workspace',
      owner: 'studio',
      defaultModel: 'openai/gpt-5.4-mini',
      agentIds: [],
      skillIds: [],
      flowIds: [],
      profileIds: input.profileId ? [input.profileId] : [],
      policyRefs: [],
      routingRules: [],
      routines: ['morning-brief', 'eod-review', 'followup-sweep', 'task-prep'],
      tags: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }) as WorkspaceSpec;

    return this.repository.save(workspace);
  }

  async bootstrap(input: BootstrapInput, basePath: string = process.cwd()) {
    // Merge order (highest to lowest precedence):
    // 1. Explicit fields in request workspaceSpec
    // 2. Profile sidecar JSON defaults (if profileId provided)
    // 3. System defaults

    let profileDefaults: Partial<WorkspaceSpec> = {};

    // Load profile defaults if profileId is provided
    if (input.profileId) {
      try {
        const profile = await loadProfileFromMarkdown(input.profileId, basePath);
        profileDefaults = {
          defaultModel: profile.defaultModel,
          skillIds: profile.defaultSkills || [],
          routines: profile.routines || [],
          profileIds: [input.profileId],
          policyRefs: (profile.defaultPolicies || []).map((id) => ({
            id,
            scope: 'workspace' as const,
          })),
        };
      } catch (err) {
        throw new Error(
          `Profile '${input.profileId}' not found: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Merge: system defaults → profile defaults → request spec (request wins)
    const merged = workspaceSpecSchema.parse({
      slug: generateWorkspaceId(input.workspaceSpec.name || 'workspace'),
      id: input.workspaceSpec.id || generateWorkspaceId(input.workspaceSpec.name || 'workspace'),
      name: input.workspaceSpec.name || 'Untitled Workspace',
      description: input.workspaceSpec.description,
      owner: input.workspaceSpec.owner,
      defaultModel: input.workspaceSpec.defaultModel ?? profileDefaults.defaultModel ?? 'openai/gpt-5.4-mini',
      agentIds: input.workspaceSpec.agentIds ?? profileDefaults.agentIds ?? [],
      skillIds: input.workspaceSpec.skillIds ?? profileDefaults.skillIds ?? [],
      flowIds: input.workspaceSpec.flowIds ?? [],
      profileIds: input.workspaceSpec.profileIds ?? profileDefaults.profileIds ?? [],
      policyRefs: input.workspaceSpec.policyRefs ?? profileDefaults.policyRefs ?? [],
      routingRules: input.workspaceSpec.routingRules ?? [],
      routines: input.workspaceSpec.routines ?? profileDefaults.routines ?? [],
      tags: input.workspaceSpec.tags ?? [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }) as WorkspaceSpec;

    return this.repository.save(merged);
  }

  updateCurrent(updates: Partial<WorkspaceSpec>) {
    const current = this.repository.getCurrent();
    if (!current) {
      return null;
    }

    const parsed = workspaceSpecSchema.parse({
      ...current,
      ...updates,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: nowIso(),
    }) as WorkspaceSpec;

    return this.repository.save(parsed);
  }
}
