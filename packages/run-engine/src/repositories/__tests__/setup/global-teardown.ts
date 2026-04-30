/**
 * Jest globalTeardown: elimina todos los schemas de worker que quedaron
 * huérfanos (ej. si un worker crashó antes de su teardown).
 */

import { Client } from 'pg';

export default async function globalTeardown() {
  const url = process.env['DATABASE_URL_TEST'];
  if (!url) return;

  const client = new Client({ connectionString: url });
  await client.connect();

  // Drop all test_worker_* schemas
  const { rows } = await client.query<{ schema_name: string }>(
    `SELECT schema_name
     FROM information_schema.schemata
     WHERE schema_name LIKE 'test_worker_%'`
  );

  for (const row of rows) {
    await client.query(`DROP SCHEMA IF EXISTS "${row.schema_name}" CASCADE`);
    console.log(`[F0-10] Dropped schema ${row.schema_name}`);
  }

  await client.end();
}
