'use client';

import { Suspense } from 'react';
import StaffDashboard from '@/components/staff/StaffDashboard';

// The layout (app/admin/layout.jsx) has already verified the viewer is an admin.
export default function AdminDashboardPage() {
  // StaffDashboard reads ?tab= from the URL, which needs a Suspense boundary for static builds.
  return (
    <Suspense fallback={null}>
      <StaffDashboard mode="admin" theme="dark" viewerRole="admin" />
    </Suspense>
  );
}
