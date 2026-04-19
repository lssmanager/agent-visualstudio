import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

import { approveStep, rejectStep } from '../../../lib/api';
import type { RunStep } from '../../../lib/types';

interface ApprovalPanelProps {
  runId: string;
  step: RunStep;
  onResolved: () => void;
}

export function ApprovalPanel({ runId, step, onResolved }: ApprovalPanelProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (step.status !== 'waiting_approval') {
    return null;
  }

  async function handleApprove() {
    setLoading(true);
    try {
      await approveStep(runId, step.id);
      onResolved();
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    setLoading(true);
    try {
      await rejectStep(runId, step.id, reason || undefined);
      onResolved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: '#d97706', background: '#fffbeb' }}
    >
      <h4 className="text-sm font-semibold" style={{ color: '#92400e' }}>
        Approval Required
      </h4>
      <p className="text-xs" style={{ color: '#78350f' }}>
        Node <strong>{step.nodeId}</strong> is waiting for human approval to proceed.
      </p>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Optional rejection reason..."
        className="w-full rounded border px-3 py-2 text-xs resize-none"
        style={{ borderColor: '#d97706', background: 'white' }}
        rows={2}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={loading}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition-colors"
          style={{ background: '#059669' }}
        >
          <CheckCircle size={14} />
          Approve
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={loading}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition-colors"
          style={{ background: '#dc2626' }}
        >
          <XCircle size={14} />
          Reject
        </button>
      </div>
    </div>
  );
}
