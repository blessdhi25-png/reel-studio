'use client';

import { useCallback, useEffect, useState } from 'react';
import { HardDrive, Search } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/context/ToastContext';
import { clearCachedMedia, formatBytes, getCachedMediaBytes, isCacheSupported } from '@/lib/storageCache';
import { SettingsGroup, SettingsPage, SettingsRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;
const RECENTS_KEY = 'clippulse.recentSearches';
const BTN = 'shrink-0 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-white font-sans font-bold text-xs hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

export default function FreeUpSpacePage() {
  const ok = useRequireAuth();
  const toast = useToast();
  const [bytes, setBytes] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [recents, setRecents] = useState(0);

  const refresh = useCallback(() => {
    if (!isCacheSupported()) setBytes(0);
    else getCachedMediaBytes().then(setBytes).catch(() => setBytes(0));
    try {
      const list = JSON.parse(window.localStorage.getItem(RECENTS_KEY) || '[]');
      setRecents(Array.isArray(list) ? list.length : 0);
    } catch {
      setRecents(0);
    }
  }, []);
  useEffect(refresh, [refresh]);

  async function clearCache() {
    setClearing(true);
    try {
      await clearCachedMedia();
      toast.success('Cache cleared');
    } catch {
      toast.error("Couldn't clear the cache. Please try again.");
    } finally {
      setClearing(false);
      refresh();
    }
  }

  function clearSearches() {
    try {
      window.localStorage.removeItem(RECENTS_KEY);
    } catch {
      /* storage blocked */
    }
    toast.success('Search history cleared');
    refresh();
  }

  if (!ok) return null;
  return (
    <SettingsPage title="Free up space">
      <SettingsGroup footer="Clearing these doesn’t affect your account, videos or messages.">
        <SettingsRow
          icon={ic(HardDrive)}
          title="Cached videos & images"
          subtitle={bytes == null ? 'Calculating…' : `${formatBytes(bytes)} on this device`}
          chevron={false}
          right={<button type="button" onClick={clearCache} disabled={clearing || !bytes} className={BTN}>{clearing ? 'Clearing…' : 'Clear'}</button>}
        />
        <SettingsRow
          icon={ic(Search)}
          title="Recent searches"
          subtitle={recents ? `${recents} saved on this device` : 'Nothing saved'}
          chevron={false}
          right={<button type="button" onClick={clearSearches} disabled={!recents} className={BTN}>Clear</button>}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}
