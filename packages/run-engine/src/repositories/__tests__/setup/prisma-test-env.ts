/**
 * packages/run-engine/src/repositories/__tests__/setup/prisma-test-env.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Custom Jest Test Environment for Prisma integration tests.
 *
 * Strategy: each Jest worker gets its own PostgreSQL schema
 * (e.g. `test_worker_0`, `test_worker_1`) which enables full parallelism
 * without test isolation issues.
 *
 * The schema is:
 *  1. Created before the first test in the worker.
 *  2. Migrated with `prisma migrate deploy` (uses existing migration files).
 *  3. Cleaned between tests via TRUNCATE (preserving schema, fast).
 *  4. Dropped in globalTeardown.
 *
 * Required env vars:
 *   DATABASE_URL_TEST  — base Postgres URL without schema suffix
 *                        e.g. postgresql://user:pass@localhost:5432/avs_test
 */

import { TestEnvironment } from 'jest-environment-node';
import type { EnvironmentContext, JestEnvironmentConfig } from '@jest/environment';
import { execSync }          from 'child_process';
import { Client }            from 'pg';

export default class PrismaTestEnvironment extends TestEnvironment {
  private readonly schema: string;
  private readonly dbUrl:  string;
  private client!: Client;

  constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
    super(config, context);

    const base = process.env['DATABASE_URL_TEST'];
    if (!base) throw new Error('DATABASE_URL_TEST env var is required for repository tests');

    // Unique schema per worker to allow parallel test runners.
    const workerIdx = process.env['JEST_WORKER_ID'] ?? '0';
    this.schema = `test_worker_${workerIdx}`;
    this.dbUrl  = `${base}?schema=${this.schema}`;
  }

  override async setup() {
    await super.setup();

    // Expose DATABASE_URL to the PrismaClient inside the test files.
    process.env['DATABASE_URL'] = this.dbUrl;
    this.global.process.env['DATABASE_URL'] = this.dbUrl;

    // Create schema + run all migrations
    this.client = new Client({ connectionString: process.env['DATABASE_URL_TEST'] });
    await this.client.connect();
    await this.client.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
    await this.client.end();

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: this.dbUrl },
      stdio: 'pipe',
    });
  }

  override async teardown() {
    // Drop the schema to leave the DB clean
    const client = new Client({ connectionString: process.env['DATABASE_URL_TEST'] });
    await client.connect();
    await client.query(`DROP SCHEMA IF EXISTS "${this.schema}" CASCADE`);
    await client.end();

    delete process.env['DATABASE_URL'];
    await super.teardown();
  }
}
