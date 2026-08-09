import './globals.css';
import BottomNav from '../components/BottomNav';
import { AuthProvider } from '../context/AuthContext';

export const metadata = {
  title: 'Reel — short and long video, one feed',
  description: 'Watch, post, and get tipped — short clips and long videos in one place.',
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
        {/* AuthProvider is a Client Component; Next.js's App Router allows a
            Server Component layout like this one to render it as a wrapper
            with no extra "use client" needed here. */}
        <AuthProvider>
          {children}
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
