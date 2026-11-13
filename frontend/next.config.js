/** @type {import('next').NextConfig} */
const nextConfig = {
  // Common legal URLs (and old links, e.g. from app-store listings or emails) map to the real pages.
  async redirects() {
    return [
      { source: '/terms', destination: '/legal/terms', permanent: true },
      { source: '/privacy', destination: '/legal/privacy', permanent: true },
      { source: '/terms-of-service', destination: '/legal/terms', permanent: true },
      { source: '/privacy-policy', destination: '/legal/privacy', permanent: true },
    ];
  },
  images: {
    // next/image's built-in optimizer refuses to serve SVGs by default
    // (returns a 400, which shows up as a broken image icon) — it treats
    // SVG as unsafe to run through the raster pipeline unless explicitly
    // opted in. /public/logo.svg is our own trusted, static asset (not
    // user-uploaded), so it's safe to allow here. contentSecurityPolicy
    // is the paired safeguard Next recommends: even though we trust this
    // file, it stops any SVG served through the optimizer from executing
    // scripts if that ever changes.
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

module.exports = nextConfig;
