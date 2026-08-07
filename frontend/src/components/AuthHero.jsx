'use client';

import Link from 'next/link';

const PREVIEW_CARDS = [
  { tag: 'Gaming', viewers: '2.4K', title: 'Ranked grind →  Diamond push' },
  { tag: 'Music', viewers: '918', title: 'Late night lo-fi session' },
  { tag: 'Chatting', viewers: '3.1K', title: 'AMA: building a channel' },
];

export default function AuthHero() {
  return (
    <div className="relative hidden lg:flex lg:col-span-7 bg-gradient-to-br from-zinc-900 via-zinc-950 to-amber-950/30 p-12 flex-col justify-between overflow-hidden border-r border-zinc-800/80">
      {/* Self-contained keyframes so the floating effect works even if
          animate-float isn't defined in tailwind.config.js / globals.css */}
      <style jsx>{`
        @keyframes authHeroFloat {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .float-card {
          animation: authHeroFloat 5s ease-in-out infinite;
        }
        .float-card:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* Ambient glow */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-[28rem] h-[28rem] bg-amber-600/10 rounded-full blur-3xl" />

      <div className="relative z-10">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-white">
          Reel
        </Link>
      </div>

      <div className="relative z-10 space-y-6">
        <h1 className="text-5xl font-extrabold leading-tight tracking-tight">
          Create. Share.{' '}
          <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
            Get Tipped.
          </span>
        </h1>
        <p className="text-zinc-400 text-base max-w-sm">
          Go live, drop clips, and build an audience that pays you back — all in one creator
          platform.
        </p>
      </div>

      {/* Floating reel preview cards */}
      <div className="relative z-10 h-56">
        {PREVIEW_CARDS.map((card, i) => (
          <div
            key={card.tag}
            className="absolute w-64 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 backdrop-blur-md shadow-2xl animate-float float-card transition-transform duration-300"
            style={{
              left: `${i * 42}px`,
              bottom: `${i * 18}px`,
              animationDelay: `${i * 0.6}s`,
              zIndex: 10 - i,
            }}
          >
            <div className="aspect-video bg-gradient-to-br from-zinc-800 to-zinc-700 rounded-lg mb-3 relative overflow-hidden">
              <span className="absolute top-2 left-2 bg-red-600/90 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-white animate-pulse" /> LIVE
              </span>
              <span className="absolute top-2 right-2 bg-black/60 text-zinc-200 text-[9px] font-semibold px-2 py-0.5 rounded-full">
                👁️ {card.viewers}
              </span>
            </div>
            <p className="text-xs font-semibold text-white truncate">{card.title}</p>
            <span className="inline-block mt-1.5 bg-zinc-800 text-amber-400 text-[9px] px-2 py-0.5 rounded-md">
              {card.tag}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

