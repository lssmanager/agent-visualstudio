/**
 * SkillRegistry — enriched for Fase 2.
 * New capabilities:
 *   - findByCategory(category): SkillSpec[]
 *   - findByFunction(fnName): SkillSpec[]
 *   - resolveToolsForSkills(ids): SkillFunctionSpec[]
 *   - toMcpToolDefinitions(): import from skill-bridge at call site
 *   - unregister(id): boolean
 *
 * Remains backward-compatible with the original register/registerMany/list/get API.
 */
import type { SkillSpec, SkillFunctionSpec } from '../../core-types/src/index.js';
import { skillSpecSchema } from '../../schemas/src/index.js';

export class SkillRegistry {
  private readonly byId = new Map<string, SkillSpec>();

  // ── Write ────────────────────────────────────────────────────────────────

  register(skill: SkillSpec): SkillSpec {
    const parsed = skillSpecSchema.parse(skill) as SkillSpec;
    this.byId.set(parsed.id, parsed);
    return parsed;
  }

  registerMany(skills: SkillSpec[]): SkillSpec[] {
    return skills.map((skill) => this.register(skill));
  }

  unregister(id: string): boolean {
    return this.byId.delete(id);
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  list(): SkillSpec[] {
    return [...this.byId.values()];
  }

  get(id: string): SkillSpec | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Return all skills belonging to a given category (case-insensitive). */
  findByCategory(category: string): SkillSpec[] {
    const lower = category.toLowerCase();
    return this.list().filter(
      (s) => s.category.toLowerCase() === lower,
    );
  }

  /**
   * Return all skills that expose a function with the given name.
   * Useful for flow-engine to discover which skills can handle a named capability.
   */
  findByFunction(fnName: string): SkillSpec[] {
    return this.list().filter((s) =>
      s.functions.some((fn) => fn.name === fnName),
    );
  }

  /**
   * Given a list of skill IDs, return all SkillFunctionSpec objects across
   * those skills — flattened and deduplicated by `name`.
   * Used by flow-engine when building the LLM tool-call manifest for a step.
   */
  resolveToolsForSkills(skillIds: string[]): SkillFunctionSpec[] {
    const seen = new Set<string>();
    const result: SkillFunctionSpec[] = [];
    for (const id of skillIds) {
      const skill = this.byId.get(id);
      if (!skill) continue;
      for (const fn of skill.functions) {
        if (!seen.has(fn.name)) {
          seen.add(fn.name);
          result.push(fn);
        }
      }
    }
    return result;
  }

  /**
   * Serialize the registry for debugging or snapshotting.
   * Returns a plain object keyed by skill id.
   */
  toJSON(): Record<string, SkillSpec> {
    return Object.fromEntries(this.byId);
  }
}
