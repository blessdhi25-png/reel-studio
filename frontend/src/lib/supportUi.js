export const TICKET_STATUS = {
  open: { label: 'Open', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  in_progress: { label: 'In progress', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  closed: { label: 'Closed', cls: 'bg-slate-200 text-slate-600 dark:bg-neutral-800 dark:text-neutral-400' },
};

export const TICKET_CATEGORIES = [
  { value: 'account', label: 'Account' },
  { value: 'posts', label: 'Posts & views' },
  { value: 'live', label: 'Live' },
  { value: 'monetisation', label: 'Earnings & tips' },
  { value: 'safety', label: 'Safety & privacy' },
  { value: 'technical', label: 'Technical problem' },
  { value: 'other', label: 'Other' },
];

export function StatusPill({ status }) {
  const s = TICKET_STATUS[status] || TICKET_STATUS.open;
  return <span className={`shrink-0 px-2.5 py-1 rounded-full font-sans font-bold text-[11px] ${s.cls}`}>{s.label}</span>;
}

export function timeAgo(iso) {
  const d = new Date(iso);
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  if (m < 10080) return `${Math.floor(m / 1440)}d ago`;
  return d.toLocaleDateString();
}
