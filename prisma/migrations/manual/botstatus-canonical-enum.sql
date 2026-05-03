-- ============================================================
-- MIGRACIÓN MANUAL: botstatus-canonical-enum
-- Archivo: prisma/migrations/manual/botstatus-canonical-enum.sql
--
-- PROPÓSITO: Reemplazar el enum BotStatus legacy (initializing, rate_limited,
-- webhook_error) por el enum canónico definido en AUDIT-25 (10 valores).
--
-- EJECUTAR EN ESTE ORDEN EXACTO:
--   1. Backup completo de la BD antes de ejecutar
--   2. Aplicar en staging, verificar, luego prod
--   3. Nunca aplicar en prod sin haber pasado staging
--
-- VERIFICACIÓN POST-MIGRACIÓN:
--   psql $DATABASE_URL -c 'SELECT DISTINCT "botStatus" FROM "ChannelConfig";'
--   -- Resultado esperado: SOLO valores del enum canónico
-- ============================================================

BEGIN;

-- PASO A: Convertir columna a texto temporalmente
ALTER TABLE "ChannelConfig" ALTER COLUMN "botStatus" TYPE TEXT;

-- PASO B: Remapear valores legacy → canónicos
UPDATE "ChannelConfig"
SET "botStatus" = CASE
  WHEN "botStatus" = 'initializing'  THEN 'starting'
  WHEN "botStatus" = 'rate_limited'  THEN 'degraded'
  WHEN "botStatus" = 'webhook_error' THEN 'error'
  WHEN "botStatus" IN ('online', 'offline', 'error') THEN "botStatus"
  ELSE 'draft'
END;

-- PASO C: Eliminar enum legacy y crear el canónico
DROP TYPE IF EXISTS "BotStatus";
CREATE TYPE "BotStatus" AS ENUM (
  'draft',
  'configured',
  'provisioning',
  'needsauth',
  'starting',
  'online',
  'degraded',
  'offline',
  'error',
  'deprovisioned'
);

-- PASO D: Volver a asignar el tipo enum a la columna
ALTER TABLE "ChannelConfig"
  ALTER COLUMN "botStatus" TYPE "BotStatus"
  USING "botStatus"::"BotStatus";

-- PASO E: Sincronizar isActive derivado
-- isActive = botStatus IN (online, degraded) — invariante de AUDIT-25
UPDATE "ChannelConfig"
SET "isActive" = ("botStatus" IN ('online', 'degraded'));

-- PASO F: Actualizar el DEFAULT de la columna
ALTER TABLE "ChannelConfig"
  ALTER COLUMN "botStatus" SET DEFAULT 'draft'::"BotStatus";

COMMIT;

-- ============================================================
-- ROLLBACK (si es necesario — ejecutar ANTES de aplicar otros cambios)
-- BEGIN;
-- ALTER TABLE "ChannelConfig" ALTER COLUMN "botStatus" TYPE TEXT;
-- DROP TYPE IF EXISTS "BotStatus";
-- CREATE TYPE "BotStatus" AS ENUM ('initializing','online','offline','error','rate_limited','webhook_error');
-- ALTER TABLE "ChannelConfig"
--   ALTER COLUMN "botStatus" TYPE "BotStatus"
--   USING "botStatus"::"BotStatus";
-- COMMIT;
-- ============================================================
