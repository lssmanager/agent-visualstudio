// migrate-apikey-format.ts
// fix(tsc): renamed import from @agent-vs/crypto to @lss/crypto
// (package was renamed when monorepo scope was aligned to @lss/*)
import { encryptAes, decryptAes } from '@lss/crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const credentials = await prisma.n8NCredential.findMany();

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const cred of credentials) {
    try {
      if (!cred.encryptedData) {
        skipped++;
        continue;
      }

      // Attempt to decrypt with old format, re-encrypt with new format
      const decrypted = decryptAes(cred.encryptedData);
      if (!decrypted) {
        skipped++;
        continue;
      }

      const reEncrypted = encryptAes(decrypted);

      await prisma.n8NCredential.update({
        where: { id: cred.id },
        data: { encryptedData: reEncrypted },
      });

      migrated++;
    } catch (err) {
      console.error(`Failed to migrate credential ${cred.id}:`, err);
      errors++;
    }
  }

  console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
