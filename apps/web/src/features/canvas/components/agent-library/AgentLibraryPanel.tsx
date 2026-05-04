import { useState, useEffect } from 'react';
import { X, BookOpen, Search } from 'lucide-react';
import type { AgentTemplate } from './useAgencyTemplates';
import { useAgencyTemplates } from './useAgencyTemplates';
import { DepartmentList } from './DepartmentList';
import { AgentTemplatePreview } from './AgentTemplatePreview';

interface AgentLibraryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Callback cuando el usuario confirma "Usar este agente".
   * Recibe el AgentTemplate completo para que el padre lo use
   * (p.ej. para preparar un nodo en el canvas).
   */
  onUseAgent?: (agent: AgentTemplate) => void;
}

export function AgentLibraryPanel({ isOpen, onClose, onUseAgent }: AgentLibraryPanelProps) {
  const { agency, loading, error, loadAgency, loadAgentDetail } = useAgencyTemplates();
  const [selectedAgent, setSelectedAgent] = useState<AgentTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Carga los datos al abrir el panel por primera vez
  useEffect(() => {
    if (isOpen) {
      void loadAgency();
    }
  }, [isOpen, loadAgency]);

  // Filtrado por búsqueda
  const filteredAgency = agency
    ? {
        ...agency,
        departments: agency.departments.map((dept) => ({
          ...dept,
          agents: searchQuery.trim()
            ? dept.agents.filter(
                (a) =>
                  a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  a.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  a.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())),
              )
            : dept.agents,
        })),
      }
    : null;

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay semitransparente — click cierra el panel */}
      <div
        className="fixed inset-0 z-30"
        style={{ background: 'oklch(0 0 0 / 0.2)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel lateral */}
      <div
        role="complementary"
        aria-label="Agent Library"
        className="fixed left-0 top-0 h-full z-30 flex flex-col"
        style={{
          width: 'min(380px, 85vw)',
          background: 'var(--bg-primary)',
          borderRight: '1px solid var(--border-primary)',
          boxShadow: '4px 0 24px oklch(0 0 0 / 0.12)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div className="flex items-center gap-2">
            <BookOpen size={15} style={{ color: 'var(--color-primary)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Agent Library
            </span>
            {agency && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: 'var(--shell-chip-bg)', color: 'var(--text-muted)' }}
              >
                {agency.meta.totalAgents} agentes
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Cerrar Agent Library"
          >
            <X size={15} />
          </button>
        </div>

        {/* Buscador */}
        <div
          className="px-4 py-2.5 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-faint)' }}
            />
            <input
              type="search"
              placeholder="Buscar agente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md pl-8 pr-3 py-1.5 text-xs focus:outline-none"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-hidden min-h-0 px-4 pt-3">
          {/* Estado de carga */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <span
                className="inline-block w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--color-primary)' }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Cargando agentes...
              </span>
            </div>
          )}

          {/* Estado de error */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <span className="text-2xl">⚠️</span>
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                Error al cargar la librería
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {error}
              </p>
              <button
                onClick={() => void loadAgency()}
                className="mt-2 px-3 py-1.5 rounded text-xs font-medium text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Lista de departments */}
          {filteredAgency && !loading && (
            <DepartmentList
              departments={filteredAgency.departments}
              onAgentClick={(agent) => setSelectedAgent(agent)}
            />
          )}
        </div>

        {/* Footer — fuente */}
        <div
          className="px-4 py-2 flex-shrink-0 border-t"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            Fuente:{' '}
            <a
              href="https://github.com/msitarzewski/agency-agents"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: 'var(--color-primary)' }}
            >
              msitarzewski/agency-agents
            </a>
          </p>
        </div>
      </div>

      {/* Modal de preview — se monta encima de todo */}
      {selectedAgent && (
        <AgentTemplatePreview
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onUse={(agent) => {
            onUseAgent?.(agent);
            setSelectedAgent(null);
          }}
          loadDetail={loadAgentDetail}
        />
      )}
    </>
  );
}
