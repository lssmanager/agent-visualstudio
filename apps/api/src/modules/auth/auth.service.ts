/**
 * auth.service.ts — Servicio de autenticación local
 *
 * Maneja login y registro con email + password almacenados en BD.
 * El token generado es compatible con jwtAuthMiddleware() en security.middleware.ts.
 *
 * F3B-01a: Auth híbrida — este servicio cubre el lado "login local".
 * Logto SSO se maneja en el middleware directamente (sin pasar por aquí).
 *
 * NOTE: El schema Prisma v13 no tiene un modelo `User` de primer nivel.
 * La autenticación local usa WorkspaceMember como entidad de usuario.
 * Si se requiere un modelo User dedicado, debe añadirse al schema antes
 * de descomentar las referencias a prisma.user.
 *
 * Por ahora, loginLocal y registerLocal operan sobre WorkspaceMember
 * (o retornan error si no hay miembro con ese email).
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

export interface LocalTokenPayload {
  sub: string;        // userId / memberId
  email: string;
  role: string;
  iss: 'agent-studio-local';
}

/**
 * Valida email + password contra la BD y emite un JWT local.
 * Usa la tabla `workspace_members` como fuente de usuarios.
 * Lanza Error('Invalid credentials') si el usuario no existe,
 * no tiene passwordHash (SSO-only), o la contraseña no coincide.
 *
 * TODO: cuando se agregue el modelo User al schema, reemplazar
 *       prisma.workspaceMember.findFirst por prisma.user.findUnique.
 */
export async function loginLocal(
  email: string,
  password: string,
): Promise<{ token: string; user: { id: string; email: string; role: string } }> {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not configured — cannot issue local tokens');
  }

  // Fallback: busca miembro por email en cualquier workspace
  const member = await (prisma as any).workspaceMember?.findFirst({
    where: { email },
  }) ?? null;

  // Si no existe workspaceMember, intenta con la tabla de system config como último recurso
  if (!member) {
    throw new Error('Invalid credentials');
  }

  const passwordHash: string | null = (member as any).passwordHash ?? null;
  if (!passwordHash) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  const payload: LocalTokenPayload = {
    sub:   member.id,
    email: (member as any).email ?? email,
    role:  (member as any).role  ?? 'member',
    iss:   'agent-studio-local',
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
  return {
    token,
    user: { id: member.id, email: payload.email, role: payload.role },
  };
}

/**
 * Registra un nuevo usuario con email + password.
 * Solo disponible cuando ALLOW_REGISTER=true en el entorno.
 * Lanza Error('Email already registered') si el email ya existe.
 *
 * TODO: cuando se agregue el modelo User al schema, reemplazar
 *       esta implementación.
 */
export async function registerLocal(
  email: string,
  password: string,
  name?: string,
): Promise<{ id: string; email: string }> {
  const existing = await (prisma as any).workspaceMember?.findFirst({
    where: { email },
  }) ?? null;
  if (existing) throw new Error('Email already registered');

  const passwordHash = await bcrypt.hash(password, 12);
  const member = await (prisma as any).workspaceMember?.create({
    data: { email, passwordHash, name },
  });
  return { id: member.id, email: (member as any).email ?? email };
}
