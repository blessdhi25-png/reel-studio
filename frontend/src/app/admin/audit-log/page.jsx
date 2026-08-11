'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { LoadingSpinner } from '../../../components/LoadingScreen';

export default function AuditLogPage() {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminGetAuditLog().then(setActions).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <p className="font-body text-smoke text-sm mb-6">
        Every moderation action taken on the platform, most recent first — for accountability.
      </p>

      {loading && <LoadingSpinner label="Loading…" />}

      <div className="space-y-2">
        {actions.map((a) => (
          <div key={a.id} className="bg-ink2 rounded-sprocket p-3 flex items-center justify-between">
            <div>
              <p className="font-body text-sm text-bone">
                <span className="text-reel">@{a.admin?.username}</span> {a.actionType.replace(/_/g, ' ')}
                {' '}on {a.targetType} <span className="font-mono text-xs">{a.targetId}</span>
              </p>
              {a.reason && <p className="font-body text-xs text-smoke mt-1">{a.reason}</p>}
            </div>
            <span className="font-mono text-[10px] text-smoke whitespace-nowrap ml-3">
              {new Date(a.createdAt).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
