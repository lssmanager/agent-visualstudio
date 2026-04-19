import { useState, useCallback, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────────

export interface WidgetConfig {
  id: string;
  visible: boolean;
  position: number;
  colSpan: 1 | 2;
}

export interface DashboardView {
  id: string;
  name: string;
  widgets: WidgetConfig[];
  isDefault?: boolean;
}

// ── Default widgets ─────────────────────────────────────────────────

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'runtime-health', visible: true, position: 0, colSpan: 1 },
  { id: 'sessions-trend', visible: true, position: 1, colSpan: 1 },
  { id: 'tool-calls',     visible: true, position: 2, colSpan: 1 },
  { id: 'flows-health',   visible: true, position: 3, colSpan: 2 },
];

const DEFAULT_VIEWS: DashboardView[] = [
  {
    id: 'executive',
    name: 'Executive view',
    isDefault: true,
    widgets: [
      { id: 'runtime-health', visible: true, position: 0, colSpan: 1 },
      { id: 'sessions-trend', visible: true, position: 1, colSpan: 1 },
      { id: 'flows-health',   visible: true, position: 2, colSpan: 2 },
    ],
  },
  {
    id: 'agent-ops',
    name: 'Agent ops view',
    isDefault: true,
    widgets: [
      { id: 'runtime-health', visible: true, position: 0, colSpan: 1 },
      { id: 'tool-calls',     visible: true, position: 1, colSpan: 1 },
      { id: 'sessions-trend', visible: true, position: 2, colSpan: 1 },
      { id: 'flows-health',   visible: true, position: 3, colSpan: 2 },
    ],
  },
];

const STORAGE_KEY = 'studio-dashboard-views';

// ── Hook ─────────────────────────────────────────────────────────────

function loadFromStorage(): { views: DashboardView[]; currentViewId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.views && parsed.currentViewId) return parsed;
    }
  } catch { /* ignore */ }
  return { views: DEFAULT_VIEWS, currentViewId: DEFAULT_VIEWS[0].id };
}

function persist(views: DashboardView[], currentViewId: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ views, currentViewId }));
}

export function useDashboardLayout() {
  const [views, setViews] = useState<DashboardView[]>(() => loadFromStorage().views);
  const [currentViewId, setCurrentViewIdRaw] = useState(() => loadFromStorage().currentViewId);
  const [isEditing, setEditing] = useState(false);

  const currentView = views.find((v) => v.id === currentViewId) ?? views[0];
  const widgets = currentView?.widgets ?? DEFAULT_WIDGETS;

  // Persist on change
  useEffect(() => {
    persist(views, currentViewId);
  }, [views, currentViewId]);

  const setCurrentView = useCallback((id: string) => {
    setCurrentViewIdRaw(id);
  }, []);

  const toggleWidget = useCallback((widgetId: string) => {
    setViews((prev) =>
      prev.map((v) =>
        v.id === currentViewId
          ? { ...v, widgets: v.widgets.map((w) => (w.id === widgetId ? { ...w, visible: !w.visible } : w)) }
          : v,
      ),
    );
  }, [currentViewId]);

  const addWidget = useCallback((widgetId: string) => {
    setViews((prev) =>
      prev.map((v) => {
        if (v.id !== currentViewId) return v;
        if (v.widgets.some((w) => w.id === widgetId)) return v;
        return { ...v, widgets: [...v.widgets, { id: widgetId, visible: true, position: v.widgets.length, colSpan: 1 }] };
      }),
    );
  }, [currentViewId]);

  const removeWidget = useCallback((widgetId: string) => {
    setViews((prev) =>
      prev.map((v) =>
        v.id === currentViewId
          ? { ...v, widgets: v.widgets.filter((w) => w.id !== widgetId) }
          : v,
      ),
    );
  }, [currentViewId]);

  const updateWidgetOrder = useCallback((reordered: WidgetConfig[]) => {
    setViews((prev) =>
      prev.map((v) => (v.id === currentViewId ? { ...v, widgets: reordered } : v)),
    );
  }, [currentViewId]);

  const saveView = useCallback((name: string) => {
    const id = `custom-${Date.now()}`;
    const newView: DashboardView = { id, name, widgets: [...widgets] };
    setViews((prev) => [...prev, newView]);
    setCurrentViewIdRaw(id);
  }, [widgets]);

  const deleteView = useCallback((id: string) => {
    setViews((prev) => {
      const filtered = prev.filter((v) => v.id !== id);
      if (filtered.length === 0) return DEFAULT_VIEWS;
      return filtered;
    });
    if (currentViewId === id) {
      setCurrentViewIdRaw(views[0]?.id ?? DEFAULT_VIEWS[0].id);
    }
  }, [currentViewId, views]);

  return {
    currentView,
    savedViews: views,
    widgets,
    setCurrentView,
    saveView,
    deleteView,
    updateWidgetOrder,
    toggleWidget,
    addWidget,
    removeWidget,
    isEditing,
    setEditing,
  };
}
