/**
 * auth.router.ts — Endpoints de autenticación local
 *
 * Registrar en el entry point del API:
 *   app.use('/api/auth', authRouter);
 *
 * IMPORTANTE: Estas rutas deben estar EXCLUIDAS del middleware JWT.
 * Ver applySecurityMiddleware() en security.middleware.ts.
 *
 * Rutas:
 *   POST /api/auth/login    — devuelve JWT local
 *   POST /api/auth/register — solo si ALLOW_REGISTER=true
 */

import { Router } from 'express';
import { loginLocal, registerLocal } from './auth.service.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ ok: false, error: 'email and password required' });
      return;
    }
    const result = await loginLocal(email, password);
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    res.status(401).json({ ok: false, error: message });
  }
});

// POST /api/auth/register  (solo si ALLOW_REGISTER=true)
authRouter.post('/register', async (req, res) => {
  if (process.env.ALLOW_REGISTER !== 'true') {
    res.status(403).json({ ok: false, error: 'Registration disabled' });
    return;
  }
  try {
    const { email, password, name } = req.body as {
      email?: string;
      password?: string;
      name?: string;
    };
    if (!email || !password) {
      res.status(400).json({ ok: false, error: 'email and password required' });
      return;
    }
    const user = await registerLocal(email, password, name);
    res.status(201).json({ ok: true, user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    res.status(409).json({ ok: false, error: message });
  }
});
