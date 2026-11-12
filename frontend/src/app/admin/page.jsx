'use client';

import StaffDashboard from '@/components/staff/StaffDashboard';

// The layout (app/admin/layout.jsx) has already verified the viewer is an admin.
export default function AdminDashboardPage() {
  return <StaffDashboard mode="admin" theme="dark" viewerRole="admin" />;
}
