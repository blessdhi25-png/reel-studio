'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloudOff, HardDrive } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/context/ToastContext';
import { clearCachedMedia, formatBytes, getCachedMediaBytes, isCacheSupported } from '@/lib/storageCache';
import { SettingsGroup, SettingsPage, SettingsRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;

export default function OfflineVideosPage() {
  const ok = useRequireAuth();
  const toast = useToast();
  const [bytes, setBytes] = useState(null);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(() => {
    if (!isCacheSupported()) return setBytes(0);
    getCachedMediaBytes().then(setBytes).catch(() => setBytes(0));
  }, []);
  useEffect(refresh, [refresh]);

  async function clear() {
    setClearing(true);
    try {
      await clearCachedMedia();
      toast.success('Offline videos removed');
    } catch {
      toast.error("Couldn't remove them. Please try again.");
    } finally {
      setClearing(false);
      refresh();
    }
  }

  if (!ok) return null;
  return (
    <SettingsPage title="Offline videos">
      <SettingsGroup footer="Videos you’ve already watched are kept on this device so they can replay without a connection. They’re cleared with the browser cache or here.">
        <SettingsRow
          icon={ic(HardDrive)}
          title="Stored on this device"
          subtitle={bytes == null ? 'Calculating…' : isCacheSupported() ? formatBytes(bytes) : 'Not supported in this browser'}
          chevron={false}
          right={
            <button
              type="button"
              onClick={clear}
              disabled={clearing || !bytes}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-white font-sans font-bold text-xs hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {clearing ? 'Removing…' : 'Remove all'}
            </button>
          }
        />
        <SettingsRow href="/offline" icon={ic(CloudOff)} title="Offline page" subtitle="What you see when there’s no connection" />
      </SettingsGroup>
    </SettingsPage>
  );
}
