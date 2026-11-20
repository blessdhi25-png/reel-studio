export const TICKET_STATUS = {
  OPEN: { label: 'Open', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  IN_REVIEW: { label: 'In review', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  RESOLVED: { label: 'Resolved', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  CLOSED: { label: 'Closed', cls: 'bg-slate-200 text-slate-600 dark:bg-neutral-800 dark:text-neutral-400' },
};

// Same list drives the new-ticket form and the Chat with us tiles; values are what the backend stores as issueType.
export const TICKET_CATEGORIES = [
  { value: 'account', label: 'Account' },
  { value: 'live', label: 'LIVE' },
  { value: 'traffic', label: 'Traffic' },
  { value: 'interaction', label: 'Interaction' },
  { value: 'post', label: 'Post' },
  { value: 'monetization', label: 'Monetization' },
  { value: 'feed', label: 'Feed' },
  { value: 'other', label: 'Other' },
];

export function StatusPill({ status }) {
  const s = TICKET_STATUS[status] || TICKET_STATUS.OPEN;
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
