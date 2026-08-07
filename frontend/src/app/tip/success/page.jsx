'use client';

export default function TipSuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 text-center">
      <div>
        <p className="font-display text-4xl text-reel tracking-wide mb-3">Tip sent</p>
        <p className="font-body text-smoke text-sm mb-8">
          Thanks for backing the creator — it may take a moment to reflect on their earnings page.
        </p>
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
