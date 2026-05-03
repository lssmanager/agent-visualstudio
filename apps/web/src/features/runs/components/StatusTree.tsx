/**
 * StatusTree
 *
 * Árbol jerárquico de estado para un run específico.
 * Cruza los StepUpdate del hook SSE (useRealtimeRun) con el árbol
 * canónico para mostrar qué agente en qué nivel jerárquico está activo.
 *
 * ESTRUCTURA REAL DE CanonicalStudioState (flat, no nested):
 *   state.agency          → AgencySpec { id, name, departmentIds[] }
 *   state.departments[]   → DepartmentSpec { id, agencyId, name, workspaceIds[] }
 *   state.workspaces[]    → CanonicalWorkspaceSpec { id, name, departmentId, agentIds[] }
 *   state.agents[]        → AgentSpec { id, name, workspaceId }
 *
 * CAMPOS REALES DE StepUpdate (de useRealtimeRun.ts):
 *   stepId, nodeId, nodeType?, agentId?, status, costUsd?,
 *   tokenUsage?: { input, output }, startedAt?, completedAt?
 *
 * VALORES DE status EN StepUpdate:
 *   'running' | 'processing' | 'active'  → NodeRunStatus 'active'
 *   'completed' | 'success'              → NodeRunStatus 'completed'
 *   'failed' | 'error'                   → NodeRunStatus 'failed'
 *   others                               → NodeRunStatus 'pending'
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, LayoutGrid, Cpu, Bot,
  Loader2, CheckCircle, XCircle, Clock, MinusCircle,
  ChevronRight,
} from 'lucide-react';
import { useRealtimeRun, type StepUpdate } from '../useRealtimeRun';
import { getCanonicalStudioState } from '../../../lib/api';
import type {
  CanonicalStudioStateResponse,
  AgencySpec,
  DepartmentSpec,
} from '../../../lib/types';
import type { CanonicalWorkspaceSpec } from '../../../../../packages/core-types/src/canonical-studio-state';
import type { AgentSpec } from '../../../../../packages/core-types/src/agent-spec';

// ── Tipos internos ────────────────────────────────────────────────────

type NodeLevel = 'agency' | 'department' | 'workspace' | 'agent';
type NodeRunStatus = 'active' | 'completed' | 'failed' | 'pending' | 'idle';

interface StatusNode {
  id:        string;
  name:      string;
  level:     NodeLevel;
  children:  StatusNode[];
  runStatus: NodeRunStatus;
  /** Solo para level === 'agent' */
  steps:     StepUpdate[];
}

// ── Constantes visuales ───────────────────────────────────────────────

const LEVEL_ICON: Record<NodeLevel, React.FC<{ size: number; color: string; style?: React.CSSProperties }>> = {
  agency:     Building2,
  department: LayoutGrid,
  workspace:  Cpu,
  agent:      Bot,
};

const LEVEL_COLOR: Record<NodeLevel, string> = {
  agency:     '#2563eb',
  department: '#7c3aed',
  workspace:  '#059669',
  agent:      '#d97706',
};

const LEVEL_INDENT: Record<NodeLevel, number> = {
  agency:     0,
  department: 14,
  workspace:  28,
  agent:      42,
};

const STATUS_COLOR: Record<NodeRunStatus, string> = {
  active:    '#2563eb',
  completed: '#16a34a',
  failed:    '#dc2626',
  pending:   '#d97706',
  idle:      '#d1d5db',
};

// ── buildAgentIndex ───────────────────────────────────────────────────

interface AgentAncestry {
  agencyId:      string;
  agencyName:    string;
  deptId:        string;
  deptName:      string;
  workspaceId:   string;
  workspaceName: string;
  agentId:       string;
  agentName:     string;
}

/**
 * Construye Map<agentId, AgentAncestry> desde la estructura flat real:
 *   departments[] + workspaces[] + agents[]
 * Usa workspaces[].agentIds[] para el link workspace→agent.
 */
