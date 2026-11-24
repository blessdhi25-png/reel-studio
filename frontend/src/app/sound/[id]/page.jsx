'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Play, Pause, Music, Eye, Heart } from 'lucide-react';
import BackButton from '@/components/BackButton';
import ThreeDotLoader from '@/components/ThreeDotLoader';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';

function compact(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export default function SoundPage() {
  const { id } = useParams();
  const router = useRouter();
  const audioRef = useRef(null);
  const [sound, setSound] = useState(null);
  const [videos, setVideos] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([api.getSound(id), api.getSoundVideos(id).catch(() => ({ videos: [] }))])
      .then(([s, v]) => {
        if (!alive) return;
        setSound(s);
        setVideos(Array.isArray(v) ? v : v?.videos || []);
      })
      .catch((err) => alive && setError(err?.status === 404 ? 'This sound is no longer available.' : friendlyError(err, 'Something went wrong. Please try again.')))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().then(() => setPlaying(true)).catch(() => setError('Could not play this sound. Please try again.'));
    else { a.pause(); setPlaying(false); }
  };

  if (loading) return <div className="min-h-screen bg-ink flex items-center justify-center"><ThreeDotLoader /></div>;

  if (error || !sound) {
    return (
      <div className="min-h-screen bg-ink text-white p-4">
        <BackButton />
        <p className="mt-16 text-center text-zinc-400">{error || 'This sound is no longer available.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-white pb-28">
      <div className="p-4"><BackButton /></div>

      <div className="px-5 flex gap-4 items-center">
        <button onClick={toggle} aria-label={playing ? 'Pause sound' : 'Play sound'} className="relative w-28 h-28 shrink-0 rounded-xl overflow-hidden bg-zinc-800 flex items-center justify-center">
          {sound.coverUrl ? <img src={sound.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <Music size={36} className="text-zinc-500" />}
          <span className="absolute inset-0 bg-black/35 flex items-center justify-center">
            {playing ? <Pause size={32} fill="white" /> : <Play size={32} fill="white" />}
          </span>
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight break-words">{sound.title}</h1>
          <p className="text-sm text-zinc-400 mt-1 truncate">{sound.artistName}</p>
          <p className="text-xs text-zinc-500 mt-1">{compact(sound.useCount)} {sound.useCount === 1 ? 'video' : 'videos'}</p>
        </div>
      </div>
      {sound.audioUrl && <audio ref={audioRef} src={sound.audioUrl} preload="none" onEnded={() => setPlaying(false)} />}

      <h2 className="px-5 mt-8 mb-3 text-sm font-semibold text-zinc-300">Videos using this sound</h2>
      {videos.length === 0 ? (
        <p className="px-5 text-sm text-zinc-500">No videos yet. Be the first to use it.</p>
      ) : (
        <div className="grid grid-cols-3 gap-0.5">
          {videos.map((v) => (
            <Link key={v.id} href={`/?video=${v.id}`} className="relative aspect-[3/4] bg-zinc-900 block">
              {v.thumbnailUrl && <img src={v.thumbnailUrl} alt={v.caption || ''} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
              <span className="absolute bottom-1 left-1 flex items-center gap-1 text-[11px] font-semibold drop-shadow"><Eye size={12} />{compact(v.viewCount)}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black via-black/90 to-transparent">
        <button onClick={() => router.push(`/upload?trackId=${sound.id}`)} className="w-full py-3.5 rounded-xl bg-[#fe2c55] text-white font-bold">
          Use this sound
        </button>
      </div>
    </div>
  );
}
