'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { SettingsGroup, SettingsPage, SettingsRow, VerifiedBadge } from '@/components/settings/SettingsUI';

export default function AccountDetailsPage() {
  const router = useRouter();
  const { user, ready, isAuthenticated } = useAuth();
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login');
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    api.getMe().then((d) => !cancelled && setMe(d)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (!ready || !isAuthenticated || !user) return null;

  const email = me?.email ?? user.email;
  const verified = me?.emailVerified ?? user.emailVerified;
  // Phone numbers aren't part of the account model yet — show it honestly as not added.
  const phone = me?.phone ?? user.phone;

  return (
    <SettingsPage title="Account Details">
      <SettingsGroup title="Contact">
        <SettingsRow
          icon="✉️"
          title="Email"
          subtitle={email || '—'}
          right={verified != null && <VerifiedBadge verified={verified} />}
        />
        {verified === false && (
          <SettingsRow href="/verify-email" icon="✅" title="Verify your email" subtitle="Confirm it's really you" />
        )}
        <SettingsRow icon="📞" title="Phone" subtitle={phone || 'Not added'} />
      </SettingsGroup>

      <SettingsGroup title="Manage">
        <SettingsRow href="/profile/edit" icon="✏️" title="Edit Profile" subtitle="Name, bio, photo & banner" />
        <SettingsRow href="/settings/change-password" icon="🔑" title="Change Password" />
      </SettingsGroup>
    </SettingsPage>
  );
}
