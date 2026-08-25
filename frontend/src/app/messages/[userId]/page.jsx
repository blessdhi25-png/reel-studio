'use client';

import ChatThreadView from '../../../components/ChatThreadView';

export default function ThreadPage({ params }) {
  return <ChatThreadView otherUserId={params.userId} />;
}
