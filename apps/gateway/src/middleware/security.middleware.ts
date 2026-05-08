/**
 * security.middleware.ts
 * Fix TS2339: @types/jsonwebtoken@9 no tiene .default
 * Usar import * as jwt y llamar jwt.verify() directamente.
 */
import { Injectable, NestMiddleware } from '@nestjs/common'
import type { Request, Response, NextFunction } from 'express'
import * as jwt from 'jsonwebtoken'

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly secret: string

  constructor() {
    this.secret = process.env.GATEWAY_JWT_SECRET ?? 'insecure-default'
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization']
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' })
      return
    }

    const token = authHeader.slice(7)
    try {
      const payload = jwt.verify(token, this.secret)
      ;(req as Request & { jwtPayload?: unknown }).jwtPayload = payload
      next()
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' })
    }
  }

  sign(payload: Record<string, unknown>, expiresIn = '1h'): string {
    return jwt.sign(payload, this.secret, { expiresIn })
  }
}
