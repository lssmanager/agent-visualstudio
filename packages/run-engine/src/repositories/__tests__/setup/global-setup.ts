/**
 * Jest globalSetup: verifica la conexión a DATABASE_URL_TEST antes de
 * lanzar los workers. Si falla aquí, el error es claro y rápido.
 */

import { Client } from 'pg';

export default async function globalSetup() {
  const url = process.env['DATABASE_URL_TEST'];
  if (!url) {
    throw new Error(
      '[F0-10] Missing DATABASE_URL_TEST.\n' +
      'Set it in .env.test:\n' +
      '  DATABASE_URL_TEST=postgresql://user:pass@localhost:5432/avs_test'
    );
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query('SELECT 1');
    console.log('[F0-10] ✅  Database connection OK');
  } catch (e) {
    throw new Error(`[F0-10] Cannot connect to DATABASE_URL_TEST: ${e}`);
  } finally {
    await client.end();
  }
}
