'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

// Signed-in-only settings screens: redirect to /login when signed out. Returns true once it's safe to render.
export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, isAuthenticated } = useAuth();
  useEffect(() => {
    if (ready && !isAuthenticated && pathname !== '/login') router.replace('/login');
  }, [ready, isAuthenticated, pathname, router]);
  return ready && isAuthenticated;
}
