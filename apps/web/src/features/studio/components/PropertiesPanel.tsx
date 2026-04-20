import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';

import type { AgentSpec, DeployPreview, FlowNode, SkillSpec } from '../../../lib/types';

interface PropertiesPanelProps {
  diagnostics: string[];
  deployPreview: DeployPreview | null;
  sessions: unknown[];
  selectedNodeId: string | null;
  selectedNode: FlowNode | null;
  agents: AgentSpec[];
  skills: SkillSpec[];
}

type InspectorTab = 'properties' | 'test' | 'diff';
type DiffStatus = 'added' | 'updated' | 'deleted' | 'unchanged';

const STATUS_STYLE: Record<DiffStatus, { color: string; bg: string; prefix: string }> = {
  added: { color: 'var(--color-success)', bg: 'rgba(34,197,94,0.08)', prefix: '+' },
  updated: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', prefix: '~' },
  deleted: { color: 'var(--color-error)', bg: 'rgba(239,68,68,0.08)', prefix: '-' },
  unchanged: { color: 'var(--text-muted)', bg: 'transparent', prefix: '.' },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function SectionBlock({ title, children, compact = false }: { title: string; children: ReactNode; compact?: boolean }) {
  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--shell-chip-border)',
        background: 'var(--shell-chip-bg)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: compact ? '8px 12px' : '10px 14px',
          borderBottom: '1px solid var(--shell-chip-border)',
          background: 'color-mix(in srgb, var(--shell-chip-bg) 78%, transparent)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div style={{ padding: compact ? '10px 12px' : '10px 14px' }}>{children}</div>
    </div>
  );
}

function Pill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 999,
        padding: '4px 10px',
        background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
        color: 'var(--color-primary)',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 12,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </span>
  );
}

function EmptyInspectorState() {
  return (
    <div
      style={{
        border: '1px dashed var(--shell-chip-border)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 14px',
        color: 'var(--text-muted)',
        fontSize: 12,
      }}
    >
      Select a node on the canvas to inspect it
    </div>
  );
}

