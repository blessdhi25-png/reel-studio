// Shared presentation logic for call-log entries (Calls tab + in-chat pills).
// `log` is the shape returned by GET /calls: { direction: 'incoming'|'outgoing', callType: 'VOICE'|'VIDEO',
// status: 'COMPLETED'|'MISSED'|'NO_ANSWER'|'DECLINED', durationSeconds, createdAt, peer }.

export function formatCallDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
}

// kind drives the icon; tone drives the colour ('red' | 'emerald' | 'neutral').
export function describeCall(log) {
  const isVideo = log.callType === 'VIDEO';
  const noun = isVideo ? 'video' : 'voice';
  const incoming = log.direction === 'incoming';
  const missed = log.status === 'MISSED' || log.status === 'NO_ANSWER';

  if (incoming && missed) return { kind: 'missed', tone: 'red', label: `Missed ${noun} call` };
  if (log.status === 'DECLINED') return { kind: incoming ? 'incoming' : 'outgoing', tone: 'neutral', label: 'Declined' };
  if (incoming) return { kind: 'incoming', tone: 'emerald', label: `Incoming · ${formatCallDuration(log.durationSeconds)}` };
  if (missed) return { kind: 'outgoing', tone: 'neutral', label: 'No answer' };
  return { kind: 'outgoing', tone: 'neutral', label: `Outgoing · ${formatCallDuration(log.durationSeconds)}` };
}

export function formatCallTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
  const clock = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return clock;
  if (yesterday) return `Yesterday ${clock}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${clock}`;
}

export const TONE_TEXT = { red: 'text-red-400', emerald: 'text-emerald-400', neutral: 'text-zinc-400' };
