import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { getStudioState } from './lib/api';
import { StudioStateResponse } from './lib/types';
import { StudioStateContext } from './lib/StudioStateContext';
import { MainLayout } from './layouts/MainLayout';
import { LoadingState } from './components/ui/LoadingState';
import { OnboardingDrawer } from './features/onboarding/components/OnboardingDrawer';
import OverviewPage from './features/overview/pages/OverviewPage';
import StudioPage from './features/studio/pages/StudioPage';
import WorkspacesPage from './features/workspaces/pages/WorkspacesPage';
import AgentListPage from './features/agents/pages/AgentListPage';
import ProfilesPage from './features/profiles/pages/ProfilesPage';
import DiagnosticsPage from './features/diagnostics/pages/DiagnosticsPage';
import SessionsPage from './features/sessions/pages/SessionsPage';
import RoutingPage from './features/routing/pages/RoutingPage';
import RunsPage from './features/runs/pages/RunsPage';
import HooksPage from './features/hooks/pages/HooksPage';
import VersionsPage from './features/versions/pages/VersionsPage';
import SettingsPage from './features/settings/pages/SettingsPage';
import { CommandsPage } from './features/commands/pages/CommandsPage';
import OperationsPage from './features/operations/pages/OperationsPage';
import { AlertTriangle } from 'lucide-react';

export function App() {
  const [state, setState] = useState<StudioStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  async function loadState() {
    setLoading(true);
    setError(null);
    try {
      const result = await getStudioState();
      setState(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }

  async function refreshState() {
    try {
      const result = await getStudioState();
      setState(result);
    } catch {
      // silently fail — existing state remains visible
    }
  }

  useEffect(() => { void loadState(); }, []);

  if (loading) {
    return <LoadingState label="Loading OpenClaw Studio..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-6">
        <div className="rounded-2xl border border-[var(--border-primary)] bg-white p-8 max-w-md w-full text-center shadow-[var(--shadow-lg)]">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mb-4">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <h1 className="text-lg font-heading font-semibold text-[var(--text-primary)]">
            Failed to load Studio
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{error}</p>
          <button
            onClick={() => void loadState()}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--color-primary)' }}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!state) return null;

  return (
    <StudioStateContext.Provider value={{ state, refresh: refreshState }}>
      <BrowserRouter>
        {/* Onboarding drawer overlays the dashboard when no workspace exists */}
        <OnboardingDrawer open={!state.workspace} onComplete={loadState} />

        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/"            element={<OverviewPage />} />
            <Route path="/studio"      element={<StudioPage />} />
            <Route path="/workspaces"  element={<WorkspacesPage />} />
            <Route path="/agents"      element={<AgentListPage />} />
            <Route path="/profiles"    element={<ProfilesPage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/sessions"    element={<SessionsPage />} />
            <Route path="/routing"     element={<RoutingPage />} />
            <Route path="/runs"        element={<RunsPage />} />
            <Route path="/hooks"       element={<HooksPage />} />
            <Route path="/versions"    element={<VersionsPage />} />
            <Route path="/settings"    element={<SettingsPage />} />
            <Route path="/commands"    element={<CommandsPage />} />
            <Route path="/operations"  element={<OperationsPage />} />
            <Route path="*"            element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StudioStateContext.Provider>
  );
}
