-- ============================================================
-- MIGRACIÓN MANUAL: botstatus-canonical-enum
-- Archivo: prisma/migrations/manual/botstatus-canonical-enum.sql
--
-- PROPÓSITO: Reemplazar el enum BotStatus legacy por el enum
-- canónico definido en AUDIT-25. PostgreSQL no permite cambiar
-- valores de un enum con ALTER TYPE directamente si la columna
-- está en uso, por eso se sigue el patrón TEXT → UPDATE → enum.
--
-- PUNTO DE MÁXIMO RIESGO — EJECUTAR EN ESTE ORDEN EXACTO:
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
-- Esto nos permite hacer el UPDATE de remapeo sin restricciones del enum.
ALTER TABLE "ChannelConfig" ALTER COLUMN "botStatus" TYPE TEXT;

-- PASO B: Remapear valores legacy → canónicos
-- Cualquier valor no listado cae en 'draft' (fallback seguro).
UPDATE "ChannelConfig"
SET "botStatus" = CASE
  WHEN "botStatus" = 'initializing'  THEN 'starting'      -- más cercano semánticamente
  WHEN "botStatus" = 'rate_limited'  THEN 'degraded'      -- degradación parcial de servicio
  WHEN "botStatus" = 'webhook_error' THEN 'error'         -- error crítico de conectividad
  WHEN "botStatus" IN ('online', 'offline', 'error') THEN "botStatus"  -- sin cambio
  ELSE 'draft'                                            -- fallback seguro para valores desconocidos
END;

-- PASO C: Eliminar el enum legacy y crear el canónico
-- Prisma generará esto al hacer migrate dev -- verificar que el
-- SQL generado incluya TODOS los valores del enum canónico antes de ejecutar.
-- Si Prisma genera DROP TYPE + CREATE TYPE, el orden A/B/C es correcto.
-- Si Prisma genera ALTER TYPE ... ADD VALUE, el PASO A/B no es necesario
-- pero el UPDATE del PASO B sigue siendo obligatorio para los valores eliminados.
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

-- PASO E: Sincronizar isActive derivado para datos existentes
-- isActive = botStatus IN (online, degraded) — invariante de AUDIT-25
UPDATE "ChannelConfig"
SET "isActive" = ("botStatus" IN ('online', 'degraded'));

-- PASO F: Actualizar el DEFAULT de la columna al nuevo valor canónico
ALTER TABLE "ChannelConfig"
  ALTER COLUMN "botStatus" SET DEFAULT 'draft'::"BotStatus";

COMMIT;

-- ============================================================
-- ROLLBACK (si es necesario — ejecutar ANTES de que otro proceso
-- escriba datos con el nuevo enum):
-- BEGIN;
-- ALTER TABLE "ChannelConfig" ALTER COLUMN "botStatus" TYPE TEXT;
-- DROP TYPE IF EXISTS "BotStatus";
-- CREATE TYPE "BotStatus" AS ENUM ('initializing','online','offline','error','rate_limited','webhook_error');
-- UPDATE "ChannelConfig" SET "botStatus" = CASE
--   WHEN "botStatus" = 'starting'  THEN 'initializing'
--   WHEN "botStatus" = 'degraded'  THEN 'rate_limited'
--   WHEN "botStatus" = 'draft'     THEN 'initializing'
--   WHEN "botStatus" = 'configured' THEN 'initializing'
--   WHEN "botStatus" = 'provisioning' THEN 'initializing'
--   WHEN "botStatus" = 'needsauth' THEN 'initializing'
--   WHEN "botStatus" = 'deprovisioned' THEN 'offline'
--   ELSE "botStatus"
-- END;
-- ALTER TABLE "ChannelConfig" ALTER COLUMN "botStatus" TYPE "BotStatus" USING "botStatus"::"BotStatus";
-- ALTER TABLE "ChannelConfig" ALTER COLUMN "botStatus" SET DEFAULT 'initializing'::"BotStatus";
-- COMMIT;
-- ============================================================
