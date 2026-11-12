'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import LoadingScreen from '@/components/LoadingScreen';
import BottomNav from '@/components/BottomNav';
import DesktopSidebar, { sidebarShownFor, SIDEBAR_PAD_CLASS } from '@/components/DesktopSidebar';
import ChatHub from '@/components/ChatHub';
import ScreenTimeTracker from '@/components/ScreenTimeTracker';
import ThemeSurface from '@/components/ThemeSurface';
import SwipeNavigator from '@/components/SwipeNavigator';

// AuthContext's `ready` flag (see context/AuthContext.jsx) already
// distinguishes "haven't checked localStorage yet" from "checked, no one's
// signed in" — that's the exact signal for "user auth state fully loaded"
// from the brief, and it's normally near-instant (a synchronous
// localStorage read), so this only actually shows for a frame or two on a
// real device, not the full 1.5s pulse cycle.
//
// timedOut is a deliberate safety net: if `ready` never flips for some
// unforeseen reason, this still lets the person into the app after 4s
// rather than showing a branded splash forever. A broken loading screen
// should never be able to make the whole app unusable.
export default function AppShell({ children }) {
  const { ready } = useAuth();
  const pathname = usePathname();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, []);

  if (!ready && !timedOut) {
    return <LoadingScreen />;
  }

  return (
    <>
      <DesktopSidebar />
      {/* Below lg there is no sidebar, so the wrapper adds no padding and mobile layout is untouched. */}
      <div className={sidebarShownFor(pathname) ? SIDEBAR_PAD_CLASS : undefined}>
        <ThemeSurface>{children}</ThemeSurface>
      </div>
      <SwipeNavigator />
      <ChatHub />
      <ScreenTimeTracker />
      <BottomNav />
    </>
  );
}
