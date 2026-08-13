'use client';

import MessagesPage from '../../../components/MessagesPage';

export default function ThreadPage({ params }) {
  return <MessagesPage initialUserId={params.userId} />;
}
