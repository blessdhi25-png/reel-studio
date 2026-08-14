import Image from 'next/image';

const SIZES = {
  sm: 28,
  md: 40,
  lg: 64,
};

const TEXT_SIZE = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
};

export default function Logo({ size = 'md', showText = true, className = '' }) {
  const px = SIZES[size] || SIZES.md;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src="/logo.svg"
        alt="Reel Studio"
        width={px}
        height={px}
        // Fixed width/height (rather than fill or intrinsic sizing) is what
        // actually prevents layout shift here — the box is reserved at the
        // exact rendered size before the image finishes loading.
        priority
      />
      {showText && (
        <span className={`font-bold tracking-tight text-white ${TEXT_SIZE[size] || TEXT_SIZE.md}`}>
          Reel Studio
        </span>
      )}
    </div>
  );
}
