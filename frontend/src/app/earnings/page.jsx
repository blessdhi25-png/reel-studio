'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../../components/LoadingScreen';

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function EarningsPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [stripeStatus, setStripeStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    Promise.all([api.getEarnings(), api.getStripeStatus()])
      .then(([earnings, status]) => {
        setData(earnings);
        setStripeStatus(status);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const { url } = await api.connectStripe();
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setConnecting(false);
    }
  }

  async function handleDashboard() {
    try {
      const { url } = await api.getStripeDashboardLink();
      window.location.href = url;
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <LoadingSpinner label="Loading…" />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
      <a href="/" className="font-mono text-xs text-smoke uppercase tracking-widest">
        ← Back to feed
      </a>

      <h1 className="font-display text-4xl text-bone tracking-wide mt-8 mb-1">Earnings</h1>
      <p className="font-body text-smoke text-sm mb-8">Tips from viewers, all in one ledger.</p>

      {error && <p className="font-body text-sm text-red-400 mb-6">{error}</p>}

      {data && (
        <>
          <div className="bg-ink2 rounded-sprocket p-6 mb-8 border border-reel/20">
            <p className="font-mono text-xs text-smoke uppercase tracking-widest mb-2">
              Total earned
            </p>
            <p className="font-display text-5xl text-reel tracking-wide">
              {formatCents(data.totalCents)}
            </p>
          </div>

          <div className="mb-6">
            <p className="font-mono text-xs text-smoke uppercase tracking-widest mb-3">
              Transaction history
            </p>
            <div className="space-y-2">
              {data.transactions.length === 0 && (
                <p className="font-body text-smoke text-sm">No tips yet.</p>
              )}
              {data.transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between bg-ink2 rounded-sprocket px-4 py-3"
                >
                  <div>
                    <p className="font-body text-sm text-bone capitalize">{t.type.replace('_', ' ')}</p>
                    <p className="font-mono text-[10px] text-smoke mt-1">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="font-mono text-sm text-reel">{formatCents(t.amountCents)}</p>
                </div>
              ))}
            </div>
          </div>

          {stripeStatus?.payoutsEnabled ? (
            <button
              onClick={handleDashboard}
              className="w-full bg-reel text-ink font-body font-semibold py-3 rounded-sprocket"
            >
              View Stripe dashboard
            </button>
          ) : (
            <>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full bg-reel text-ink font-body font-semibold py-3 rounded-sprocket disabled:opacity-50"
              >
                {connecting ? 'Redirecting…' : 'Set up payouts'}
              </button>
              <p className="font-body text-xs text-smoke mt-3 text-center">
                Tips accumulate here, but you need a connected payout account before
                money can actually reach your bank.
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
}