function buildAgentIndex(
  state: CanonicalStudioStateResponse,
): Map<string, AgentAncestry> {
  const index = new Map<string, AgentAncestry>();

  const agentMap = new Map<string, AgentSpec>();
  for (const ag of state.agents ?? []) {
    agentMap.set(ag.id, ag);
  }

  const deptMap = new Map<string, DepartmentSpec>();
  for (const dept of state.departments ?? []) {
    deptMap.set(dept.id, dept);
  }

  for (const ws of (state.workspaces as CanonicalWorkspaceSpec[]) ?? []) {
    const dept = deptMap.get(ws.departmentId);
    for (const agentId of ws.agentIds ?? []) {
      const agent = agentMap.get(agentId);
      if (!agent) continue;
      index.set(agentId, {
        agencyId:      state.agency?.id ?? '',
        agencyName:    state.agency?.name ?? state.agency?.id ?? '',
        deptId:        dept?.id ?? ws.departmentId,
        deptName:      dept?.name ?? ws.departmentId,
        workspaceId:   ws.id,
        workspaceName: ws.name ?? ws.id,
        agentId:       agent.id,
        agentName:     agent.name ?? agent.id,
      });
    }
  }

  return index;
}

// ── buildStatusTree ───────────────────────────────────────────────────

function stepToRunStatus(status: string): NodeRunStatus {
  if (status === 'running' || status === 'processing' || status === 'active') return 'active';
  if (status === 'completed' || status === 'success') return 'completed';
  if (status === 'failed' || status === 'error') return 'failed';
  return 'pending';
}

function mergeStatuses(statuses: NodeRunStatus[]): NodeRunStatus {
  if (statuses.length === 0) return 'idle';
  if (statuses.some(s => s === 'active'))     return 'active';
  if (statuses.some(s => s === 'failed'))     return 'failed';
  if (statuses.every(s => s === 'idle'))      return 'idle';
  if (statuses.every(s => s === 'completed')) return 'completed';
  return 'pending';
}

/**
 * Construye el árbol StatusNode[] (4 niveles) desde el estado canónico flat
 * enriquecido con el runStatus derivado de los steps SSE del run.
 */
function buildStatusTree(
  state:    CanonicalStudioStateResponse,
  stepsMap: Map<string, StepUpdate>,
): StatusNode[] {
  // Agrupar steps por agentId
  const stepsByAgent = new Map<string, StepUpdate[]>();
  for (const step of stepsMap.values()) {
    if (!step.agentId) continue;
    const arr = stepsByAgent.get(step.agentId) ?? [];
    arr.push(step);
    stepsByAgent.set(step.agentId, arr);
  }

  const agentMap  = new Map<string, AgentSpec>();
  for (const ag of state.agents ?? []) agentMap.set(ag.id, ag);

  const wsMap = new Map<string, CanonicalWorkspaceSpec>();
  for (const ws of (state.workspaces as CanonicalWorkspaceSpec[]) ?? []) wsMap.set(ws.id, ws);

  const deptMap = new Map<string, DepartmentSpec>();
  for (const dept of state.departments ?? []) deptMap.set(dept.id, dept);

  const agency = state.agency;
  if (!agency) return [];

  const deptNodes: StatusNode[] = (state.departments ?? []).map((dept) => {
    const wsNodes: StatusNode[] = (dept.workspaceIds ?? []).flatMap((wsId) => {
      const ws = wsMap.get(wsId);
      if (!ws) return [];

      const agentNodes: StatusNode[] = (ws.agentIds ?? []).flatMap((agId) => {
        const agent = agentMap.get(agId);
        if (!agent) return [];
        const agentSteps = stepsByAgent.get(agId) ?? [];
        const agentStatus: NodeRunStatus =
          agentSteps.length === 0
            ? 'idle'
            : mergeStatuses(agentSteps.map(s => stepToRunStatus(s.status)));
        return [{
          id:        agent.id,
          name:      agent.name ?? agent.id,
          level:     'agent' as NodeLevel,
          children:  [],
          runStatus: agentStatus,
          steps:     agentSteps,
        }];
      });

      return [{
        id:        ws.id,
        name:      ws.name ?? ws.id,
        level:     'workspace' as NodeLevel,
        children:  agentNodes,
        runStatus: mergeStatuses(agentNodes.map(n => n.runStatus)),
        steps:     [],
      }];
    });

    return {
      id:        dept.id,
      name:      dept.name ?? dept.id,
      level:     'department' as NodeLevel,
      children:  wsNodes,
      runStatus: mergeStatuses(wsNodes.map(n => n.runStatus)),
      steps:     [],
    };
  });

  return [{
    id:        agency.id,
    name:      agency.name ?? agency.id,
    level:     'agency' as NodeLevel,
    children:  deptNodes,
    runStatus: mergeStatuses(deptNodes.map(n => n.runStatus)),
    steps:     [],
  }];
}

// ── StatusNodeRow ─────────────────────────────────────────────────────

interface StatusNodeRowProps {
  node:     StatusNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}

