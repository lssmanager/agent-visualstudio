import { Router } from 'express';

import { AuditService } from './audit.service';

export function registerAuditRoutes(router: Router) {
  const service = new AuditService();

  // GET /audit?resource=&action=&from=&to=
  router.get('/audit', (req, res) => {
    const entries = service.query({
      resource: req.query.resource as string | undefined,
      action:   req.query.action   as string | undefined,
      from:     req.query.from     as string | undefined,
      to:       req.query.to       as string | undefined,
    });
    res.json(entries);
  });

  // GET /audit/channel-messages?channelId=&direction=inbound|outbound&from=&to=&limit=
  router.get('/audit/channel-messages', (req, res) => {
    const entries = service.queryChannelMessages({
      channelId: req.query.channelId as string | undefined,
      direction: req.query.direction as 'inbound' | 'outbound' | undefined,
      from:      req.query.from      as string | undefined,
      to:        req.query.to        as string | undefined,
      limit:     req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });
    res.json(entries);
  });

  // GET /audit/channel/:channelId — all provisioned+error events for one channel
  router.get('/audit/channel/:channelId', (req, res) => {
    const { channelId } = req.params;
    const entries = service
      .query({
        resource: 'channel',
        from:     req.query.from as string | undefined,
        to:       req.query.to   as string | undefined,
      })
      .filter((e) => e.resourceId === channelId);
    res.json(entries);
  });
}
