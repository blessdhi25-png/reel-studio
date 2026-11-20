'use client';

import { useEffect, useState } from 'react';
import { Accessibility, Languages, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Segmented, SettingsBlock, SettingsGroup, SettingsPage, SettingsRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;

export default function DisplayPage() {
  const ok = useRequireAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false); // read the theme only after mount to avoid a hydration mismatch
  useEffect(() => setMounted(true), []);
  if (!ok) return null;

  return (
    <SettingsPage title="Display">
      <SettingsGroup>
        <SettingsBlock icon={ic(Moon)} title="Appearance" subtitle="Light is the default">
          <Segmented
            label="App theme"
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
            value={mounted ? (theme === 'dark' ? 'dark' : 'light') : undefined}
            disabled={!mounted}
            onChange={setTheme}
          />
        </SettingsBlock>
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow href="/settings/language" icon={ic(Languages)} title="Language" />
        <SettingsRow href="/settings/accessibility" icon={ic(Accessibility)} title="Accessibility" subtitle="Text size, contrast, motion" />
      </SettingsGroup>
    </SettingsPage>
  );
}
