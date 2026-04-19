import fs from 'node:fs';
import path from 'node:path';

import { CommandSpec } from '../../../../../packages/core-types/src';
import { studioConfig } from '../../config';

/**
 * Loads commands from `.openclaw/commands/*.md` files.
 * Each markdown file becomes a CommandSpec. The file name is the ID,
 * the first heading is the name, and the body is the description/steps.
 */
export class CommandsService {
  private cache: CommandSpec[] | null = null;

  findAll(): CommandSpec[] {
    if (this.cache) return this.cache;

    const commandsDir = path.join(studioConfig.workspaceRoot, '.openclaw', 'commands');
    if (!fs.existsSync(commandsDir)) {
      // Fallback: try templates directory
      const templatesDir = path.join(studioConfig.workspaceRoot, 'templates', 'workspaces', 'chief-of-staff', 'routines');
      if (!fs.existsSync(templatesDir)) return [];
      return this.loadFromDir(templatesDir);
    }
    return this.loadFromDir(commandsDir);
  }

  findById(id: string): CommandSpec | null {
    return this.findAll().find((c) => c.id === id) ?? null;
  }

  private loadFromDir(dir: string): CommandSpec[] {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    const commands = files.map((file) => {
      const id = file.replace(/\.md$/, '');
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const lines = content.split('\n');

      // Extract name from first heading
      const headingLine = lines.find((l) => l.startsWith('# '));
      const name = headingLine ? headingLine.replace(/^#+\s*/, '') : id;

      // Rest is description
      const bodyLines = lines.filter((l) => !l.startsWith('# '));
      const description = bodyLines.join('\n').trim();

      // Extract steps from list items
      const steps = lines
        .filter((l) => /^\s*[-*]\s/.test(l))
        .map((l) => l.replace(/^\s*[-*]\s/, '').trim());

      return { id, name, description, steps } satisfies CommandSpec;
    });

    this.cache = commands;
    return commands;
  }
}
