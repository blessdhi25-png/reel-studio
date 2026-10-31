'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

// Whether the signed-in user is an ADMIN (the only role allowed into the admin portal).
//
// Decided by the BACKEND (GET /admin/me, which re-reads the user's current
// role from the database) rather than by the role cached in localStorage, so
// a stale or hand-edited local value can't make the link appear, and someone
// promoted after logging in sees it without re-logging. The link is only a
// convenience — /admin/* is separately enforced by middleware.js, the admin
// layout, and the backend's authorizeRoles('moderator', 'admin').
//
// Roles are stored lowercase in the database ('user' | 'moderator' | 'admin').
export const STAFF_ROLES = ['admin'];

export function useStaffAccess() {
  const [state, setState] = useState({ checked: false, isStaff: false, role: null });

  useEffect(() => {
    let cancelled = false;
    if (!window.localStorage.getItem('token')) {
      setState({ checked: true, isStaff: false, role: null });
      return;
    }
    api
      .adminMe()
      .then((me) => {
        if (!cancelled) setState({ checked: true, isStaff: STAFF_ROLES.includes(me?.role), role: me?.role ?? null });
      })
      .catch(() => {
        // 403 for ordinary users (expected) or a network error — either way, no link.
        if (!cancelled) setState({ checked: true, isStaff: false, role: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
