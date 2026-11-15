import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from 'lucide-react';
import { TONE_TEXT } from '../lib/callLogs';

export default function CallLogIcon({ kind, tone, isVideo, size = 14 }) {
  const cls = TONE_TEXT[tone] || TONE_TEXT.neutral;
  if (kind === 'missed') {
    return isVideo ? <Video size={size} className={cls} /> : <PhoneMissed size={size} className={cls} />;
  }
  if (kind === 'incoming') return <PhoneIncoming size={size} className={cls} />;
  if (kind === 'outgoing') return <PhoneOutgoing size={size} className={cls} />;
  return <Phone size={size} className={cls} />;
}
