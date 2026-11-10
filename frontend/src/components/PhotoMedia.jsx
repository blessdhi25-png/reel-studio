'use client';

import { useEffect, useRef, useState } from 'react';
import TextOverlayLayer from './TextOverlayLayer';

// Cloudinary delivery URLs can carry transformations in the path. Asking for
// f_auto (AVIF/WebP where supported) + q_auto:best + a 2048px long-edge cap
// keeps photos crisp on retina phones without shipping a 4096px original to
// every card. Anything that isn't a plain Cloudinary upload URL (blob: previews,
// other hosts, already-transformed URLs) is returned untouched.
export function optimizedPhotoUrl(url) {
  if (typeof url !== 'string') return url;
  const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/);
  return m ? `${m[1]}f_auto,q_auto:best,c_limit,w_2048/${m[2]}` : url;
}

// A photo shown whole (object-contain) over a blurred copy of itself, with its
// text overlays laid over the *actual image box* — not the letterboxed
// container — so overlay positions line up identically in the editor, the
// feed and every screen size. `children` render inside that image box
// (the editor's drag layer goes here).
export default function PhotoMedia({ src, alt = '', overlays, children, onLoad, onError, className = '' }) {
  const wrapRef = useRef(null);
  const [aspect, setAspect] = useState(null);
  const [wrap, setWrap] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWrap({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let box = { w: 0, h: 0 };
  if (aspect && wrap.w && wrap.h) {
    box = wrap.w / wrap.h > aspect ? { w: wrap.h * aspect, h: wrap.h } : { w: wrap.w, h: wrap.w / aspect };
  }
  const url = optimizedPhotoUrl(src);

  return (
    <div ref={wrapRef} className={`relative w-full h-full overflow-hidden bg-black ${className}`}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" />
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ width: box.w, height: box.h, containerType: 'inline-size' }}>
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={alt}
              decoding="async"
              draggable={false}
              className="block w-full h-full select-none"
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (w && h) setAspect(w / h);
                onLoad?.(e);
              }}
              onError={onError}
            />
          )}
          <TextOverlayLayer overlays={overlays} />
          {children}
        </div>
      </div>
    </div>
  );
}
