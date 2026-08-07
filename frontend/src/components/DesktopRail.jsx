'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { api } from '../lib/api';
import CommentsPanel from './CommentsPanel';

// Pulls #hashtags out of the caption as a stand-in for "linked tags." Note:
// there's no product-tagging feature in the backend yet (no product/commerce
// model), so this rail only surfaces what's real — tags parsed from the
// caption — rather than fabricating a "linked products" section.
function extractTags(caption) {
  return (caption || '').match(/#[\w]+/g)?.slice(0, 8) || [];
}

const DesktopRail = forwardRef(function DesktopRail({ video, onToggleFollow, currentTime, onSeek }, ref) {
  const [isSelf, setIsSelf] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const commentsRef = useRef(null);
  const following = Boolean(video?.user?.isFollowing);

  useEffect(() => {
    if (!video) return;
    setCommentCount(Number(video.commentCount || 0));
    const stored = localStorage.getItem('user');
    setIsSelf(stored ? JSON.parse(stored).id === video.user?.id : false);
  }, [video?.id]);

  useImperativeHandle(ref, () => ({
    focusComments: () => commentsRef.current?.focusInput(),
  }));

  function toggleFollow() {
    if (!video?.user?.id) return;
    onToggleFollow?.(video.user.id);
  }

  if (!video) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-body text-smoke text-sm">Nothing to show yet.</p>
      </div>
    );
  }

  const tags = extractTags(video.caption);

  return (
    <div className="flex flex-col h-full w-full max-w-md border-l border-smoke/10 bg-ink2/40 pb-20">
      {/* Creator profile + video metadata */}
      <div className="p-6 border-b border-smoke/10 shrink-0">
        <div className="flex items-center gap-3">
          <a
            href={`/profile/${video.user?.id}`}
            className="w-12 h-12 rounded-full overflow-hidden bg-ink2 border border-smoke/20 shrink-0"
          >
            {video.user?.avatarUrl ? (
              <img src={video.user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full flex items-center justify-center font-display text-bone">
                {video.user?.username?.[0]?.toUpperCase()}
              </span>
            )}
          </a>
          <a
            href={`/profile/${video.user?.id}`}
            className="font-display text-lg text-bone tracking-wide truncate flex-1 min-w-0"
          >
            @{video.user?.username}
          </a>
          {!isSelf && (
            <button
              onClick={toggleFollow}
              className={`px-4 py-1.5 rounded-sprocket font-body text-xs font-semibold shrink-0 ${
                following ? 'border border-smoke/30 text-smoke' : 'bg-reel text-ink'
              }`}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>

        {!isSelf && <TipWidget video={video} />}

        {video.caption && <p className="font-body text-sm text-bone mt-4">{video.caption}</p>}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {tags.map((t) => (
              <span
                key={t}
                className="font-mono text-[11px] text-reel border border-reel/30 rounded-sprocket px-2 py-0.5"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <p className="font-mono text-[10px] text-smoke uppercase tracking-widest mt-4">
          {video.videoType === 'long' ? 'Feature' : 'Short'} · {commentCount} comments
        </p>
      </div>

      {/* Comments — permanently visible here, so they never sit on top of the video */}
      <div className="flex-1 min-h-0">
        <CommentsPanel
          ref={commentsRef}
          variant="inline"
          videoId={video.id}
          onCountChange={(updater) => setCommentCount(updater)}
          currentTime={currentTime}
          onSeek={onSeek}
        />
      </div>
    </div>
  );
});

export default DesktopRail;

// Quick-select micro-tip widget. Reuses the same checkout endpoint as the
// mobile tip modal (`/videos/:id/tip/checkout`) — this is a different entry
// point into the identical, already-working Stripe Checkout flow, not a new
// payment path. Because checkout is a redirect to Stripe's hosted page,
// there's no in-page "payment succeeded" moment to celebrate here; that
// confirmation instead arrives for the *receiving* creator in real time via
// the 'tip:received' socket event (see page.jsx).
function TipWidget({ video }) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const tippable = Boolean(video.user?.stripeOnboarded);

  async function sendTip(cents) {
    if (!localStorage.getItem('token')) {
      window.location.href = '/login';
      return;
    }
    if (!cents || cents < 50) {
      setError('Minimum tip is $0.50');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const { url } = await api.tipVideoCheckout(video.id, cents);
      window.location.href = url; // hand off to Stripe-hosted checkout
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  }

  if (!tippable) {
    return (
      <p className="mt-3 font-mono text-[10px] text-smoke/50 uppercase tracking-widest">
        Tips not open — creator hasn't set up payouts yet
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-sprocket border border-reel/40 text-reel font-body text-xs font-semibold"
      >
        <span>$</span> Tip Creator
      </button>

      {open && (
        <div className="mt-2 p-3 rounded-sprocket border border-smoke/15 bg-ink/40">
          <div className="flex gap-2">
            {[100, 300, 500].map((cents) => (
              <button
                key={cents}
                onClick={() => sendTip(cents)}
                disabled={sending}
                className="flex-1 py-2 font-mono text-sm rounded-sprocket border border-smoke/30 text-bone hover:border-reel/60 hover:text-reel disabled:opacity-50"
              >
                ${(cents / 100).toFixed(0)}
              </button>
            ))}
            <button
              onClick={() => setCustomOpen((o) => !o)}
              disabled={sending}
              className={`flex-1 py-2 font-mono text-sm rounded-sprocket border disabled:opacity-50 ${
                customOpen ? 'border-reel text-reel' : 'border-smoke/30 text-bone hover:border-reel/60 hover:text-reel'
              }`}
            >
              Custom
            </button>
          </div>

          {customOpen && (
            <div className="flex gap-2 mt-2">
              <div className="flex-1 flex items-center bg-ink text-bone font-mono text-sm rounded-sprocket px-3 border border-transparent focus-within:border-reel/50">
                <span className="text-smoke mr-1">$</span>
                <input
                  autoFocus
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent outline-none py-2 min-w-0"
                />
              </div>
              <button
                onClick={() => sendTip(Math.round(Number(customAmount) * 100))}
                disabled={sending || !customAmount}
                className="px-4 font-body text-sm font-semibold text-ink bg-reel rounded-sprocket disabled:opacity-50"
              >
                Send
              </button>
            </div>
          )}

          {error && <p className="font-body text-xs text-red-400 mt-2">{error}</p>}
          {sending && <p className="font-mono text-[10px] text-smoke mt-2">Redirecting to secure checkout…</p>}
        </div>
      )}
    </div>
  );
}
