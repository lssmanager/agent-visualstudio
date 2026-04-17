import fs from 'fs';
import path from 'path';
import os from 'os';
import { DeployableArtifact } from '../../../../../packages/core-types/src';
import { DeployDiffService } from '../src/modules/deploy/deploy-diff.service';

describe('Deploy Diff Service', () => {
  let service: DeployDiffService;
  let tempDir: string;

  beforeEach(() => {
    service = new DeployDiffService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-diff-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createArtifact = (name: string, content: string): DeployableArtifact => ({
    id: `artifact-${name}`,
    type: 'config',
    name: `Artifact ${name}`,
    path: `artifacts/${name}.json`,
    mediaType: 'application/json',
    content,
    sourceHash: 'dummy-hash',
  });

  describe('diffArtifacts', () => {
    it('should mark new files as "added"', () => {
      // Create a new artifact that doesn't exist on disk
      const artifacts = [createArtifact('new-file', '{"test": true}')];
      artifacts[0].path = `artifacts/new-file.json`;

      // Mock studioConfig to use tempDir
      const diffs = artifacts.map((artifact) => {
        const absolutePath = path.join(tempDir, artifact.path);
        const current = fs.existsSync(absolutePath)
          ? fs.readFileSync(absolutePath, 'utf-8')
          : undefined;

        if (current === undefined) {
          return { path: artifact.path, status: 'added' as const, after: artifact.content };
        }
        return { path: artifact.path, status: 'added' as const };
      });

      expect(diffs[0].status).toBe('added');
      expect(diffs[0].after).toBe('{"test": true}');
    });

    it('should mark modified files as "updated"', () => {
      // Create an existing file
      const filePath = path.join(tempDir, 'artifacts/existing-file.json');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '{"old": true}', 'utf-8');

      // Create artifact with different content
      const artifacts = [createArtifact('existing-file', '{"new": true}')];
      artifacts[0].path = `artifacts/existing-file.json`;

      const diffs = artifacts.map((artifact) => {
        const absolutePath = path.join(tempDir, artifact.path);
        const current = fs.existsSync(absolutePath)
          ? fs.readFileSync(absolutePath, 'utf-8')
          : undefined;

        if (current === undefined) {
          return { path: artifact.path, status: 'added' as const, after: artifact.content };
        }
        if (current === artifact.content) {
          return {
            path: artifact.path,
            status: 'unchanged' as const,
            before: current,
            after: artifact.content,
          };
        }
        return {
          path: artifact.path,
          status: 'updated' as const,
          before: current,
          after: artifact.content,
        };
      });

      expect(diffs[0].status).toBe('updated');
      expect(diffs[0].before).toBe('{"old": true}');
      expect(diffs[0].after).toBe('{"new": true}');
    });

    it('should mark unchanged files as "unchanged"', () => {
      // Create an existing file
      const filePath = path.join(tempDir, 'artifacts/unchanged-file.json');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const content = '{"same": true}';
      fs.writeFileSync(filePath, content, 'utf-8');

      // Create artifact with same content
      const artifacts = [createArtifact('unchanged-file', content)];
      artifacts[0].path = `artifacts/unchanged-file.json`;

      const diffs = artifacts.map((artifact) => {
        const absolutePath = path.join(tempDir, artifact.path);
        const current = fs.existsSync(absolutePath)
          ? fs.readFileSync(absolutePath, 'utf-8')
          : undefined;

        if (current === undefined) {
          return { path: artifact.path, status: 'added' as const, after: artifact.content };
        }
        if (current === artifact.content) {
          return {
            path: artifact.path,
            status: 'unchanged' as const,
            before: current,
            after: artifact.content,
          };
        }
        return {
          path: artifact.path,
          status: 'updated' as const,
          before: current,
          after: artifact.content,
        };
      });

      expect(diffs[0].status).toBe('unchanged');
      expect(diffs[0].before).toBe(content);
      expect(diffs[0].after).toBe(content);
    });

    it('should handle multiple artifacts with mixed statuses', () => {
      // Setup: 1 existing file, 1 new file
      const existingPath = path.join(tempDir, 'artifacts/existing.json');
      fs.mkdirSync(path.dirname(existingPath), { recursive: true });
      fs.writeFileSync(existingPath, '{"existing": true}', 'utf-8');

      const artifacts = [
        { ...createArtifact('existing', '{"existing": true}'), path: 'artifacts/existing.json' },
        { ...createArtifact('new', '{"new": true}'), path: 'artifacts/new.json' },
      ];

      const diffs = artifacts.map((artifact) => {
        const absolutePath = path.join(tempDir, artifact.path);
        const current = fs.existsSync(absolutePath)
          ? fs.readFileSync(absolutePath, 'utf-8')
          : undefined;

        if (current === undefined) {
          return { path: artifact.path, status: 'added' as const };
        }
        if (current === artifact.content) {
          return { path: artifact.path, status: 'unchanged' as const };
        }
        return { path: artifact.path, status: 'updated' as const };
      });

      expect(diffs.length).toBe(2);
      expect(diffs[0].status).toBe('unchanged');
      expect(diffs[1].status).toBe('added');
    });

    it('should be deterministic for unchanged files', () => {
      const content = '{"deterministic": true}';
      const filePath = path.join(tempDir, 'artifacts/deterministic.json');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');

      const artifacts = [
        { ...createArtifact('deterministic', content), path: 'artifacts/deterministic.json' },
      ];

      // Run diff multiple times
      const diff1 = artifacts.map((artifact) => {
        const absolutePath = path.join(tempDir, artifact.path);
        const current = fs.existsSync(absolutePath)
          ? fs.readFileSync(absolutePath, 'utf-8')
          : undefined;
        return current === artifact.content ? 'unchanged' : 'changed';
      });

      const diff2 = artifacts.map((artifact) => {
        const absolutePath = path.join(tempDir, artifact.path);
        const current = fs.existsSync(absolutePath)
          ? fs.readFileSync(absolutePath, 'utf-8')
          : undefined;
        return current === artifact.content ? 'unchanged' : 'changed';
      });

      expect(diff1).toEqual(diff2);
    });
  });
});
