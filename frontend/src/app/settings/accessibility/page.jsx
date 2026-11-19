'use client';

import { Sparkles, Type } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePref } from '@/lib/settingsPrefs';
import { SettingsGroup, SettingsPage, ToggleRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;

export default function AccessibilityPage() {
  const ok = useRequireAuth();
  const [reduceMotion, setReduceMotion] = usePref('reduceMotion');
  const [largeText, setLargeText] = usePref('largeText');
  if (!ok) return null;

  return (
    <SettingsPage title="Accessibility">
      <SettingsGroup footer="These apply immediately across the whole app and are saved on this device.">
        <ToggleRow icon={ic(Sparkles)} title="Reduce motion" subtitle="Turn off animations and transitions" checked={reduceMotion} onChange={setReduceMotion} />
        <ToggleRow icon={ic(Type)} title="Larger text" subtitle="Scale text up by about 12%" checked={largeText} onChange={setLargeText} />
      </SettingsGroup>
    </SettingsPage>
  );
}
