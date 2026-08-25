'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingScreen';

/**
 * /profile → redirects to the signed-in user's profile page
 * (`/profile/[id]`). Guest users are sent to /login.
 *
 * This previously lived (incorrectly) at /profile/edit/page.jsx — meaning
 * this redirect ran on that route instead, and the actual edit-profile
 * form didn't exist anywhere. Moved here to match what it's actually for;
 * a real form now lives at /profile/edit/page.jsx.
 */
export default function ProfileIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getStoredUser();
    if (user?.id) {
      router.replace(`/profile/${user.id}`);
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0a090e] text-white flex items-center justify-center">
      <LoadingSpinner label="Opening profile…" />
    </div>
  );
}
