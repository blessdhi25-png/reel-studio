'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
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

  const noun = targetType ? targetType.charAt(0).toUpperCase() + targetType.slice(1) : 'Content';

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-white text-neutral-900 rounded-t-3xl sm:rounded-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl border border-neutral-200 lg:bg-neutral-900 lg:text-white lg:border-neutral-800"
      >
        <div className="sm:hidden w-10 h-1 rounded-full bg-neutral-300 mx-auto mb-4" aria-hidden="true" />
        <div className="flex items-center justify-between mb-4">
          <h2 id="report-modal-title" className="font-extrabold text-lg tracking-tight">
            {done ? 'Report submitted' : `Report ${noun}`}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 lg:hover:bg-neutral-800 lg:hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <>
            <p className="text-sm font-medium text-neutral-500 leading-relaxed mb-6">
              Thanks — our team will review it. You can check the status from your reports later.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-sm shadow-md transition"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  aria-pressed={reason === r.value}
                  className={`p-3 rounded-xl text-left text-xs border transition ${
                    reason === r.value
                      ? 'bg-amber-500/15 text-amber-700 border-amber-500 font-bold lg:text-amber-400'
                      : 'bg-neutral-100 text-neutral-700 border-transparent font-semibold hover:bg-neutral-200/70 lg:bg-neutral-800 lg:text-neutral-300 lg:hover:bg-neutral-700'
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
              className="w-full rounded-xl bg-neutral-100 border border-neutral-200 p-3 text-sm font-medium mb-4 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500 lg:bg-neutral-800 lg:border-neutral-700 lg:text-white"
            />
            {error && <p className="text-xs font-semibold text-red-600 mb-3">{error}</p>}
            <button
              onClick={submit}
              disabled={!reason || submitting}
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-sm shadow-md transition disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Report'}
            </button>
            <button onClick={onClose} className="w-full mt-2 py-2.5 text-xs font-bold text-neutral-500 hover:text-neutral-800 lg:hover:text-white transition">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
