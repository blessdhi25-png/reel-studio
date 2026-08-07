'use client';

export default function TipCancelPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 text-center">
      <div>
        <p className="font-display text-4xl text-bone tracking-wide mb-3">Tip cancelled</p>
        <p className="font-body text-smoke text-sm mb-8">No charge was made.</p>
        <a
          href="/"
          className="inline-block bg-reel text-ink font-body font-semibold px-6 py-3 rounded-sprocket"
        >
          Back to feed
        </a>
      </div>
    </main>
  );
}
