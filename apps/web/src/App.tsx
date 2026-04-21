import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { getStudioState } from './lib/api';
import { StudioStateResponse } from './lib/types';
import { StudioStateContext } from './lib/StudioStateContext';
import { ThemeProvider } from './lib/ThemeProvider';
import { OnboardingProvider } from './lib/OnboardingContext';
import { HierarchyProvider } from './lib/HierarchyContext';
import { usePreferences } from './lib/usePreferences';
import { MainLayout } from './layouts/MainLayout';
import { LoadingState } from './components/ui/LoadingState';
import { OnboardingDrawer } from './features/onboarding/components/OnboardingDrawer';
import NotFoundPage from './features/overview/pages/NotFoundPage';
import AgencyBuilderPage from './features/studio/pages/AgencyBuilderPage';
import WorkspaceStudioPage from './features/studio/pages/WorkspaceStudioPage';
import EntityEditorPage from './features/agents/pages/EntityEditorPage';
import ProfilesPage from './features/profiles/pages/ProfilesPage';
import SessionsPage from './features/sessions/pages/SessionsPage';
import RunsPage from './features/runs/pages/RunsPage';
import SettingsPage from './features/settings/pages/SettingsPage';
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
      // silently fail — existing state remains visible
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
        <HierarchyProvider>
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
                  <Route path="/"            element={<Navigate to="/agency-builder?tab=overview" replace />} />
                  <Route path="/agency-builder" element={<AgencyBuilderPage />} />
                  <Route path="/workspace-studio" element={<WorkspaceStudioPage />} />
                  <Route path="/entity-editor" element={<EntityEditorPage />} />
                  <Route path="/profiles"    element={<ProfilesPage />} />
                  <Route path="/sessions"    element={<SessionsPage />} />
                  <Route path="/runs"        element={<RunsPage />} />
                  <Route path="/settings"    element={<SettingsPage />} />

                  <Route path="/agency-topology" element={<Navigate to="/agency-builder?tab=topology" replace />} />
                  <Route path="/workspaces" element={<Navigate to="/agency-builder?tab=structure" replace />} />
                  <Route path="/routing" element={<Navigate to="/agency-builder?tab=routing" replace />} />
                  <Route path="/hooks" element={<Navigate to="/agency-builder?tab=hooks" replace />} />
                  <Route path="/versions" element={<Navigate to="/agency-builder?tab=versions" replace />} />
                  <Route path="/operations" element={<Navigate to="/agency-builder?tab=operations" replace />} />
                  <Route path="/diagnostics" element={<Navigate to="/settings?tab=diagnostics" replace />} />
                  <Route path="/commands" element={<Navigate to="/settings?tab=automations" replace />} />

                  <Route path="*"            element={<NotFoundPage />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </OnboardingProvider>
        </HierarchyProvider>
      </StudioStateContext.Provider>
    </ThemeProvider>
  );
}
