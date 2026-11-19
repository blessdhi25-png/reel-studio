'use client';

import { Timer, Wifi } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePref } from '@/lib/settingsPrefs';
import { SettingsGroup, SettingsPage, SettingsRow, ToggleRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;

export default function PlaybackPage() {
  const ok = useRequireAuth();
  const [dataSaver, setDataSaver] = usePref('dataSaver');
  if (!ok) return null;

  return (
    <SettingsPage title="Playback">
      <SettingsGroup footer="Data Saver caps streaming quality on mobile data for adaptive (HLS) videos. Saved on this device.">
        <ToggleRow icon={ic(Wifi)} title="Data Saver mode" subtitle="Lower video resolution on mobile networks" checked={dataSaver} onChange={setDataSaver} />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow href="/settings/wellbeing" icon={ic(Timer)} title="Break reminders" subtitle="Screen time & take-a-break prompts" />
      </SettingsGroup>
    </SettingsPage>
  );
}
