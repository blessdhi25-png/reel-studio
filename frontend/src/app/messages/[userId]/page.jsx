'use client';

import ChatHub from '../../../components/ChatHub';

export default function ThreadPage({ params }) {
  return <ChatHub initialUserId={params.userId} />;
}
