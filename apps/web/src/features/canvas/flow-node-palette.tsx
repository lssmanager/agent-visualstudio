/**
 * flow-node-palette.tsx
 * Panel lateral arrastrable con todos los FlowNodeKind.
 * Drag-and-drop hacia el canvas para crear nodos.
 *
 * Inspirado en: Flowise NodeInputHandler palette + n8n NodeCreator panel.
 */

import React, { useState } from 'react';

// Adjust import to shared types package once extracted:
// import { FLOW_NODE_PALETTE } from '@lss/core-types';
const FLOW_NODE_PALETTE: { kind: string; label: string; description: string; color: string; icon: string; group: string }[] = [
  { kind: 'Trigger',        label: 'Trigger',       description: 'Starts the flow',                      color: '#22c55e', icon: 'zap',         group: 'trigger' },
  { kind: 'Agent',          label: 'Agent',         description: 'Assigns work to an agent',             color: '#6366f1', icon: 'user',        group: 'agent' },
  { kind: 'SubAgent',       label: 'SubAgent',      description: 'Delegates to a sub-agent',             color: '#818cf8', icon: 'user-cog',   group: 'agent' },
  { kind: 'SupervisorNode', label: 'Supervisor',    description: 'Orchestrates multiple agents',         color: '#f59e0b', icon: 'crown',       group: 'agent' },
  { kind: 'Tool',           label: 'Tool',          description: 'Invokes a skill/tool directly',        color: '#14b8a6', icon: 'wrench',      group: 'integration' },
  { kind: 'N8nWebhook',     label: 'n8n Webhook',   description: 'Triggers an n8n workflow via webhook', color: '#e76e50', icon: 'webhook',     group: 'integration' },
  { kind: 'N8nWorkflow',    label: 'n8n Workflow',  description: 'Runs a full n8n workflow',             color: '#e76e50', icon: 'workflow',    group: 'integration' },
  { kind: 'LLMStep',        label: 'LLM Step',      description: 'Direct LLM call with prompt template', color: '#a855f7', icon: 'cpu',         group: 'agent' },
  { kind: 'Condition',      label: 'Condition',     description: 'Branches based on expression',         color: '#f97316', icon: 'git-branch',  group: 'control' },
  { kind: 'RouterNode',     label: 'Router',        description: 'Multi-route conditional branch',       color: '#64748b', icon: 'shuffle',     group: 'control' },
  { kind: 'LoopNode',       label: 'Loop',          description: 'Iterates over an array in context',    color: '#84cc16', icon: 'repeat',      group: 'control' },
  { kind: 'MergeNode',      label: 'Merge',         description: 'Merges parallel branches',             color: '#64748b', icon: 'merge',       group: 'control' },
  { kind: 'Approval',       label: 'Approval',      description: 'Waits for human approval',             color: '#ec4899', icon: 'check-square', group: 'control' },
  { kind: 'HumanInLoop',    label: 'Human-in-Loop', description: 'Pauses for human input / choice',      color: '#0ea5e9', icon: 'hand',        group: 'control' },
  { kind: 'End',            label: 'End',           description: 'Terminates the flow',                  color: '#ef4444', icon: 'flag',        group: 'utility' },
  { kind: 'Note',           label: 'Note',          description: 'Free-text annotation',                 color: '#94a3b8', icon: 'sticky-note', group: 'utility' },
];

const GROUP_LABELS: Record<string, string> = {
  trigger:     '⚡ Triggers',
  agent:       '🤖 Agents & LLM',
  integration: '🔗 Integrations',
  control:     '🔀 Control Flow',
  utility:     '🗒️ Utility',
};

interface Props { onClose?: () => void; }

export function FlowNodePalette({ onClose }: Props) {
  const [search, setSearch] = useState('');

  const filtered = FLOW_NODE_PALETTE.filter(
    (e) =>
      e.label.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase()),
  );

  const groups = ['trigger', 'agent', 'integration', 'control', 'utility'];

  const onDragStart = (
    e: React.DragEvent,
    entry: typeof FLOW_NODE_PALETTE[number],
  ) => {
    e.dataTransfer.setData('application/flowNodeKind', entry.kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      style={{
        width: 220,
        background: '#1e1e2e',
        borderRight: '1px solid #2a2a3e',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 8px',
        gap: 8,
        overflowY: 'auto',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#c0c0d0', fontWeight: 600, fontSize: 13 }}>Nodes</span>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}
          >
            ×
          </button>
        )}
      </div>

      <input
        placeholder="Search nodes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          background: '#2a2a3e',
          border: '1px solid #3a3a5e',
          borderRadius: 6,
          color: '#e0e0f0',
          padding: '5px 8px',
          fontSize: 12,
          outline: 'none',
        }}
      />

      {groups.map((group) => {
        const items = filtered.filter((e) => e.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <div style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              {GROUP_LABELS[group]}
            </div>
            {items.map((entry) => (
              <div
                key={entry.kind}
                draggable
                onDragStart={(e) => onDragStart(e, entry)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', borderRadius: 6, cursor: 'grab',
                  marginBottom: 2, background: '#2a2a3e',
                  borderLeft: `3px solid ${entry.color}`,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#33334a'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#2a2a3e'; }}
                title={entry.description}
              >
                <span style={{ fontSize: 14 }}>⬡</span>
                <span style={{ color: '#e0e0f0', fontSize: 12, flex: 1 }}>{entry.label}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
