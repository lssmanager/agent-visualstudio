/**
 * Unit tests para executeCondition() — F1a-07
 */
import { executeCondition, ConditionSyntaxError, ConditionRuntimeError } from '../execute-condition';

describe('executeCondition()', () => {
  describe('basic boolean expressions', () => {
    it('evaluates true literal', () => {
      expect(executeCondition('true')).toBe(true);
    });

    it('evaluates false literal', () => {
      expect(executeCondition('false')).toBe(false);
    });

    it('evaluates numeric comparison', () => {
      expect(executeCondition('1 + 1 === 2')).toBe(true);
      expect(executeCondition('1 + 1 === 3')).toBe(false);
    });

    it('coerces truthy values to true', () => {
      expect(executeCondition('42')).toBe(true);
      expect(executeCondition('"hello"')).toBe(true);
    });

    it('coerces falsy values to false', () => {
      expect(executeCondition('0')).toBe(false);
      expect(executeCondition('""')).toBe(false);
      expect(executeCondition('null')).toBe(false);
    });

    it('returns false for empty expression', () => {
      expect(executeCondition('')).toBe(false);
      expect(executeCondition('   ')).toBe(false);
    });
  });

  describe('outputs access', () => {
    const outputs = {
      'step-1': { score: 0.8, approved: true, label: 'ok' },
      'step-2': { count: 5 },
    };

    it('accesses output property via bracket notation', () => {
      expect(executeCondition("outputs['step-1'].approved === true", outputs)).toBe(true);
    });

    it('compares numeric output property', () => {
      expect(executeCondition("outputs['step-1'].score > 0.5", outputs)).toBe(true);
      expect(executeCondition("outputs['step-1'].score > 0.9", outputs)).toBe(false);
    });

    it('combines multiple output references', () => {
      expect(
        executeCondition(
          "outputs['step-1'].approved && outputs['step-2'].count >= 5",
          outputs,
        ),
      ).toBe(true);
    });

    it('handles missing property gracefully (undefined → false)', () => {
      expect(executeCondition("outputs['step-1'].missing === undefined", outputs)).toBe(true);
    });

    it('works with empty outputs map', () => {
      expect(executeCondition('true', {})).toBe(true);
    });
  });

  describe('safe globals', () => {
    it('allows Math functions', () => {
      expect(executeCondition('Math.max(1, 2) === 2')).toBe(true);
    });

    it('allows JSON.stringify', () => {
      expect(executeCondition('JSON.stringify({ a: 1 }) === \'{"a":1}\'')).toBe(true);
    });

    it('allows Array.isArray', () => {
      expect(executeCondition('Array.isArray([])')).toBe(true);
    });

    it('allows parseInt', () => {
      expect(executeCondition('parseInt("42", 10) === 42')).toBe(true);
    });
  });

  describe('security sandbox', () => {
    it('blocks access to process', () => {
      // process should be undefined inside the sandbox
      expect(() =>
        executeCondition('typeof process === "undefined"'),
      ).not.toThrow();
      expect(executeCondition('typeof process === "undefined"')).toBe(true);
    });

    it('blocks access to globalThis', () => {
      expect(executeCondition('typeof globalThis === "undefined"')).toBe(true);
    });

    it('blocks require', () => {
      expect(executeCondition('typeof require === "undefined"')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('throws ConditionSyntaxError for invalid syntax', () => {
      expect(() => executeCondition('if (')).toThrow(ConditionSyntaxError);
    });

    it('throws ConditionRuntimeError for runtime errors', () => {
      // Accessing property of null
      expect(() =>
        executeCondition("outputs['x'].y.z", { x: null }),
      ).toThrow(ConditionRuntimeError);
    });

    it('includes expression in error', () => {
      try {
        executeCondition('if (');
      } catch (e) {
        expect((e as ConditionSyntaxError).expression).toBe('if (');
      }
    });
  });
});
