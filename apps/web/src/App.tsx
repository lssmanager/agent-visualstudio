import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { getStudioState } from './lib/api';
import { StudioStateResponse } from './lib/types';
import { StudioStateContext } from './lib/StudioStateContext';
import { MainLayout } from './layouts/MainLayout';
import { LoadingState } from './components/ui/LoadingState';
import OnboardingPage from './features/onboarding/pages/OnboardingPage';
import OverviewPage from './features/overview/pages/OverviewPage';
import StudioPage from './features/studio/pages/StudioPage';
import WorkspacesPage from './features/workspaces/pages/WorkspacesPage';
import AgentListPage from './features/agents/pages/AgentListPage';
import ProfilesPage from './features/profiles/pages/ProfilesPage';
import DiagnosticsPage from './features/diagnostics/pages/DiagnosticsPage';
import SessionsPage from './features/sessions/pages/SessionsPage';
import RoutingPage from './features/routing/pages/RoutingPage';
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="rounded-2xl border border-rose-500/30 bg-slate-900 p-8 max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-500/10 mb-4">
            <AlertTriangle size={24} className="text-rose-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">Failed to load Studio</h1>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <button
            onClick={() => void loadState()}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!state) return null;

  if (!state.workspace) {
    return <OnboardingPage onComplete={loadState} />;
  }

  return (
    <StudioStateContext.Provider value={{ state, refresh: refreshState }}>
      <BrowserRouter>
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
            <Route path="*"            element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StudioStateContext.Provider>
  );
}
