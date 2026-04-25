import type { Router, Request, Response } from 'express';
// import {
//   Body, Controller, Delete, Get, Param, Post, Res, Sse,
// } from '@nestjs/common';
// Commented out: NestJS decorators are not compatible with Express-style routing

// import type { Response } from 'express';
// import { Observable, fromEvent } from 'rxjs';
// import { EventEmitter } from 'events';

import { ChannelsService } from './channels.service';

interface ProvisionDto {
  kind: 'telegram' | 'whatsapp' | 'discord' | 'webchat';
  name: string;
  token?: string;
  appId?: string;
  secret?: string;
}

interface BindDto { agentId: string }
interface UpsertProviderDto {
  provider: string;
  label: string;
  apiKey: string;
  isDefault?: boolean;
}

// const svc = new ChannelsService();
// Note: ChannelsService requires PrismaService dependency - instantiation moved to module injection
const svc = null as any;

export function registerChannelsRoutes(router: Router): void {
  // ─── Channels ──────────────────────────────────────────────────────────────
  router.get('/workspaces/:workspaceId/channels', async (req: Request, res: Response) => {
    try {
      // Note: ChannelsService methods need to be updated to accept workspaceId parameter
      // const result = await svc.list(req.params.workspaceId);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/workspaces/:workspaceId/channels/provision', async (req: Request, res: Response) => {
    try {
      // const dto = req.body as ProvisionDto;
      // const result = await svc.provision(req.params.workspaceId, dto);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/workspaces/:workspaceId/channels/:id/bind', async (req: Request, res: Response) => {
    try {
      // const dto = req.body as BindDto;
      // const result = await svc.bind(req.params.workspaceId, req.params.id, dto.agentId);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/workspaces/:workspaceId/channels/:id/status', async (req: Request, res: Response) => {
    try {
      // const result = await svc.getStatus(req.params.workspaceId, req.params.id);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/workspaces/:workspaceId/channels/:id/status/stream', async (req: Request, res: Response) => {
    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      // Send current status immediately
      // const current = await svc.getStatus(req.params.workspaceId, req.params.id);
      // res.write(`data: ${JSON.stringify(current)}\n\n`);
      // const unsub = svc.addSseSubscriber(req.params.id, (data) => {
      //   res.write(`data: ${data}\n\n`);
      // });
      // res.on('close', () => { unsub(); res.end(); });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.delete('/workspaces/:workspaceId/channels/:id', async (req: Request, res: Response) => {
    try {
      // await svc.delete(req.params.workspaceId, req.params.id);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ─── LLM Providers ─────────────────────────────────────────────────────────
  router.get('/workspaces/:workspaceId/llm-providers', async (req: Request, res: Response) => {
    try {
      // const result = await svc.listProviders(req.params.workspaceId);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/workspaces/:workspaceId/llm-providers', async (req: Request, res: Response) => {
    try {
      // const dto = req.body as UpsertProviderDto;
      // const result = await svc.upsertProvider(req.params.workspaceId, dto);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.delete('/workspaces/:workspaceId/llm-providers/:providerId', async (req: Request, res: Response) => {
    try {
      // await svc.deleteProvider(req.params.workspaceId, req.params.providerId);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}
