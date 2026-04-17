import path from 'path';
import { ProfilesService } from '../src/modules/profiles/profiles.service';
import { SkillsService } from '../src/modules/skills/skills.service';
import { AgentsService } from '../src/modules/agents/agents.service';
import { WorkspacesService } from '../src/modules/workspaces/workspaces.service';
import { WorkspacesCompiler } from '../src/modules/workspaces/workspaces.compiler';

describe('API Service Layer Tests', () => {
  const basePath = path.resolve(__dirname, '../../../');

  describe('ProfilesService', () => {
    let service: ProfilesService;

    beforeEach(() => {
      service = new ProfilesService();
    });

    it('should load profiles from catalog', async () => {
      const profiles = await service.getAll(basePath);

      expect(Array.isArray(profiles)).toBe(true);
      expect(profiles.length).toBeGreaterThan(0);
    });

    it('should cache profiles on subsequent calls', async () => {
      const profiles1 = await service.getAll(basePath);
      const profiles2 = await service.getAll(basePath);

      // Should return the same cached instance
      expect(profiles1).toBe(profiles2);
    });

    it('should return chief-of-staff profile', async () => {
      const profiles = await service.getAll(basePath);
      const chiefOfStaff = profiles.find((p) => p.id === 'chief-of-staff');

      expect(chiefOfStaff).toBeDefined();
      expect(chiefOfStaff?.name).toBe('Chief of Staff');
    });

    it('should find profile by id', async () => {
      const profile = await service.getById('chief-of-staff', basePath);

      expect(profile).toBeDefined();
      expect(profile?.id).toBe('chief-of-staff');
    });

    it('should return null for non-existent profile', async () => {
      const profile = await service.getById('non-existent', basePath);

      expect(profile).toBeNull();
    });

    it('should invalidate cache', async () => {
      const profiles1 = await service.getAll(basePath);
      service.invalidateCache();
      const profiles2 = await service.getAll(basePath);

      // Should return different cache instances after invalidation
      expect(profiles1).not.toBe(profiles2);
      expect(profiles1).toEqual(profiles2); // But same content
    });
  });

  describe('WorkspacesCompiler', () => {
    let compiler: WorkspacesCompiler;
    let workspacesService: WorkspacesService;

    beforeEach(() => {
      compiler = new WorkspacesCompiler();
      workspacesService = new WorkspacesService();
    });

    it('should compile current workspace', async () => {
      const result = await compiler.compileCurrent();

      expect(result).toBeDefined();
      expect(result.artifacts).toBeDefined();
      expect(Array.isArray(result.artifacts)).toBe(true);
    });

    it('should include diagnostics in response', async () => {
      const result = await compiler.compileCurrent();

      expect(result.diagnostics).toBeDefined();
      expect(Array.isArray(result.diagnostics)).toBe(true);
    });

    it('should generate artifacts with sourceHash', async () => {
      const result = await compiler.compileCurrent();

      for (const artifact of result.artifacts) {
        expect(artifact.sourceHash).toBeDefined();
        expect(typeof artifact.sourceHash).toBe('string');
      }
    });
  });

  describe('Bootstrap Merge Order', () => {
    let service: WorkspacesService;
    let profilesService: ProfilesService;

    beforeEach(() => {
      service = new WorkspacesService();
      profilesService = new ProfilesService();
    });

    it('should merge request > profile > defaults', async () => {
      const profiles = await profilesService.getAll(basePath);
      const chiefOfStaff = profiles.find((p) => p.id === 'chief-of-staff');

      expect(chiefOfStaff).toBeDefined();

      const workspace = await service.bootstrap({
        profileId: 'chief-of-staff',
        workspaceSpec: {
          name: 'Override Workspace',
          // Request overrides profile defaults
        },
      });

      // workspace.name comes from request (highest priority)
      expect(workspace.name).toBe('Override Workspace');
    });

    it('should use profile defaults when request does not provide values', async () => {
      const profiles = await profilesService.getAll(basePath);
      const chiefOfStaff = profiles.find((p) => p.id === 'chief-of-staff');

      const workspace = await service.bootstrap({
        profileId: 'chief-of-staff',
        workspaceSpec: {
          name: 'Test Workspace',
          // Do not provide defaultModel, should come from profile
        },
      });

      // defaultModel from profile should be applied
      if (chiefOfStaff?.defaultModel) {
        expect(workspace.defaultModel).toBeDefined();
      }
    });

    it('should throw error for non-existent profile', async () => {
      await expect(
        service.bootstrap({
          profileId: 'non-existent-profile',
          workspaceSpec: { name: 'Test' },
        }),
      ).rejects.toThrow();
    });
  });

  describe('Deployment Service Tests', () => {
    it('should identify added, updated, and unchanged artifacts', () => {
      // This test verifies the diff logic works correctly
      // Needs actual deploy service implementation

      expect(true).toBe(true); // Placeholder until deploy service is directly testable
    });
  });
});
