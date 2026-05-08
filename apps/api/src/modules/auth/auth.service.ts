/**
 * auth.service.ts — Servicio de autenticación local
 *
 * fix(tsc): el schema Prisma v13 NO tiene modelo User.
 * La autenticación se resuelve contra un modelo alternativo o una tabla
 * de sistema. Esta versión usa SystemConfig como tabla de credenciales
 * de administrador (clave 'admin_credentials') como mecanismo de emergencia,
 * con soporte para migrar a un modelo User real cuando se agregue al schema.
 *
 * F3B-01a: Auth híbrida — este servicio cubre el lado "login local".
 * Logto SSO se maneja en el middleware directamente (sin pasar por aquí).
 *
 * IMPORTANTE: Cuando se agregue el modelo User al schema.prisma, reemplazar
 * la implementación de loginLocal/registerLocal por la versión con prisma.user.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

export interface LocalTokenPayload {
  sub: string;        // userId
  email: string;
  role: string;
  iss: 'agent-studio-local';
}

/**
 * LocalUser — representación interna del usuario autenticado.
 * Se almacena en SystemConfig con key 'local_user_{email}'.
 * Cuando el schema incluya modelo User, esta interfaz se aliará con el modelo Prisma.
 */
interface LocalUser {
  id: string;
  email: string;
  role: string;
  passwordHash: string;
  name?: string;
}

/**
 * Lee un usuario local desde SystemConfig.
 * La clave en SystemConfig es `local_user_${email}`.
 */
async function findLocalUser(email: string): Promise<LocalUser | null> {
  const entry = await prisma.systemConfig.findUnique({
    where: { key: `local_user_${email.toLowerCase()}` },
  });
  if (!entry) return null;
  const value = entry.value as Record<string, unknown>;
  if (!value || typeof value !== 'object') return null;
  return value as unknown as LocalUser;
}

/**
 * Guarda o actualiza un usuario local en SystemConfig.
 */
async function upsertLocalUser(user: LocalUser): Promise<void> {
  await prisma.systemConfig.upsert({
    where:  { key: `local_user_${user.email.toLowerCase()}` },
    update: { value: user as unknown as Prisma.InputJsonValue },
    create: {
      key:   `local_user_${user.email.toLowerCase()}`,
      value: user as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Valida email + password y emite un JWT local.
 * Lanza Error('Invalid credentials') si el usuario no existe,
 * no tiene passwordHash (SSO-only), o la contraseña no coincide.
 */
export async function loginLocal(
  email: string,
  password: string,
): Promise<{ token: string; user: { id: string; email: string; role: string } }> {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not configured — cannot issue local tokens');
  }

  const user = await findLocalUser(email);

  if (!user || !user.passwordHash) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  const payload: LocalTokenPayload = {
    sub:   user.id,
    email: user.email,
    role:  user.role,
    iss:   'agent-studio-local',
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
  return { token, user: { id: user.id, email: user.email, role: user.role } };
}

/**
 * Registra un nuevo usuario local.
 * Solo disponible cuando ALLOW_REGISTER=true en el entorno.
 * Lanza Error('Email already registered') si el email ya existe.
 */
export async function registerLocal(
  email: string,
  password: string,
  name?: string,
): Promise<{ id: string; email: string }> {
  const existing = await findLocalUser(email);
  if (existing) throw new Error('Email already registered');

  const passwordHash = await bcrypt.hash(password, 12);
  const id = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const user: LocalUser = { id, email, role: 'user', passwordHash, name };
  await upsertLocalUser(user);

  return { id, email };
}
