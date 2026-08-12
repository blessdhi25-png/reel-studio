// Plain <img>, not next/image, is deliberate here: next/image's built-in
// optimizer refuses to serve SVGs unless `images.dangerouslyAllowSVG` is
// set in next.config.js (see that file), and on top of that its
// optimization endpoint doesn't run at all under some static/edge deploy
// targets — either gap shows up as a broken image icon in production even
// though the component itself is correct. /public/logo.svg is a small,
// trusted, local static asset with a fixed intrinsic size, which is
// exactly the case plain <img> is the recommended, deployment-agnostic
// choice for: no optimizer round-trip to depend on, so nothing here can
// be broken by a config that didn't get applied or a host that doesn't
// run Next's image server.
const SIZES = {
  sm: 32, // matches Tailwind's h-8 (2rem)
  md: 40, // matches h-10
  lg: 64, // matches h-16
};

// Fixed *height* class per size (not width) — width stays auto so the
// logo's own aspect ratio decides it, but the height is locked so a tight
// flex row (e.g. a header with min-w-0 siblings) can't compress the mark
// the way it could with no explicit sizing at all.
const HEIGHT_CLASS = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-16',
};

const TEXT_SIZE = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
};

export default function Logo({ size = 'md', showText = true, className = '' }) {
  const px = SIZES[size] || SIZES.md;
  const heightClass = HEIGHT_CLASS[size] || HEIGHT_CLASS.md;

  return (
    <div className={`flex items-center gap-2 shrink-0 ${className}`}>
      <img
        src="/logo.svg"
        alt="Reel Studio"
        width={px}
        height={px}
        // width/height attributes reserve the exact intrinsic box before
        // the file finishes loading (prevents layout shift); the
        // className then locks the *rendered* size so a squeezed flex
        // parent can't shrink or clip it — shrink-0 on both this element
        // and the wrapping div above is what actually guarantees that.
        className={`${heightClass} w-auto shrink-0`}
      />
      {showText && (
        <span className={`font-bold tracking-tight text-white whitespace-nowrap ${TEXT_SIZE[size] || TEXT_SIZE.md}`}>
          Reel Studio
        </span>
      )}
    </div>
  );
}
