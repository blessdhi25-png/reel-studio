'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { useSocketContext } from './SocketContext';

// Live discovery: tracks which creators I follow are live right now and pops a tappable banner the
// moment one of them goes live (socket event `live:started`, pushed by POST /live/start).
// `liveNow` also feeds the sidebar badge and the Inbox "Live now" strip.
const BANNER_MS = 12000;

const LiveAlertsContext = createContext({ liveNow: [], banner: null, dismissBanner: () => {} });

export function LiveAlertsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { socket } = useSocketContext();
  const pathname = usePathname();
  const router = useRouter();
  const [liveNow, setLiveNow] = useState([]);
  const [banner, setBanner] = useState(null);
  const hideTimer = useRef(null);

  const dismissBanner = useCallback(() => {
    clearTimeout(hideTimer.current);
    setBanner(null);
  }, []);

  // Initial list + a slow refresh as a safety net behind the socket events.
  useEffect(() => {
    if (!isAuthenticated) {
      setLiveNow([]);
      setBanner(null);
      return undefined;
    }
    const load = () => api.getFollowingLive().then((list) => Array.isArray(list) && setLiveNow(list)).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!socket) return undefined;
    function onStarted(s) {
      if (!s?.id) return;
      setLiveNow((prev) => (prev.some((x) => x.id === s.id) ? prev : [s, ...prev]));
      setBanner(s);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
    }
    function onEnded({ id }) {
      setLiveNow((prev) => prev.filter((x) => x.id !== id));
      setBanner((b) => (b?.id === id ? null : b));
    }
    socket.on('live:started', onStarted);
    socket.on('live:ended', onEnded);
    return () => {
      socket.off('live:started', onStarted);
      socket.off('live:ended', onEnded);
      clearTimeout(hideTimer.current);
    };
  }, [socket]);

  const value = useMemo(() => ({ liveNow, banner, dismissBanner }), [liveNow, banner, dismissBanner]);
  const visible = banner && !pathname.startsWith(`/live/${banner.id}`);

  return (
    <LiveAlertsContext.Provider value={value}>
      {children}
      {visible && (
        <div
          className="fixed inset-x-3 top-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[28rem] z-[70]"
          style={{ paddingTop: 'env(safe-area-inset-top)', animation: 'live-banner-in 0.25s ease-out' }}
          role="status"
        >
          <div className="flex items-center gap-3 rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-red-500/40 shadow-2xl p-2.5 pr-2">
            <button
              onClick={() => {
                dismissBanner();
                router.push(`/live/${banner.id}`);
              }}
              className="flex items-center gap-3 min-w-0 flex-1 text-left"
              aria-label={`${banner.host?.username} is live now. Tap to join`}
            >
              <span className="relative shrink-0">
                <span className="w-11 h-11 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center text-amber-400 font-bold ring-2 ring-red-500">
                  {banner.host?.avatarUrl ? (
                    <img src={banner.host.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    banner.host?.username?.[0]?.toUpperCase()
                  )}
                </span>
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[9px] font-extrabold px-1.5 rounded-full leading-4">
                  LIVE
                </span>
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-sm text-white truncate">@{banner.host?.username} is live now!</span>
                <span className="block text-xs font-semibold text-zinc-400 truncate">
                  {banner.title ? `${banner.title} · ` : ''}Tap to join
                </span>
              </span>
            </button>
            <button
              onClick={dismissBanner}
              aria-label="Dismiss"
              className="w-8 h-8 shrink-0 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>
          <style>{`@keyframes live-banner-in { from { transform: translateY(-16px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
        </div>
      )}
    </LiveAlertsContext.Provider>
  );
}

export function useLiveAlerts() {
  return useContext(LiveAlertsContext);
}
