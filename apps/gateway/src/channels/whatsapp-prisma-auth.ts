/**
 * whatsapp-prisma-auth.ts — Baileys auth state persisted in Prisma (D-22b)
 * [F5-02]
 *
 * Reemplaza useMultiFileAuthState() de @whiskeysockets/baileys con una
 * implementación que lee/escribe las credenciales Baileys en la tabla
 * GatewaySession de Prisma, cumpliendo D-22b (nada al filesystem).
 *
 * Estrategia de clave:
 *   GatewaySession es unique en (channelConfigId, externalUserId).
 *   Para el registro de credenciales Baileys usamos:
 *     externalUserId = '__baileys_creds__'
 *     agentId        = 'system'
 *   Esto permite upsert sin migración adicional al schema.
 *
 * Keys (Signal Protocol):
 *   Las keys de Signal se mantienen en memoria — se regeneran automáticamente
 *   en cada sesión sin pérdida funcional. Solo las creds determinan si se
 *   necesita un nuevo QR. Esta es la estrategia correcta para F5-02.
 */

import type { PrismaClient } from '@prisma/client'

// ── Tipos de Baileys (compatibles — no requieren instalación del paquete
//    para compilar este módulo; se usan en tiempo de ejecución vía dynamic import)

export interface AuthenticationCreds {
  noiseKey:            unknown
  pairingEphemeralKeyPair: unknown
  signedIdentityKey:   unknown
  signedPreKey:        unknown
  registrationId:      number
  advSecretKey:        string
  nextPreKeyId:        number
  firstUnappendedPreKeyId: number
  serverHasPreKeys:    boolean
  account:             unknown
  me?:                 { id: string; name?: string }
  signalIdentities?:   unknown[]
  myAppStateKeyId?:    string
  firstAppStateSyncKeyId?: string
  appStateSyncKeyId?:  string
  accountSettings?:    unknown
  deviceId?:           string
  phoneId?:            string
  identityId?:         Buffer
  registered?:         boolean
  backupToken?:        Buffer
  registration?:       unknown
  pairingCode?:        string
  lastPropHash?:       string
  routingInfo?:        Buffer
}

export interface AuthState {
  creds: AuthenticationCreds
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keys:  any
}

export interface BaileysAuthStateResult {
  state:     AuthState
  saveCreds: () => Promise<void>
}

// ── Constantes de clave canónica ────────────────────────────────────────────

const BAILEYS_CREDS_USER_ID = '__baileys_creds__'
const BAILEYS_SYSTEM_AGENT  = 'system'

// ── usePrismaAuthState ─────────────────────────────────────────────────────

/**
 * Construye el auth state de Baileys leyendo/escribiendo en Prisma.
 *
 * @param prisma          - PrismaClient (o PrismaService de NestJS)
 * @param channelConfigId - ID del ChannelConfig asociado al adapter
 */
export async function usePrismaAuthState(
  prisma:          PrismaClient,
  channelConfigId: string,
): Promise<BaileysAuthStateResult> {
  // ── Importar Baileys en tiempo de ejecución ─────────────────────────
  const baileys = await import('@whiskeysockets/baileys').catch((err: unknown) => {
    throw new Error(
      `[usePrismaAuthState] No se pudo cargar @whiskeysockets/baileys: ${String(err)}`,
    )
  })

  const { initAuthCreds, BufferJSON } = baileys as unknown as {
    initAuthCreds: () => AuthenticationCreds
    BufferJSON:    { replacer: (key: string, value: unknown) => unknown; reviver: (key: string, value: unknown) => unknown }
  }

  // ── Cargar credenciales desde BD ────────────────────────────────────
  const record = await (prisma as unknown as {
    gatewaySession: {
      findFirst: (args: unknown) => Promise<{ metadata: unknown } | null>
    }
  }).gatewaySession.findFirst({
    where: {
      channelConfigId,
      externalUserId: BAILEYS_CREDS_USER_ID,
    },
    select: { metadata: true },
  })

  let creds: AuthenticationCreds

  if (record?.metadata) {
    try {
      // Deserializar con BufferJSON.reviver para restaurar los Buffer de Baileys
      creds = JSON.parse(
        JSON.stringify(record.metadata),
        BufferJSON.reviver as (key: string, value: unknown) => unknown,
      ) as AuthenticationCreds
    } catch (err) {
      console.warn(
        `[usePrismaAuthState:${channelConfigId}] Creds corruptos en BD — generando nuevas:`,
        err,
      )
      creds = initAuthCreds()
    }
  } else {
    // Primera vez: iniciar con credenciales vacías → generará QR
    creds = initAuthCreds()
  }

  // Keys en memoria (Signal Protocol — se regeneran automáticamente)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keys: any = {}

  // ── saveCreds ───────────────────────────────────────────────────────
  const saveCreds = async (): Promise<void> => {
    const serialized = JSON.parse(JSON.stringify(creds, BufferJSON.replacer as (key: string, value: unknown) => unknown))

    await (prisma as unknown as {
      gatewaySession: {
        upsert: (args: unknown) => Promise<unknown>
      }
    }).gatewaySession.upsert({
      where: {
        channelConfigId_externalUserId: {
          channelConfigId,
          externalUserId: BAILEYS_CREDS_USER_ID,
        },
      },
      create: {
        channelConfigId,
        externalUserId: BAILEYS_CREDS_USER_ID,
        agentId:        BAILEYS_SYSTEM_AGENT,
        metadata:       serialized,
        status:         'connected',
      },
      update: {
        metadata:  serialized,
        status:    'connected',
        updatedAt: new Date(),
      },
    })
  }

  return {
    state: { creds, keys },
    saveCreds,
  }
}

// ── clearSessionInDb ────────────────────────────────────────────────────────

/**
 * Marca la sesión Baileys como logged_out en BD y elimina las credenciales.
 * La próxima connect() generará un nuevo QR.
 *
 * @param prisma          - PrismaClient
 * @param channelConfigId - ID del ChannelConfig
 */
export async function clearSessionInDb(
  prisma:          PrismaClient,
  channelConfigId: string,
): Promise<void> {
  await (prisma as unknown as {
    gatewaySession: {
      updateMany: (args: unknown) => Promise<unknown>
    }
  }).gatewaySession.updateMany({
    where: {
      channelConfigId,
      externalUserId: BAILEYS_CREDS_USER_ID,
    },
    data: {
      status:   'logged_out',
      metadata: null,
    },
  })

  console.info(
    `[usePrismaAuthState:${channelConfigId}] Session cleared in DB (logged_out)`,
  )
}
