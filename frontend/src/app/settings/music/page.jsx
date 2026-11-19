'use client';

import { Disc3, Music2 } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { SettingsGroup, SettingsPage, SettingsRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;

export default function MusicSettingsPage() {
  const ok = useRequireAuth();
  if (!ok) return null;

  return (
    <SettingsPage title="Music">
      <SettingsGroup footer="Sounds come from tracks published by registered artists. Add one on the publish screen when you upload a video.">
        <SettingsRow href="/upload" icon={ic(Music2)} title="Add a sound to a video" subtitle="Pick a track when you publish" />
        <SettingsRow href="/artist/register" icon={ic(Disc3)} title="Become an artist" subtitle="Distribute your own tracks as sounds" />
      </SettingsGroup>
    </SettingsPage>
  );
}
