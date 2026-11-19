'use client';

import { MessageSquare } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePrivacySettings } from '@/hooks/usePrivacySettings';
import { Segmented, SettingsBlock, SettingsGroup, SettingsPage, SettingsRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;
const AUDIENCE_OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'none', label: 'Nobody' },
];

export default function InboxMessagingPage() {
  const ok = useRequireAuth();
  const { privacy, loadFailed, locked, save } = usePrivacySettings();
  if (!ok) return null;

  return (
    <SettingsPage title="Inbox & Messaging">
      <SettingsGroup
        footer={loadFailed ? "Couldn't load your settings. Reload the page to try again." : 'This also decides who can start a voice or video call with you.'}
      >
        <SettingsBlock icon={ic(MessageSquare)} title="Who can message you" subtitle="Direct messages and calls">
          <Segmented label="Who can send you direct messages" options={AUDIENCE_OPTIONS} value={privacy?.messagePrivacy} disabled={locked} onChange={(value) => save({ messagePrivacy: value })} />
        </SettingsBlock>
      </SettingsGroup>
      <SettingsGroup title="Shortcuts">
        <SettingsRow href="/messages" icon={ic(MessageSquare)} title="Open inbox" />
      </SettingsGroup>
    </SettingsPage>
  );
}
