import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import AppShell from '../components/AppShell';

export const metadata = {
  title: 'Reel — short and long video, one feed',
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
        {/* AuthProvider/ToastProvider/AppShell are Client Components;
            Next.js's App Router allows a Server Component layout like this
            one to render them as wrappers with no extra "use client"
            needed here. AppShell holds the branded LoadingScreen until
            auth state has hydrated, and renders BottomNav itself once
            ready — see components/AppShell.jsx. */}
        <AuthProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
