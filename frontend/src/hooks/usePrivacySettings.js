'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { friendlyError } from '@/lib/friendlyError';

// Server-backed privacy settings (private profile, who can comment / message). `privacy` stays null
// until loaded so controls don't flash defaults; saves are optimistic with rollback so a failed PATCH
// never leaves the UI lying.
export function usePrivacySettings() {
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const [privacy, setPrivacy] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    api
      .getPrivacySettings()
      .then((d) => !cancelled && setPrivacy({
        isPrivate: !!d.isPrivate,
        messagePrivacy: d.messagePrivacy || 'followers',
        commentPrivacy: d.commentPrivacy || 'everyone',
      }))
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  async function save(partial) {
    const previous = privacy;
    setPrivacy({ ...privacy, ...partial });
    setSaving(true);
    try {
      await api.updatePrivacySettings(partial);
    } catch (err) {
      setPrivacy(previous);
      toast.error(friendlyError(err, "Couldn't save that setting. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return { privacy, loadFailed, saving, locked: !privacy || saving, save };
}
