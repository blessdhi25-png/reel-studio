import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { SocketProvider } from '@/context/SocketContext';
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'ClipPulse — Create & Share Short Videos',
  description: 'Watch, post, and get tipped — short clips and long videos in one place.',
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
};

// viewportFit: 'cover' is required for env(safe-area-inset-*) to report real
// values on iOS — without it the bottom nav has no idea a home-indicator
// gesture strip exists and sits right on top of it.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {/* AuthProvider/ToastProvider/SocketProvider/AppShell are Client
            Components; Next.js's App Router allows a Server Component
            layout like this one to render them as wrappers with no extra
            "use client" needed here. AppShell holds the branded
            LoadingScreen until auth state has hydrated, and renders
            BottomNav itself once ready — see components/AppShell.jsx.
            SocketProvider sits inside both Auth and Toast since it reads
            the signed-in token and pops toasts for real-time events.
            ChatHub is mounted inside AppShell (fixed bottom-20 left-4 z-40)
            so it floats globally over the video feed without freezing playback. */}
        <AuthProvider>
          <ToastProvider>
            <SocketProvider>
              <AppShell>{children}</AppShell>
            </SocketProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
