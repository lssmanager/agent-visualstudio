import { useStudioState } from '../../../lib/StudioStateContext';
import { Activity, AlertCircle, CheckCircle, Circle, Zap } from 'lucide-react';

export default function DiagnosticsPage() {
  const { state } = useStudioState();

  const runtimeOk = state.runtime?.ok ?? false;
  const compileDiagnostics = state.compile?.diagnostics ?? [];
  const sessions = state.runtime?.sessions?.payload ?? [];
  const workspace = state.workspace;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Diagnostics</h1>
        <p className="text-slate-600 mt-1">System health, runtime status, and compilation diagnostics</p>
      </div>

      {/* Runtime Health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Online Status */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-3 h-3 rounded-full ${runtimeOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <h3 className="font-semibold text-slate-900">Runtime</h3>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {runtimeOk ? 'Online' : 'Offline'}
          </div>
          <p className="text-sm text-slate-600 mt-2">
            {runtimeOk ? '✓ Gateway responding' : '✗ Cannot reach gateway'}
          </p>
        </div>

        {/* Compilation Status */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap size={20} className="text-blue-600" />
            <h3 className="font-semibold text-slate-900">Compilation</h3>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {compileDiagnostics.length === 0 ? '✓ OK' : compileDiagnostics.length}
          </div>
          <p className="text-sm text-slate-600 mt-2">
            {compileDiagnostics.length === 0
              ? 'No issues detected'
              : `${compileDiagnostics.length} ${compileDiagnostics.length === 1 ? 'issue' : 'issues'}`}
          </p>
        </div>

        {/* Workspace Status */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity size={20} className={workspace ? 'text-emerald-600' : 'text-amber-600'} />
            <h3 className="font-semibold text-slate-900">Workspace</h3>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {workspace ? 'Active' : 'None'}
          </div>
          <p className="text-sm text-slate-600 mt-2">
            {workspace ? `Loaded: ${workspace.name}` : 'No workspace selected'}
          </p>
        </div>
      </div>

      {/* Sessions */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Active Sessions</h3>
        {sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Session ID</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Messages</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 10).map((session: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-900 font-mono text-xs">
                      {typeof session === 'string'
                        ? session.substring(0, 24) + '...'
                        : `Session ${idx + 1}`}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-2">
                        <Circle size={10} className="fill-emerald-500 text-emerald-500" />
                        <span className="text-emerald-700">Active</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {typeof session === 'object' && session?.messages
                        ? session.messages.length
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sessions.length > 10 && (
              <p className="mt-3 text-sm text-slate-600">
                Showing 10 of {sessions.length} sessions
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-600">
            <p>No active sessions</p>
          </div>
        )}
      </div>

      {/* Compilation Diagnostics */}
      {compileDiagnostics.length > 0 && (
        <div className="bg-white rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
            <h3 className="text-lg font-semibold text-red-900">Issues</h3>
          </div>
          <div className="space-y-2">
            {compileDiagnostics.map((diagnostic: string, idx: number) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-red-800">
                <span className="text-red-600 mt-0.5">•</span>
                <span>{diagnostic}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
