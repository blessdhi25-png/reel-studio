'use client';

import { useState } from 'react';
import { api } from '../lib/api';

// Preset gift tiers. Values are real USD cents — they go straight through
// Stripe Checkout via api.tipVideoCheckout / api.tipLiveStreamCheckout,
// same destination-charge flow the rest of the app already uses for tips.
// (There's no separate virtual-coin currency/wallet in this app; a "gift"
// is just a tip with a themed emoji + label on it.)
const GIFT_TIERS = [
  { id: 'coffee', emoji: '☕', label: 'Coffee', cents: 100 },
  { id: 'spark', emoji: '🔥', label: 'Spark', cents: 500 },
  { id: 'crown', emoji: '👑', label: 'Crown', cents: 2000 },
  { id: 'rocket', emoji: '🚀', label: 'Rocket', cents: 5000 },
];

const MIN_CENTS = 50; // matches backend floor ($0.50)
const MAX_CENTS = 100000; // $1,000 sanity ceiling for the custom field

function formatUsd(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * TipModal
 *
 * Props:
 * - target: { type: 'video' | 'live', id, username, avatarUrl }
 *     Who/what the tip is for. `type` decides which checkout endpoint fires.
 * - onClose(): called when the sheet should dismiss.
 * - onCheckoutStart(): optional, called right before we redirect to Stripe
 *     (e.g. so a parent can pause a video/stream preview).
 */
export default function TipModal({ target, onClose, onCheckoutStart }) {
  const [selectedTier, setSelectedTier] = useState(GIFT_TIERS[1].id);
  const [customMode, setCustomMode] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const isLive = target?.type === 'live';
  const activeTier = GIFT_TIERS.find((t) => t.id === selectedTier);
  const customCents = Math.round(parseFloat(customAmount || '0') * 100);
  const amountCents = customMode ? customCents : activeTier?.cents || 0;
  const amountValid = amountCents >= MIN_CENTS && amountCents <= MAX_CENTS;

  async function sendTip() {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('token')) {
      window.location.href = '/login';
      return;
    }
    if (!amountValid) {
      setError(
        customMode
          ? `Enter an amount between ${formatUsd(MIN_CENTS)} and ${formatUsd(MAX_CENTS)}`
          : 'Pick a gift or enter a custom amount'
      );
      return;
    }

    setSending(true);
    setError(null);
    try {
      onCheckoutStart?.();
      const { url } =
        target.type === 'live'
          ? await api.tipLiveStreamCheckout(target.id, amountCents, message.trim())
          : await api.tipVideoCheckout(target.id, amountCents);
      window.location.href = url; // hand off to Stripe-hosted checkout
    } catch (err) {
      setError(err.message || 'Something went wrong — try again.');
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-0 sm:px-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 text-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-extrabold">
            {isLive ? 'Send a gift' : 'Send a tip'}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white text-xl leading-none p-1 -m-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {target?.username && (
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 rounded-full bg-zinc-800 overflow-hidden shrink-0">
              {target.avatarUrl ? (
                <img src={target.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-zinc-400">
                  {target.username[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <p className="text-sm text-zinc-400">
              to <span className="text-white font-semibold">@{target.username}</span>
              {isLive && <span className="text-zinc-500"> · live now</span>}
            </p>
          </div>
        )}

        {/* Gift grid */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {GIFT_TIERS.map((tier) => {
            const active = !customMode && selectedTier === tier.id;
            return (
              <button
                key={tier.id}
                onClick={() => {
                  setCustomMode(false);
                  setSelectedTier(tier.id);
                  setError(null);
                }}
                className={`flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all ${
                  active
                    ? 'border-amber-500 bg-amber-500/10 scale-[1.02]'
                    : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                }`}
              >
                <span className="text-2xl leading-none">{tier.emoji}</span>
                <span className="text-[11px] font-semibold text-zinc-300">{tier.label}</span>
                <span className={`text-[11px] font-bold ${active ? 'text-amber-400' : 'text-zinc-500'}`}>
                  {formatUsd(tier.cents)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Custom amount toggle */}
        <button
          onClick={() => {
            setCustomMode((v) => !v);
            setError(null);
          }}
          className={`w-full text-left px-4 py-3 rounded-2xl border mb-4 transition-all ${
            customMode ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
          }`}
        >
          {customMode ? (
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 font-bold">$</span>
              <input
                autoFocus
                inputMode="decimal"
                value={customAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d*\.?\d{0,2}$/.test(v)) setCustomAmount(v);
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="0.00"
                className="bg-transparent outline-none text-white font-bold text-lg flex-1 placeholder-zinc-600"
              />
            </div>
          ) : (
            <span className="text-sm font-semibold text-zinc-300">💵 Custom amount</span>
          )}
        </button>

        {/* Optional message — only meaningful for live gifts, which surface
            it in the room's chat ticker via the tip webhook broadcast. */}
        {isLive && (
          <div className="mb-4">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
              Add a message (optional)
            </label>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 140))}
              placeholder="Say something with your gift…"
              className="mt-1.5 w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        <button
          onClick={sendTip}
          disabled={sending || !amountValid}
          className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3.5 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {sending ? (
            'Redirecting to checkout…'
          ) : (
            <>
              Send {activeTier && !customMode ? activeTier.emoji : '🎁'}{' '}
              {amountValid ? formatUsd(amountCents) : ''}
            </>
          )}
        </button>
        <p className="text-center text-[11px] text-zinc-600 mt-3">
          Payments are processed securely by Stripe. Platform keeps a 10% fee.
        </p>
      </div>
    </div>
  );
}