function StatusNodeRow({ node, expanded, onToggle }: StatusNodeRowProps) {
  const isExpanded  = expanded.has(node.id);
  const hasChildren = node.children.length > 0 || (node.level === 'agent' && node.steps.length > 0);
  const LevelIcon   = LEVEL_ICON[node.level];
  const statusColor = STATUS_COLOR[node.runStatus];
  const levelColor  = LEVEL_COLOR[node.level];
  const indent      = LEVEL_INDENT[node.level];

  const rowBg =
    node.runStatus === 'active' ? '#eff6ff' :
    node.runStatus === 'failed' ? '#fef2f2' :
    'transparent';

  const StatusIconEl = () => {
    const props = { size: 12, color: statusColor };
    switch (node.runStatus) {
      case 'active':    return <Loader2    {...props} className="animate-spin" />;
      case 'completed': return <CheckCircle {...props} />;
      case 'failed':    return <XCircle    {...props} />;
      case 'pending':   return <Clock      {...props} />;
      default:          return <MinusCircle {...props} />;
    }
  };

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        tabIndex={0}
        onClick={() => hasChildren && onToggle(node.id)}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && hasChildren) {
            e.preventDefault();
            onToggle(node.id);
          }
        }}
        style={{
          display:         'flex',
          alignItems:      'center',
          gap:             '6px',
          padding:         `6px 8px 6px ${8 + indent}px`,
          borderRadius:    '6px',
          backgroundColor: rowBg,
          cursor:          hasChildren ? 'pointer' : 'default',
          outline:         'none',
          transition:      'background-color 150ms',
        }}
      >
        {/* Chevron */}
        <span style={{
          width: 14, flexShrink: 0,
          opacity:   hasChildren ? 1 : 0,
          transform: isExpanded  ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 150ms',
          display: 'flex', alignItems: 'center',
        }}>
          <ChevronRight size={11} color="#94a3b8" />
        </span>

        {/* Icono nivel */}
        <LevelIcon size={13} color={levelColor} style={{ flexShrink: 0 }} />

        {/* Nombre */}
        <span style={{
          fontSize:   '11px',
          flex:       1,
          overflow:   'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color:      node.runStatus === 'idle' ? '#9ca3af' : '#374151',
          fontWeight: node.runStatus === 'active' ? 600 : 400,
          maxWidth:   '150px',
        }} title={node.name}>
          {node.name}
        </span>

        {/* Status icon */}
        <StatusIconEl />

        {/* Conteo de steps (solo agents) */}
        {node.level === 'agent' && node.steps.length > 0 && (
          <span style={{ fontSize: '10px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
            {node.steps.length}
          </span>
        )}
      </div>

      {/* Steps individuales del agente (cuando está expandido) */}
      {node.level === 'agent' && isExpanded && node.steps.length > 0 && (
        <div style={{ paddingLeft: `${8 + indent + 28}px`, paddingTop: '2px', paddingBottom: '4px' }}>
          {node.steps.map(step => {
            const sStatus = stepToRunStatus(step.status);
            const sColor  = STATUS_COLOR[sStatus];
            return (
              <div
                key={step.stepId}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}
              >
                {sStatus === 'active'
                  ? <Loader2     size={10} color={sColor} className="animate-spin" />
                  : sStatus === 'completed'
                  ? <CheckCircle size={10} color={sColor} />
                  : sStatus === 'failed'
                  ? <XCircle    size={10} color={sColor} />
                  : <Clock      size={10} color={sColor} />}
                <span style={{
                  fontSize:     '11px',
                  color:        '#64748b',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                  flex: 1,
                }}>
                  {step.nodeType ?? step.nodeId ?? step.stepId}
                </span>
                {step.costUsd !== undefined && (
                  <span style={{ fontSize: '10px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>
                    ${step.costUsd.toFixed(4)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Hijos (cuando está expandido) */}
      {node.children.length > 0 && isExpanded && node.children.map(child => (
        <StatusNodeRow
          key={child.id}
          node={child}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

// ── StatusTree (componente público) ──────────────────────────────────

export interface StatusTreeProps {
  runId: string;
}

export function StatusTree({ runId }: StatusTreeProps) {
  const { status, steps, error: sseError } = useRealtimeRun(runId);

  const [canonicalState, setCanonicalState] = useState<CanonicalStudioStateResponse | null>(null);
  const [loadingTree,    setLoadingTree]     = useState(false);
  const [treeError,      setTreeError]       = useState<string | null>(null);
  const [expanded,       setExpanded]        = useState<Set<string>>(new Set());
  const mounted = useRef(true);

  // Carga el árbol canónico una sola vez
  useEffect(() => {
    mounted.current = true;
    setLoadingTree(true);
    getCanonicalStudioState()
      .then((state) => {
        if (!mounted.current) return;
        setCanonicalState(state as CanonicalStudioStateResponse);
        // Auto-expandir agency y todos los departamentos
        const ids = new Set<string>();
        if ((state as CanonicalStudioStateResponse).agency?.id) {
          ids.add((state as CanonicalStudioStateResponse).agency.id);
        }
        for (const dept of (state as CanonicalStudioStateResponse).departments ?? []) {
          ids.add(dept.id);
        }
        setExpanded(ids);
      })
      .catch((e: Error) => {
        if (mounted.current) setTreeError(e.message);
      })
      .finally(() => {
        if (mounted.current) setLoadingTree(false);
      });
    return () => { mounted.current = false; };
  }, []);

  const tree = useMemo(() => {
    if (!canonicalState) return [];
    return buildStatusTree(canonicalState, steps);
  }, [canonicalState, steps]);

  const handleToggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Color del indicador SSE
  const sseColor =
    status === 'connected' || status === 'processing' ? '#16a34a' :
    status === 'completed'                            ? '#2563eb' :
    status === 'failed'    || status === 'error'      ? '#dc2626' :
    '#d97706';

  // Totales de tokens
  const tokenTotals = useMemo(() => {
    let totalIn = 0, totalOut = 0;
    for (const step of steps.values()) {
      totalIn  += step.tokenUsage?.input  ?? 0;
      totalOut += step.tokenUsage?.output ?? 0;
    }
    return totalIn + totalOut > 0 ? { in: totalIn, out: totalOut } : null;
  }, [steps]);

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      background:    '#fff',
      borderRadius:  '8px',
      border:        '1px solid #e2e8f0',
      overflow:      'hidden',
    }}>
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '6px 12px',
        borderBottom:   '1px solid #f1f5f9',
        background:     '#f8fafc',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Building2 size={13} color="#2563eb" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Hierarchy Status</span>
        </div>
        <span style={{
          fontSize:        '10px',
          padding:         '2px 6px',
          borderRadius:    '9999px',
          fontWeight:      500,
          color:           sseColor,
          backgroundColor: `${sseColor}18`,
        }}>
          {status}
        </span>
      </div>

      {/* Leyenda */}
      <div style={{
        display:     'flex',
        gap:         '10px',
        padding:     '4px 12px',
        borderBottom: '1px solid #f8fafc',
        background:  '#fff',
      }}>
        {(['active', 'completed', 'failed', 'idle'] as NodeRunStatus[]).map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            {s === 'active'    && <Loader2     size={9} color={STATUS_COLOR[s]} className="animate-spin" />}
            {s === 'completed' && <CheckCircle  size={9} color={STATUS_COLOR[s]} />}
            {s === 'failed'    && <XCircle     size={9} color={STATUS_COLOR[s]} />}
            {s === 'idle'      && <MinusCircle  size={9} color={STATUS_COLOR[s]} />}
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{s}</span>
          </div>
        ))}
      </div>

      {/* Árbol */}
      <div
        role="tree"
        aria-label="Run hierarchy status"
        style={{ flex: 1, overflowY: 'auto', padding: '4px' }}
      >
        {loadingTree && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>
            <Loader2 size={12} className="animate-spin" />
            Loading hierarchy…
          </div>
        )}

        {(treeError || sseError) && (
          <div style={{ padding: '8px 12px', fontSize: '11px', color: '#dc2626' }}>
            {treeError ?? sseError}
          </div>
        )}

        {!loadingTree && !treeError && tree.length === 0 && (
          <div style={{ padding: '16px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
            No hierarchy data.
          </div>
        )}

        {tree.map(node => (
          <StatusNodeRow
            key={node.id}
            node={node}
            expanded={expanded}
            onToggle={handleToggle}
          />
        ))}
      </div>

      {/* Footer: tokens totales */}
      {tokenTotals && (
        <div style={{
          display:     'flex',
          gap:         '10px',
          padding:     '6px 12px',
          borderTop:   '1px solid #f1f5f9',
          background:  '#f8fafc',
          fontSize:    '10px',
          color:       '#64748b',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span>Tokens in: <b style={{ color: '#374151' }}>{tokenTotals.in.toLocaleString()}</b></span>
          <span>out: <b style={{ color: '#374151' }}>{tokenTotals.out.toLocaleString()}</b></span>
        </div>
      )}
    </div>
  );
}
