'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, Clapperboard, MessageCircle, Megaphone, Play, Search, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { SettingsGroup, SettingsPage, SettingsRow } from '@/components/settings/SettingsUI';

const ITEMS = [
  { kind: 'watch', title: 'Watch history', Icon: Play },
  { kind: 'comments', title: 'Comment history', Icon: MessageCircle },
  { kind: 'search', title: 'Search history', Icon: Search },
  { kind: 'ads', title: 'Ad activity history', Icon: Megaphone },
  { kind: 'mentions', title: 'Mention history', Icon: AtSign },
  { kind: 'account', title: 'Account history', Icon: User },
  { kind: 'reuse', title: 'Reuse of content history', Icon: Clapperboard },
];

export default function ActivityCentrePage() {
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();
  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login');
  }, [ready, isAuthenticated, router]);
  if (!ready || !isAuthenticated) return null;

  return (
    <SettingsPage title="Activity centre">
      <SettingsGroup>
        {ITEMS.map(({ kind, title, Icon }) => (
          <SettingsRow key={kind} href={`/settings/activity/${kind}`} icon={<Icon size={18} strokeWidth={2.25} />} title={title} />
        ))}
      </SettingsGroup>
    </SettingsPage>
  );
}
