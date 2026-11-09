import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { SocketProvider } from '@/context/SocketContext';
import AppShell from '@/components/AppShell';
import Providers from '@/components/Providers';

export const metadata = {
  title: 'ClipPulse — Create & Share Short Videos',
  description: 'Watch, post, and get tipped — short clips and long videos in one place.',
  // Served from /public. Required for installability and for Bubblewrap (TWA) to
  // generate the Android wrapper from this URL.
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/logo.svg',
    apple: '/icons/apple-touch-icon.png',
  },
};

// viewportFit: 'cover' is required for env(safe-area-inset-*) to report real
// values on iOS — without it the bottom nav has no idea a home-indicator
// gesture strip exists and sits right on top of it.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000', // matches manifest.json; colours the Android status bar / TWA splash
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-white text-slate-900 dark:bg-ink dark:text-bone">
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
        <Providers>
          <AuthProvider>
            <ToastProvider>
              <SocketProvider>
                <AppShell>{children}</AppShell>
              </SocketProvider>
            </ToastProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
