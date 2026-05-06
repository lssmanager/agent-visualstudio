import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { getStudioState } from './lib/api';
import { StudioStateResponse } from './lib/types';
import { StudioStateContext } from './lib/StudioStateContext';
import { ThemeProvider } from './lib/ThemeProvider';
import { OnboardingProvider } from './lib/OnboardingContext';
import { usePreferences } from './lib/usePreferences';
import { MainLayout } from './layouts/MainLayout';
import { LoadingState } from './components/ui/LoadingState';
import { OnboardingDrawer } from './features/onboarding/components/OnboardingDrawer';
import OverviewPage from './features/overview/pages/OverviewPage';
import AgencyBuilderPage from './features/studio/pages/AgencyBuilderPage';
import AgencyTopologyPage from './features/studio/pages/AgencyTopologyPage';
import WorkspaceStudioPage from './features/studio/pages/WorkspaceStudioPage';
import ObservabilityPage from './features/operations/pages/ObservabilityPage';
import ObservabilityRunPage from './features/operations/pages/ObservabilityRunPage';
import WorkspacesPage from './features/workspaces/pages/WorkspacesPage';
import AgentListPage from './features/agents/pages/AgentListPage';
import AgentEditorPage from './features/agents/pages/AgentEditorPage';
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
import ChannelsPage from './features/channels/ChannelsPage';
import { AlertTriangle } from 'lucide-react';

export function App() {
  const { theme, setTheme } = usePreferences();
  const [state, setState] = useState<StudioStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

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
      // Silently keep the last valid state visible
    }
  }

  useEffect(() => { void loadState(); }, []);

  if (loading) {
    return (
      <ThemeProvider initialTheme={theme} onThemeChange={setTheme}>
        <LoadingState label="Loading OpenClaw Studio..." />
      </ThemeProvider>
    );
  }

  if (error) {
    return (
      <ThemeProvider initialTheme={theme} onThemeChange={setTheme}>
        <div
          style={{
            minHeight: '100vh',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--border-primary)',
              background: 'var(--card-bg)',
              padding: 32,
              maxWidth: 420,
              width: '100%',
              textAlign: 'center',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 48,
                borderRadius: 'var(--radius-full)',
                background: 'rgba(239,68,68,0.1)',
                marginBottom: 16,
              }}
            >
              <AlertTriangle size={24} style={{ color: 'var(--color-error)' }} />
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--text-lg)',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Failed to load Studio
            </h1>
            <p style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{error}</p>
            <button
              onClick={() => void loadState()}
              style={{
                marginTop: 24,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-heading)',
                fontWeight: 500,
                color: 'var(--btn-primary-text)',
                background: 'var(--btn-primary-bg)',
                border: 'none',
                cursor: 'pointer',
                transition: 'background var(--transition)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--btn-primary-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--btn-primary-bg)'; }}
            >
              Retry Connection
            </button>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  if (!state) return null;

  // Open onboarding automatically when no workspace exists
  const shouldShowOnboarding = onboardingOpen || !state.workspace;

  return (
    <ThemeProvider initialTheme={theme} onThemeChange={setTheme}>
      <StudioStateContext.Provider value={{ state, refresh: refreshState }}>
        <OnboardingProvider value={{ openOnboarding: () => setOnboardingOpen(true) }}>
          <BrowserRouter>
            {/* Onboarding drawer overlays the dashboard */}
            <OnboardingDrawer
              open={shouldShowOnboarding}
              onComplete={async () => {
                setOnboardingOpen(false);
                await loadState();
              }}
              onClose={() => setOnboardingOpen(false)}
            />

            <Routes>
              <Route element={<MainLayout />}>
                <Route path="/"            element={<OverviewPage />} />
                <Route path="/agency-builder" element={<AgencyBuilderPage />} />
                <Route path="/workspace-studio" element={<WorkspaceStudioPage />} />
                <Route path="/agency-topology" element={<AgencyTopologyPage />} />
                <Route path="/studio"      element={<Navigate to="/workspace-studio" replace />} />
                <Route path="/observability" element={<ObservabilityPage />} />
                <Route path="/observability/:runId" element={<ObservabilityRunPage />} />
                <Route path="/workspaces"  element={<WorkspacesPage />} />
                <Route path="/agents/new"  element={<AgentEditorPage />} />
                <Route path="/agents/:id" element={<AgentEditorPage />} />
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
                {/* F5-05: Gestión de canales */}
                <Route path="/channels"    element={<ChannelsPage />} />
                <Route path="/channels/:id" element={<ChannelsPage />} />
                <Route path="*"            element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </OnboardingProvider>
      </StudioStateContext.Provider>
    </ThemeProvider>
  );
}
