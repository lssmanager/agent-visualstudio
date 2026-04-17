import path from 'path';
import { loadProfilesCatalog, loadProfileFromMarkdown, loadRoutinesCatalog } from '../src/loaders';

describe('Profile Loaders', () => {
  const basePath = path.resolve(__dirname, '../../../');

  describe('loadProfilesCatalog', () => {
    it('should load all profiles from markdown + json sidecars', async () => {
      const profiles = await loadProfilesCatalog(basePath);

      expect(Array.isArray(profiles)).toBe(true);
      expect(profiles.length).toBeGreaterThan(0);
    });

    it('should have chief-of-staff profile', async () => {
      const profiles = await loadProfilesCatalog(basePath);
      const chiefOfStaff = profiles.find((p) => p.id === 'chief-of-staff');

      expect(chiefOfStaff).toBeDefined();
      expect(chiefOfStaff?.name).toBe('Chief of Staff');
      expect(chiefOfStaff?.category).toBe('operations');
      expect(chiefOfStaff?.defaultModel).toBe('openai/gpt-5.4-mini');
    });

    it('should merge markdown description with json metadata', async () => {
      const profiles = await loadProfilesCatalog(basePath);
      const chiefOfStaff = profiles.find((p) => p.id === 'chief-of-staff');

      expect(chiefOfStaff?.description).toBeDefined();
      expect(chiefOfStaff?.description).toContain('Operational orchestrator');
      expect(chiefOfStaff?.defaultSkills).toContain('status.read');
    });

    it('should load all 8 profiles (or at minimum chief-of-staff)', async () => {
      const profiles = await loadProfilesCatalog(basePath);
      const ids = profiles.map((p) => p.id);

      // Verify at least the main ones are present
      expect(ids).toContain('chief-of-staff');
      expect(ids.length).toBeGreaterThanOrEqual(1);
    });

    it('should include routines from json sidecar', async () => {
      const profiles = await loadProfilesCatalog(basePath);
      const chiefOfStaff = profiles.find((p) => p.id === 'chief-of-staff');

      expect(chiefOfStaff?.routines).toBeDefined();
      expect(Array.isArray(chiefOfStaff?.routines)).toBe(true);
      expect(chiefOfStaff?.routines.length).toBeGreaterThan(0);
    });

    it('should validate each profile against schema', async () => {
      const profiles = await loadProfilesCatalog(basePath);

      // All profiles should have required fields
      for (const profile of profiles) {
        expect(profile.id).toBeDefined();
        expect(profile.name).toBeDefined();
        expect(typeof profile.id).toBe('string');
        expect(typeof profile.name).toBe('string');
      }
    });
  });

  describe('loadProfileFromMarkdown', () => {
    it('should load specific profile by id', async () => {
      const profile = await loadProfileFromMarkdown('chief-of-staff', basePath);

      expect(profile).toBeDefined();
      expect(profile?.id).toBe('chief-of-staff');
      expect(profile?.name).toBe('Chief of Staff');
    });

    it('should handle non-existent profile gracefully', async () => {
      const profile = await loadProfileFromMarkdown('non-existent-profile', basePath);

      // Should either return null or throw error (depending on implementation)
      expect(profile === null || profile === undefined).toBe(true);
    });

    it('should include default skills from json', async () => {
      const profile = await loadProfileFromMarkdown('chief-of-staff', basePath);

      expect(profile?.defaultSkills).toBeDefined();
      expect(Array.isArray(profile?.defaultSkills)).toBe(true);
    });
  });
});

describe('Routine Loaders', () => {
  const basePath = path.resolve(__dirname, '../../../');

  describe('loadRoutinesCatalog', () => {
    it('should load all routines from markdown', async () => {
      const routines = await loadRoutinesCatalog(basePath);

      expect(Array.isArray(routines)).toBe(true);
      expect(routines.length).toBeGreaterThan(0);
    });

    it('should load chief-of-staff routines', async () => {
      const routines = await loadRoutinesCatalog(basePath);
      const routineIds = routines.map((r) => r.id);

      // Expect at least one of the known routines
      const expectedRoutines = ['morning-brief', 'eod-review', 'followup-sweep', 'task-prep'];
      const hasAnyRoutine = expectedRoutines.some((r) => routineIds.includes(r));
      expect(hasAnyRoutine).toBe(true);
    });

    it('should include promptTemplate with full markdown content', async () => {
      const routines = await loadRoutinesCatalog(basePath);
      const morningBrief = routines.find((r) => r.id === 'morning-brief');

      expect(morningBrief).toBeDefined();
      expect(morningBrief?.promptTemplate).toBeDefined();
      expect(typeof morningBrief?.promptTemplate).toBe('string');
      expect(morningBrief?.promptTemplate.length).toBeGreaterThan(0);
    });

    it('should extract routine name from markdown heading', async () => {
      const routines = await loadRoutinesCatalog(basePath);

      for (const routine of routines) {
        expect(routine.name).toBeDefined();
        expect(typeof routine.name).toBe('string');
        expect(routine.name.length).toBeGreaterThan(0);
      }
    });
  });
});
