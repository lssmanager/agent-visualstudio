import { useStudioState } from '../../../lib/StudioStateContext';
import { MessageSquare } from 'lucide-react';

export default function SessionsPage() {
  const { state } = useStudioState();

  const sessions = state.runtime?.sessions?.payload ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Sessions</h1>
        <p className="text-slate-600 mt-1">Runtime session history and metrics</p>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Agent</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Created</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Messages</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sessions.map((session: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm">
                      <code className="bg-slate-100 text-slate-900 px-2 py-1 rounded text-xs font-mono">
                        {typeof session === 'string' ? session.substring(0, 16) : `sess-${idx}`}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {session?.agentId || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {session?.createdAt ? new Date(session.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-2 text-slate-600">
                        <MessageSquare size={16} />
                        <span>{session?.messages?.length || 0}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="inline-block bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-medium">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <MessageSquare size={40} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900">No sessions yet</h3>
            <p className="text-slate-600 text-sm mt-2">Sessions will appear here when agents start processing</p>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-600">Total Sessions</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{sessions.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-600">Active Now</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{sessions.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-600">Avg Messages/Session</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {sessions.length > 0
              ? Math.round(
                  sessions.reduce((sum: number, s: any) => sum + (s?.messages?.length || 0), 0) /
                    sessions.length
                )
              : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
