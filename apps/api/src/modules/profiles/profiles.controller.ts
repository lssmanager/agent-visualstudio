/**
 * ProfilesController
 *
 * CRUD de AgentProfile vía ProfilePropagatorService.
 *
 *   GET    /profiles/:agentId          → getProfile(agentId)
 *   POST   /profiles/:agentId/propagate → propagate(agentId, body)
 *   GET    /profiles/:agentId/prompt    → resolveForAgent(agentId) → { systemPrompt }
 *   DELETE /profiles/:agentId          → deleteProfile(agentId)
 *   GET    /profiles                   → listByWorkspace(workspaceId)
 *
 * X-Workspace-Id header requerido para /profiles (list).
 */

import type { Router, Request, Response } from 'express'
import { getPrisma } from '../../lib/prisma.js'
import { ProfilePropagatorService } from '@lss/profile-engine'

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ ok: true, data })
}
function err(res: Response, message: string, status = 400) {
  res.status(status).json({ ok: false, error: message })
}
function svc() {
  return new ProfilePropagatorService(getPrisma())
}

export function registerProfilesRoutes(router: Router): void {

  // GET /profiles
  router.get('/profiles', async (req, res) => {
    try {
      const workspaceId = req.headers['x-workspace-id'] as string | undefined
      if (!workspaceId) return err(res, 'Missing X-Workspace-Id header')
      ok(res, await svc().listByWorkspace(workspaceId))
    } catch (e) { err(res, String(e), 500) }
  })

  // GET /profiles/:agentId
  router.get('/profiles/:agentId', async (req, res) => {
    try {
      const profile = await svc().getProfile(req.params.agentId)
      if (!profile) return err(res, 'Profile not found', 404)
      ok(res, profile)
    } catch (e) { err(res, String(e), 500) }
  })

  // POST /profiles/:agentId/propagate
  router.post('/profiles/:agentId/propagate', async (req, res) => {
    try {
      const profile = await svc().propagate(req.params.agentId, req.body)
      ok(res, profile, 201)
    } catch (e) { err(res, String(e), 400) }
  })

  // GET /profiles/:agentId/prompt
  router.get('/profiles/:agentId/prompt', async (req, res) => {
    try {
      const result = await svc().resolveForAgent(req.params.agentId)
      ok(res, result)
    } catch (e) { err(res, String(e), 400) }
  })

  // DELETE /profiles/:agentId
  router.delete('/profiles/:agentId', async (req, res) => {
    try {
      const deleted = await svc().deleteProfile(req.params.agentId)
      if (!deleted) return err(res, 'Profile not found', 404)
      ok(res, { deleted: true })
    } catch (e) { err(res, String(e), 500) }
  })
}
