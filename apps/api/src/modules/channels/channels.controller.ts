import {
  Body, Controller, Delete, Get, Param, Post, Res, Sse,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, fromEvent } from 'rxjs';
import { EventEmitter } from 'events';

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

@Controller('workspaces/:workspaceId')
export class ChannelsController {
  constructor(private readonly svc: ChannelsService) {}

  // ─── Channels ──────────────────────────────────────────────────────────────
  @Get('channels')
  list(@Param('workspaceId') wsId: string) {
    return this.svc.list(wsId);
  }

  @Post('channels/provision')
  provision(@Param('workspaceId') wsId: string, @Body() dto: ProvisionDto) {
    return this.svc.provision(wsId, dto);
  }

  @Post('channels/:id/bind')
  bind(
    @Param('workspaceId') wsId: string,
    @Param('id') id: string,
    @Body() dto: BindDto,
  ) {
    return this.svc.bind(wsId, id, dto.agentId);
  }

  @Get('channels/:id/status')
  status(@Param('workspaceId') wsId: string, @Param('id') id: string) {
    return this.svc.getStatus(wsId, id);
  }

  /** SSE endpoint — streams channel status changes in real time */
  @Get('channels/:id/status/stream')
  async statusStream(
    @Param('workspaceId') wsId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send current status immediately
    const current = this.svc.getStatus(wsId, id);
    res.write(`data: ${JSON.stringify(current)}\n\n`);

    const unsub = this.svc.addSseSubscriber(id, (data) => {
      res.write(`data: ${data}\n\n`);
    });

    res.on('close', () => { unsub(); res.end(); });
  }

  @Delete('channels/:id')
  remove(@Param('workspaceId') wsId: string, @Param('id') id: string) {
    this.svc.delete(wsId, id);
    return { ok: true };
  }

  // ─── LLM Providers ─────────────────────────────────────────────────────────
  @Get('llm-providers')
  listProviders(@Param('workspaceId') wsId: string) {
    return this.svc.listProviders(wsId);
  }

  @Post('llm-providers')
  upsertProvider(
    @Param('workspaceId') wsId: string,
    @Body() dto: UpsertProviderDto,
  ) {
    return this.svc.upsertProvider(wsId, dto);
  }

  @Delete('llm-providers/:providerId')
  deleteProvider(
    @Param('workspaceId') wsId: string,
    @Param('providerId') pid: string,
  ) {
    this.svc.deleteProvider(wsId, pid);
    return { ok: true };
  }
}
