'use client';

import { History, Megaphone } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { SettingsGroup, SettingsPage, SettingsRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;

export default function AdsSettingsPage() {
  const ok = useRequireAuth();
  if (!ok) return null;

  return (
    <SettingsPage title="Ads">
      <SettingsGroup footer="Promotions let creators boost their own videos to reach more people.">
        <SettingsRow href="/promote" icon={ic(Megaphone)} title="Promote your videos" subtitle="Boost a video to a wider audience" />
        <SettingsRow href="/settings/activity/ads" icon={ic(History)} title="Ad activity history" />
      </SettingsGroup>
    </SettingsPage>
  );
}
