'use client';

import { MessageSquare, Contrast, FastForward, Film, Sparkles, AlertTriangle, Type } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePref } from '@/lib/settingsPrefs';
import { Segmented, SettingsBlock, SettingsGroup, SettingsPage, ToggleRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;
const SIZES = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'Largest' },
];

export default function AccessibilityPage() {
  const ok = useRequireAuth();
  const [textSize, setTextSize] = usePref('textSize');
  const [highContrast, setHighContrast] = usePref('highContrast');
  const [skipPhoto, setSkipPhoto] = usePref('skipPhotosensitive');
  const [captions, setCaptions] = usePref('captions');
  const [reduceMotion, setReduceMotion] = usePref('reduceMotion');
  const [fastScroll, setFastScroll] = usePref('fastScroll');
  const [animated, setAnimated] = usePref('animatedThumbnails');
  if (!ok) return null;

  return (
    <SettingsPage title="Accessibility">
      <SettingsGroup title="Vision" footer="Text size and contrast apply immediately across the whole app.">
        <SettingsBlock icon={ic(Type)} title="Text size" subtitle="Scales text throughout the app">
          <Segmented label="Text size" options={SIZES} value={textSize} onChange={setTextSize} />
        </SettingsBlock>
        <ToggleRow icon={ic(Contrast)} title="Increase colour contrast" subtitle="Brighter secondary text and stronger borders" checked={highContrast} onChange={setHighContrast} />
      </SettingsGroup>

      <SettingsGroup
        title="Content"
        footer="Captions show on videos that include them. Skip photosensitive posts is saved now and starts filtering as soon as creators can mark flashing content; nothing is flagged yet."
      >
        <ToggleRow icon={ic(AlertTriangle)} title="Skip photosensitive posts" subtitle="Avoid posts marked as flashing or strobing" checked={skipPhoto} onChange={setSkipPhoto} />
        <ToggleRow icon={ic(MessageSquare)} title="Captions" subtitle="Show captions on videos when available" checked={captions} onChange={setCaptions} />
      </SettingsGroup>

      <SettingsGroup title="Motion" footer="All of these are saved on this device.">
        <ToggleRow icon={ic(Sparkles)} title="Reduced motion" subtitle="Turn off animations and transitions" checked={reduceMotion} onChange={setReduceMotion} />
        <ToggleRow icon={ic(FastForward)} title="Faster scroll speed" subtitle="Jump between videos instantly instead of gliding" checked={fastScroll} onChange={setFastScroll} />
        <ToggleRow icon={ic(Film)} title="Animated thumbnails" subtitle="Play previews in template pickers" checked={animated} onChange={setAnimated} />
      </SettingsGroup>
    </SettingsPage>
  );
}
