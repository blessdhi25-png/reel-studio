'use client';

import { Ban, Droplets, Lock, MessageCircle } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePrivacySettings } from '@/hooks/usePrivacySettings';
import { usePref } from '@/lib/settingsPrefs';
import { Segmented, SettingsBlock, SettingsGroup, SettingsPage, SettingsRow, ToggleRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;
// Values match the backend enum on User.commentPrivacy.
const AUDIENCE_OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'none', label: 'Nobody' },
];

export default function AudienceControlPage() {
  const ok = useRequireAuth();
  const { privacy, loadFailed, locked, save } = usePrivacySettings();
  const [watermark, setWatermark] = usePref('watermark');
  if (!ok) return null;

  return (
    <SettingsPage title="Audience control">
      <SettingsGroup footer={loadFailed ? "Couldn't load your settings. Reload the page to try again." : undefined}>
        <ToggleRow
          icon={ic(Lock)}
          title="Private profile"
          subtitle="Only followers can see your videos"
          checked={!!privacy?.isPrivate}
          disabled={locked}
          onChange={(next) => save({ isPrivate: next })}
        />
        <SettingsBlock icon={ic(MessageCircle)} title="Who can comment" subtitle="On your videos">
          <Segmented label="Who can comment on your videos" options={AUDIENCE_OPTIONS} value={privacy?.commentPrivacy} disabled={locked} onChange={(value) => save({ commentPrivacy: value })} />
        </SettingsBlock>
        <ToggleRow
          icon={ic(Droplets)}
          title="Video downloads & watermarking"
          subtitle={watermark ? 'Exported clips include the ClipPulse watermark' : 'Exported clips are saved without a watermark'}
          checked={watermark}
          onChange={setWatermark}
        />
        <SettingsRow href="/settings/privacy" icon={ic(Ban)} title="Blocked accounts" subtitle="Manage who you’ve blocked" />
      </SettingsGroup>
    </SettingsPage>
  );
}
