/**
 * migrate-apikey-format.ts
 *
 * Migra N8nConnection.apiKeyEncrypted del formato hex plano (legacy)
 * al formato base64url con puntos (F3b-05 estándar de @agent-vs/crypto).
 *
 * Formato legacy:  [12b IV][16b authTag][Nb ciphertext] todo en hex
 * Formato nuevo:   <iv_b64url>.<authTag_b64url>.<ciphertext_b64url>
 *
 * Uso:
 *   N8N_SECRET=<old_key_hex> SECRETS_ENCRYPTION_KEY=<new_key_hex> \
 *     npx tsx packages/n8n-service/scripts/migrate-apikey-format.ts
 *
 * Si la clave es la misma (solo cambia el formato):
 *   SECRETS_ENCRYPTION_KEY=<key_hex> N8N_SECRET=<same_key_hex> \
 *     npx tsx ...
 *
 * En dry-run (sin escritura), añadir: DRY_RUN=true
 */

import { createDecipheriv } from 'node:crypto';
import { encrypt }          from '@agent-vs/crypto';
import { PrismaClient }     from '@prisma/client';

const prisma   = new PrismaClient();
const DRY_RUN  = process.env['DRY_RUN'] === 'true';

/** Descifra el formato hex legacy: [12b IV][16b tag][Nb cipher] */
function decryptLegacy(encryptedHex: string, keyHex: string): string {
  const key     = Buffer.from(keyHex, 'hex');
  const buf     = Buffer.from(encryptedHex, 'hex');
  const iv      = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const cipher  = buf.subarray(28);
  const d       = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(authTag);
  return Buffer.concat([d.update(cipher), d.final()]).toString('utf8');
}

/**
 * Detecta si el valor está en formato legacy (hex plano sin puntos).
 * Legacy: solo hex, mínimo 58 chars (12+16+1 bytes × 2), sin puntos.
 */
function isLegacyFormat(value: string): boolean {
  return /^[0-9a-fA-F]{58,}$/.test(value) && !value.includes('.');
}

async function main() {
  const oldKey = process.env['N8N_SECRET'] ?? process.env['CHANNEL_SECRET'];
  if (!oldKey) {
    throw new Error('N8N_SECRET (old decryption key) is required for migration');
  }

  const connections = await prisma.n8nConnection.findMany({
    select: { id: true, apiKeyEncrypted: true },
  });

  console.log(`Found ${connections.length} N8nConnection records.`);
  if (DRY_RUN) console.log('DRY_RUN=true — no writes will be performed.');

  let migrated = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const conn of connections) {
    if (!isLegacyFormat(conn.apiKeyEncrypted)) {
      console.log(`  SKIP ${conn.id} — already in new format (or unknown format)`);
      skipped++;
      continue;
    }

    try {
      const plaintext    = decryptLegacy(conn.apiKeyEncrypted, oldKey);
      // encrypt() reads SECRETS_ENCRYPTION_KEY internally
      const newEncrypted = encrypt(plaintext);

      if (DRY_RUN) {
        console.log(`  DRY  ${conn.id} — would re-encrypt to new format`);
      } else {
        await prisma.n8nConnection.update({
          where: { id: conn.id },
          data:  { apiKeyEncrypted: newEncrypted },
        });
        console.log(`  MIGRATED ${conn.id}`);
      }
      migrated++;
    } catch (err) {
      console.error(`  ERROR ${conn.id}:`, err);
      errors++;
    }
  }

  console.log(`\nDone. migrated=${migrated} skipped=${skipped} errors=${errors}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
