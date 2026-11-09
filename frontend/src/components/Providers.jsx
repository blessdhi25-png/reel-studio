'use client';

import { ThemeProvider } from 'next-themes';

// Light by default; the Menu page and Settings > Appearance switch it.
// NB: enableSystem must be the boolean {false}. The string "{false}" is truthy and would
// switch OS-preference detection ON.
export default function Providers({ children }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </ThemeProvider>
  );
}
