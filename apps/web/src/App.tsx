import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { getStudioState } from './lib/api';
import { StudioStateResponse } from './lib/types';
import { StudioStateContext } from './lib/StudioStateContext';
import { MainLayout } from './layouts/MainLayout';
import OnboardingPage from './features/onboarding/pages/OnboardingPage';
import StudioPage from './features/studio/pages/StudioPage';
import WorkspacesPage from './features/workspaces/pages/WorkspacesPage';
import AgentListPage from './features/agents/pages/AgentListPage';
import ProfilesPage from './features/profiles/pages/ProfilesPage';
import DiagnosticsPage from './features/diagnostics/pages/DiagnosticsPage';
import SessionsPage from './features/sessions/pages/SessionsPage';
import RoutingPage from './features/routing/pages/RoutingPage';

export function App() {
  const [state, setState] = useState<StudioStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Refresh state without showing full loading screen (for in-page refresh)
  async function refreshState() {
    try {
      const result = await getStudioState();
      setState(result);
    } catch (err) {
      // Silently fail on refresh — existing state stays visible
    }
  }

  useEffect(() => {
    void loadState();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          <p className="text-sm text-slate-600">Loading OpenClaw Studio...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded border border-red-300 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-700">Connection Error</p>
          <p className="mt-1 text-xs text-red-600">{error}</p>
          <button
            onClick={() => void loadState()}
            className="mt-3 rounded bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!state) return null;

  const hasWorkspace = state.workspace !== null;

  if (!hasWorkspace) {
    return <OnboardingPage onComplete={loadState} />;
  }

  return (
    <StudioStateContext.Provider value={{ state, refresh: refreshState }}>
      <BrowserRouter>
        <Routes>
          {/* Authenticated routes with layout */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<StudioPage />} />
            <Route path="/workspaces" element={<WorkspacesPage />} />
            <Route path="/agents" element={<AgentListPage />} />
            <Route path="/profiles" element={<ProfilesPage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/routing" element={<RoutingPage />} />
            {/* Catch-all for undefined routes */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StudioStateContext.Provider>
  );
}
