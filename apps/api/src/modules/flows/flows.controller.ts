import { Router } from 'express';

import { FlowsService } from './flows.service';

export function registerFlowsRoutes(router: Router) {
  const service = new FlowsService();

  router.get('/flows', (_req, res) => {
    res.json(service.findAll());
  });

  router.get('/flows/:id', (req, res) => {
    const item = service.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ ok: false, error: 'Flow not found' });
    }
    return res.json(item);
  });

  router.post('/flows', (req, res) => {
    try {
      return res.status(201).json(service.create(req.body));
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  router.put('/flows/:id', (req, res) => {
    try {
      const item = service.update(req.params.id, req.body);
      if (!item) {
        return res.status(404).json({ ok: false, error: 'Flow not found' });
      }
      return res.json(item);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  router.delete('/flows/:id', (req, res) => {
    const removed = service.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ ok: false, error: 'Flow not found' });
    }
    return res.status(204).send();
  });

  router.get('/flows/compiled', (_req, res) => {
    res.json(service.compile());
  });

  // POST /flows/:id/validate — validate flow graph
  router.post('/flows/:id/validate', (req, res) => {
    const flow = service.findById(req.params.id);
    if (!flow) {
      return res.status(404).json({ ok: false, error: 'Flow not found' });
    }

    const issues: Array<{ severity: 'error' | 'warning'; message: string; nodeId?: string }> = [];

    // Check for trigger node
    const hasTrigger = flow.nodes.some((n) => n.type === 'trigger');
    if (!hasTrigger) {
      issues.push({ severity: 'error', message: 'Flow must have at least one Trigger node' });
    }

    // Check for end node
    const hasEnd = flow.nodes.some((n) => n.type === 'end');
    if (!hasEnd) {
      issues.push({ severity: 'warning', message: 'Flow has no End node — execution will stop at last reachable node' });
    }

    // Check for disconnected nodes (no incoming or outgoing edges)
    const hasIncoming = new Set(flow.edges.map((e) => e.to));
    const hasOutgoing = new Set(flow.edges.map((e) => e.from));
    for (const node of flow.nodes) {
      if (node.type === 'trigger') continue; // Trigger has no incoming
      if (node.type === 'end') continue; // End may have no outgoing
      if (!hasIncoming.has(node.id) && !hasOutgoing.has(node.id)) {
        issues.push({ severity: 'error', message: `Node "${node.id}" is disconnected`, nodeId: node.id });
      }
    }

    // Check for cycles (simple DFS)
    const adjacency = new Map<string, string[]>();
    for (const edge of flow.edges) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      adjacency.get(edge.from)!.push(edge.to);
    }

    const visited = new Set<string>();
    const inStack = new Set<string>();
    let hasCycle = false;

    function dfs(nodeId: string) {
      if (hasCycle) return;
      visited.add(nodeId);
      inStack.add(nodeId);
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (inStack.has(neighbor)) {
          hasCycle = true;
          return;
        }
        if (!visited.has(neighbor)) dfs(neighbor);
      }
      inStack.delete(nodeId);
    }

    for (const node of flow.nodes) {
      if (!visited.has(node.id)) dfs(node.id);
    }

    if (hasCycle) {
      issues.push({ severity: 'error', message: 'Flow contains a cycle — execution would loop infinitely' });
    }

    // Check for empty flow
    if (flow.nodes.length === 0) {
      issues.push({ severity: 'error', message: 'Flow has no nodes' });
    }

    const valid = !issues.some((i) => i.severity === 'error');
    return res.json({ valid, issues });
  });
}
