'use client';

import { useState } from 'react';
import { api } from '../lib/api';

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'fraud_or_scam', label: 'Fraud or scam' },
  { value: 'harassment_or_abuse', label: 'Harassment or abuse' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'intellectual_property', label: 'Intellectual property' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'child_safety', label: 'Child safety' },
  { value: 'other', label: 'Other' },
];

export default function ReportModal({ targetType, targetId, onClose }) {
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    if (!reason) return;
    if (!localStorage.getItem('token')) {
      window.location.href = '/login';
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.fileReport(targetType, targetId, reason, details.trim() || undefined);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-ink/90 flex items-center justify-center z-40 px-6">
      <div className="bg-ink2 rounded-sprocket p-6 w-full max-w-sm border border-smoke/20">
        {done ? (
          <>
            <p className="font-display text-xl text-bone mb-2 tracking-wide">Report submitted</p>
            <p className="font-body text-sm text-smoke mb-5">
              Thanks — our team will review it. You can check the status from your reports later.
            </p>
            <button
              onClick={onClose}
              className="w-full bg-reel text-ink font-body font-semibold py-2 rounded-sprocket"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <p className="font-display text-xl text-bone mb-4 tracking-wide">
              Report {targetType}
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={`py-2 px-2 font-body text-xs rounded-sprocket border text-left ${
                    reason === r.value ? 'border-reel text-reel' : 'border-smoke/30 text-smoke'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Additional details (optional)"
              rows={3}
              className="w-full bg-ink text-bone font-body text-sm rounded-sprocket p-3 mb-4 outline-none border border-transparent focus:border-reel/50"
            />
            {error && <p className="font-body text-xs text-red-400 mb-3">{error}</p>}
            <button
              onClick={submit}
              disabled={!reason || submitting}
              className="w-full bg-reel text-ink font-body font-semibold py-2 rounded-sprocket disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
            <button onClick={onClose} className="w-full mt-3 text-smoke text-sm font-body">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
