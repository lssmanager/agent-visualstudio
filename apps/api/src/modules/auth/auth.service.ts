/**
 * auth.service.ts — Servicio de autenticación local
 *
 * Maneja login y registro con email + password almacenados en BD.
 * El token generado es compatible con jwtAuthMiddleware() en security.middleware.ts.
 *
 * F3B-01a: Auth híbrida — este servicio cubre el lado "login local".
 * Logto SSO se maneja en el middleware directamente (sin pasar por aquí).
 */

import { PrismaClient } from '@prisma/client';
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
 * Valida email + password contra la BD y emite un JWT local.
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

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  const payload: LocalTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    iss: 'agent-studio-local',
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
  return { token, user: { id: user.id, email: user.email, role: user.role } };
}

/**
 * Registra un nuevo usuario con email + password.
 * Solo disponible cuando ALLOW_REGISTER=true en el entorno.
 * Lanza Error('Email already registered') si el email ya existe.
 */
export async function registerLocal(
  email: string,
  password: string,
  name?: string,
): Promise<{ id: string; email: string }> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('Email already registered');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });
  return { id: user.id, email: user.email };
}