export function PropertiesPanel({
  diagnostics,
  deployPreview,
  sessions,
  selectedNodeId,
  selectedNode,
  agents,
  skills,
}: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('properties');

  const config = useMemo(() => asRecord(selectedNode?.config), [selectedNode]);
  const nodeType = selectedNode?.type === 'subagent' ? 'subagent' : selectedNode?.type === 'agent' ? 'agent' : null;
  const configuredAgentId = config && typeof config.agentId === 'string' ? config.agentId : null;

  const linkedAgent = useMemo(() => {
    if (!nodeType) return null;
    if (configuredAgentId) {
      return agents.find((agent) => agent.id === configuredAgentId) ?? null;
    }

    const matchingKind = nodeType === 'subagent' ? 'subagent' : 'agent';
    return agents.find((agent) => agent.kind === matchingKind) ?? null;
  }, [agents, configuredAgentId, nodeType]);

  const initialName =
    (config && typeof config.name === 'string' ? config.name : undefined) ??
    linkedAgent?.name ??
    (selectedNode ? selectedNode.id : '');

  const initialPurpose =
    (config && typeof config.purpose === 'string' ? config.purpose : undefined) ??
    (config && typeof config.description === 'string' ? config.description : undefined) ??
    linkedAgent?.description ??
    '';

  const skillRefsFromConfig = toStringArray(config?.skills).concat(toStringArray(config?.skillRefs));
  const initialSkills =
    skillRefsFromConfig.length > 0
      ? skillRefsFromConfig.filter((value, index, all) => all.indexOf(value) === index)
      : linkedAgent?.skillRefs ?? [];

  const initialTools =
    toStringArray(config?.tools).length > 0
      ? toStringArray(config?.tools)
      : toStringArray(config?.toolRefs).length > 0
        ? toStringArray(config?.toolRefs)
        : linkedAgent?.permissions?.tools ?? [];

  const [name, setName] = useState(initialName);
  const [purpose, setPurpose] = useState(initialPurpose);
  const [selectedSkills, setSelectedSkills] = useState<string[]>(initialSkills);
  const [selectedTools, setSelectedTools] = useState<string[]>(initialTools);
  const [addingSkill, setAddingSkill] = useState(false);
  const [addingTool, setAddingTool] = useState(false);

  useEffect(() => {
    setName(initialName);
    setPurpose(initialPurpose);
    setSelectedSkills(initialSkills);
    setSelectedTools(initialTools);
    setAddingSkill(false);
    setAddingTool(false);
  }, [selectedNodeId, initialName, initialPurpose, initialSkills, initialTools]);

  const skillCatalog = useMemo(() => skills.map((skill) => skill.name).filter(Boolean), [skills]);

  const toolCatalog = useMemo(() => {
    const fromAgents = agents.flatMap((agent) => agent.permissions?.tools ?? []);
    const fromNode = toStringArray(config?.tools).concat(toStringArray(config?.toolRefs));
    const merged = [...fromAgents, ...fromNode, ...selectedTools];
    return Array.from(new Set(merged.filter((item) => item.trim().length > 0)));
  }, [agents, config, selectedTools]);

  const availableSkills = skillCatalog.filter((item) => !selectedSkills.includes(item));
  const availableTools = toolCatalog.filter((item) => !selectedTools.includes(item));

  const builderWhatItDoes =
    (config && typeof config.whatItDoes === 'string' ? config.whatItDoes : undefined) ??
    linkedAgent?.description ??
    'No generated summary available for this node.';
  const builderInputs = toStringArray(config?.inputs);
  const builderOutputs = toStringArray(config?.outputs);

  function renderPropertiesTab() {
    if (!selectedNodeId || !selectedNode) {
      return <EmptyInspectorState />;
    }

    if (nodeType !== 'agent' && nodeType !== 'subagent') {
      return (
        <SectionBlock title="Node Details">
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Node ID</div>
            <code style={{ fontSize: 11, color: 'var(--text-primary)' }}>{selectedNode.id}</code>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Type</div>
            <code style={{ fontSize: 11, color: 'var(--text-primary)' }}>{selectedNode.type}</code>
          </div>
        </SectionBlock>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <SectionBlock title="Identity">
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                style={{
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  padding: '7px 9px',
                  fontSize: 12,
                }}
              />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Purpose / Description</span>
              <textarea
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                rows={4}
                style={{
                  resize: 'vertical',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  padding: '7px 9px',
                  fontSize: 12,
                }}
              />
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Type</span>
                <span
                  style={{
                    borderRadius: 999,
                    border: '1px solid var(--shell-chip-border)',
                    fontSize: 11,
                    padding: '2px 8px',
                    color: 'var(--text-primary)',
                    background: 'var(--shell-chip-bg)',
                    textTransform: 'capitalize',
                  }}
              >
                {nodeType === 'subagent' ? 'Subagent' : 'Agent'}
              </span>
            </div>
          </div>
        </SectionBlock>

        <SectionBlock title="Skills">
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedSkills.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No skills attached</span>
              ) : (
                selectedSkills.map((skillName) => (
                  <Pill
                    key={skillName}
                    label={skillName}
                    onRemove={() => setSelectedSkills((previous) => previous.filter((item) => item !== skillName))}
                  />
                ))
              )}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <button
                type="button"
                onClick={() => setAddingSkill((previous) => !previous)}
                style={actionButtonStyle()}
              >
                + Add Skill
              </button>
              {addingSkill && (
                <select
                  value=""
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) return;
                    setSelectedSkills((previous) => (previous.includes(value) ? previous : [...previous, value]));
                    setAddingSkill(false);
                  }}
                  style={selectStyle()}
                >
                  <option value="">Select skill...</option>
                  {availableSkills.map((skillName) => (
                    <option key={skillName} value={skillName}>
                      {skillName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </SectionBlock>

        <SectionBlock title="Tools">
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedTools.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No tools attached</span>
              ) : (
                selectedTools.map((toolName) => (
                  <Pill
                    key={toolName}
                    label={toolName}
                    onRemove={() => setSelectedTools((previous) => previous.filter((item) => item !== toolName))}
                  />
                ))
              )}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <button
                type="button"
                onClick={() => setAddingTool((previous) => !previous)}
                style={actionButtonStyle()}
              >
                + Add Tool
              </button>
              {addingTool && (
                <select
                  value=""
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) return;
                    setSelectedTools((previous) => (previous.includes(value) ? previous : [...previous, value]));
                    setAddingTool(false);
                  }}
                  style={selectStyle()}
                >
                  <option value="">Select tool...</option>
                  {availableTools.map((toolName) => (
                    <option key={toolName} value={toolName}>
                      {toolName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </SectionBlock>

        <SectionBlock title="Builder Agent Function" compact>
          <details open>
            <summary
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                cursor: 'pointer',
                listStyle: 'none',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Builder Output</span>
              <span
                style={{
                  borderRadius: 999,
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  background: 'var(--shell-chip-bg)',
                  color: 'var(--text-muted)',
                }}
              >
                generated
              </span>
            </summary>

            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>whatItDoes</div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.45 }}>{builderWhatItDoes}</p>
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>inputs</div>
                {builderInputs.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No generated inputs</div>
                ) : (
                  <div style={{ display: 'grid', gap: 4 }}>
                    {builderInputs.map((item) => (
                      <code key={item} style={{ fontSize: 11, color: 'var(--text-primary)' }}>
                        {item}
                      </code>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>outputs</div>
                {builderOutputs.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No generated outputs</div>
                ) : (
                  <div style={{ display: 'grid', gap: 4 }}>
                    {builderOutputs.map((item) => (
                      <code key={item} style={{ fontSize: 11, color: 'var(--text-primary)' }}>
                        {item}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </details>
        </SectionBlock>
      </div>
    );
  }

  function renderTestTab() {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <SectionBlock
          title="Compiler Diagnostics"
          compact
        >
          {diagnostics.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-success)' }}>
              <CheckCircle size={13} />
              No issues found
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {diagnostics.map((item) => (
                <div
                  key={item}
                  style={{
                    fontSize: 12,
                    color: '#F59E0B',
                    background: 'rgba(245,158,11,0.08)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <AlertTriangle size={12} />
                  {item}
                </div>
              ))}
            </div>
          )}
        </SectionBlock>

        <SectionBlock title="Runtime Sessions" compact>
          {sessions.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No active sessions</p>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {sessions.map((session, index) => {
                const current = asRecord(session);
                const sid = typeof current?.id === 'string' ? current.id.slice(0, 12) : `sess-${index}`;
                const aid = typeof current?.agentId === 'string' ? current.agentId : 'Unknown';
                return (
                  <div
                    key={`${sid}-${index}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--shell-chip-bg)',
                    }}
                  >
                    <code style={{ fontSize: 11, color: 'var(--text-primary)' }}>{sid}</code>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{aid}</span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionBlock>
      </div>
    );
  }

  function renderDiffTab() {
    return (
      <SectionBlock title="Deploy Diff" compact>
        {!deployPreview ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Run Preview Diff to see changes</p>
        ) : deployPreview.diff.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nothing to deploy</p>
        ) : (
          <div style={{ display: 'grid', gap: 4 }}>
            {deployPreview.diff.map((item) => {
              const style = STATUS_STYLE[item.status as DiffStatus] ?? STATUS_STYLE.unchanged;
              return (
                <div
                  key={item.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color: style.color,
                    background: style.bg,
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 8px',
                  }}
                >
                  <span style={{ fontWeight: 700, width: 12, textAlign: 'center', flexShrink: 0 }}>{style.prefix}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.path}</span>
                </div>
              );
            })}
          </div>
        )}
      </SectionBlock>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--shell-panel-bg)',
        borderLeft: '1px solid var(--shell-panel-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--shell-panel-border)', display: 'grid', gap: 10 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
          }}
        >
          Inspector
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {(['properties', 'test', 'diff'] as InspectorTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--shell-chip-border)',
                padding: '6px 8px',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'capitalize',
                background: activeTab === tab ? 'var(--color-primary-soft)' : 'var(--shell-chip-bg)',
                color: activeTab === tab ? 'var(--color-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {activeTab === 'properties' && renderPropertiesTab()}
        {activeTab === 'test' && renderTestTab()}
        {activeTab === 'diff' && renderDiffTab()}
      </div>
    </div>
  );
}

function actionButtonStyle(): CSSProperties {
  return {
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--shell-chip-border)',
    background: 'var(--shell-chip-bg)',
    color: 'var(--text-primary)',
    fontSize: 11,
    fontWeight: 600,
    padding: '6px 8px',
    cursor: 'pointer',
    width: 'fit-content',
  };
}

function selectStyle(): CSSProperties {
  return {
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--shell-chip-border)',
    background: 'var(--shell-chip-bg)',
    color: 'var(--input-text)',
    fontSize: 12,
    padding: '6px 8px',
  };
}

