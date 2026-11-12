// Studio inherits the root layout (providers, app shell, bottom nav). This file
// previously re-declared <html>/<body> and every provider, which nests a second
// document inside the first and crashes on mount — so it's a plain passthrough.
export default function StudioLayout({ children }) {
  return children;
}
