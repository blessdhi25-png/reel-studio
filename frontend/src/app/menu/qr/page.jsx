'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function QrCodePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profileUrl, setProfileUrl] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      router.push('/login');
      return;
    }
    const u = JSON.parse(stored);
    setUser(u);
    setProfileUrl(`${window.location.origin}/profile/${u.id}`);
  }, [router]);

  if (!user) return null;

  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
    profileUrl
  )}`;

  return (
    <main className="min-h-screen px-6 py-10 max-w-md mx-auto flex flex-col items-center pb-20">
      <a href="/menu" className="font-mono text-xs text-smoke uppercase tracking-widest self-start">
        ← Back to menu
      </a>

      <h1 className="font-display text-3xl text-bone tracking-wide mt-8 mb-2">Your QR code</h1>
      <p className="font-body text-smoke text-sm mb-8 text-center">
        Anyone who scans this opens your profile.
      </p>

      <div className="bg-bone p-4 rounded-sprocket">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrImgSrc} alt="Profile QR code" width={280} height={280} />
      </div>

      <p className="font-mono text-xs text-smoke mt-6 break-all text-center">{profileUrl}</p>

      <p className="font-body text-[11px] text-smoke/70 mt-8 text-center max-w-xs">
        Generated via a third-party QR service — the code itself isn't tracked or stored by Reel.
      </p>
    </main>
  );
}
