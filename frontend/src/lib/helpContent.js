// Help Centre content (Settings → Help Centre). Plain data so copy can be edited without touching the
// page. `link` is optional: { label, href } shown under the answer.
export const HELP_CATEGORIES = [
  {
    id: 'account',
    title: 'Account',
    items: [
      {
        q: 'How do I change my password?',
        a: 'Open Settings → Security & Permissions → Change Password. If you’ve turned on the Biometric Security Lock, you’ll confirm with your fingerprint or screen lock first. Changing your password signs out your other sessions.',
        link: { label: 'Change password', href: '/settings/change-password' },
      },
      {
        q: 'How do I update my email, phone or bio?',
        a: 'Go to Settings → Account Details. Changing your email sends a verification code to the new address, and it stays unverified until you enter it.',
        link: { label: 'Account details', href: '/settings/account' },
      },
      {
        q: 'My posts aren’t getting views',
        a: 'New videos can take a little while to be picked up, and reach depends on how people react in the first hours. A few things usually help:',
        steps: [
          'Make sure the video is public: open it from your profile and check it isn’t private or still processing.',
          'Check that your profile isn’t set to Private in Settings → Audience control, since only followers can see private profiles.',
          'Add a clear caption, a fitting sound and a few relevant hashtags so people can find it.',
          'Post when your followers are online and keep your videos short and engaging from the first second.',
          'Boost a video from Promote to reach a wider audience.',
        ],
        link: { label: 'Promote a video', href: '/promote' },
      },
      {
        q: 'Account safety',
        a: 'Keep your account secure with a few quick checks:',
        steps: [
          'Turn on the Biometric Security Lock in Settings so profile changes and account switching need your fingerprint or screen lock.',
          'Use a password you don’t use anywhere else, and change it if you think it was exposed.',
          'Review Security alerts for new logins or changes you don’t recognise.',
          'If something looks wrong, change your password straight away. That signs out your other sessions.',
        ],
        link: { label: 'Security alerts', href: '/settings/help/security' },
      },
      {
        q: 'Others cannot see my newly uploaded videos',
        a: 'Most of the time this is one of these:',
        steps: [
          'The upload is still processing. Wait a minute or two, then refresh your profile.',
          'The video was posted as private, or your profile is Private, so only followers can see it.',
          'The video is awaiting or failed review. Check Activity centre for notices about it.',
          'The viewer is on a weak connection. Ask them to refresh or try again on Wi-Fi.',
          'Still not showing? Open a support ticket with the video title and when you posted it.',
        ],
        link: { label: 'Open a support ticket', href: '/settings/help/tickets/new' },
      },
      {
        q: 'I forgot my password',
        a: 'Use “Forgot password” on the login screen. We’ll email you a link to choose a new one. If you signed up with Google, use Continue with Google instead.',
        link: { label: 'Reset my password', href: '/forgot-password' },
      },
      {
        q: 'How do I switch between accounts?',
        a: 'Open Settings → Account Details and use the Accounts section, or the switcher on your profile. Accounts with the Biometric Security Lock on ask for your fingerprint before you can enter them.',
      },
      {
        q: 'How do I log out?',
        a: 'Scroll to the bottom of Settings and tap Log Out. This signs you out on this device and clears its saved session.',
      },
    ],
  },
  {
    id: 'safety',
    title: 'Privacy and user safety',
    items: [
      {
        q: 'Account safety',
        a: 'Turn on the Biometric Security Lock in Settings so changing your profile, password or switching accounts needs your fingerprint. Keep your password unique, and check Activity centre → Account history for sign-ins you don’t recognise.',
        link: { label: 'Account history', href: '/settings/activity/account' },
      },
      {
        q: 'Your account status',
        a: 'If your account is suspended or banned, you’ll see a notice when you open ClipPulse explaining that you can no longer use it, with a Log Out button. Suspensions follow violations of our Community Guidelines.',
        link: { label: 'Community Guidelines', href: '/legal/guidelines' },
      },
      {
        q: 'How do I block someone?',
        a: 'Open your conversation with them, tap the ⋯ menu and choose Block. You can review or unblock people in Settings → Blocked Accounts.',
        link: { label: 'Blocked accounts', href: '/settings/privacy' },
      },
      {
        q: 'How do I make my profile private?',
        a: 'In Settings → Privacy & Interactions, switch on Private Profile. Only your followers will be able to see your videos. You can also choose who can comment on your videos and message you.',
      },
      {
        q: 'Report a technical problem',
        a: 'Contact support from the bottom of this page and tell us what you were doing, what happened, and what device and browser you use. Screenshots help.',
      },
    ],
  },
  {
    id: 'posts',
    title: 'Posts',
    items: [
      {
        q: 'My posts aren’t getting views',
        a: 'Views take time to build. Pick a category when you publish, write a clear caption, and post regularly. Studio shows how each video is performing.',
        link: { label: 'Open Studio', href: '/studio' },
      },
      {
        q: 'Others can’t see my newly uploaded videos',
        a: 'New uploads can take a moment to process before they appear in the feed. Also check the Visibility setting on the publish screen: “Friends Only” and “Private (Only Me)” limit who can see a video, and a private profile limits your videos to followers.',
      },
      {
        q: 'How do I upload a video?',
        a: 'Tap the + button, record or choose a video, then fill in the description, category, sound and visibility on the next screen and tap Publish.',
        link: { label: 'Go to upload', href: '/upload' },
      },
      {
        q: 'Why is “For You” showing things I don’t like?',
        a: 'For You adapts to what you watch, like and finish. Watch and engage with the kinds of videos you want more of, and use Not interested on ones you don’t.',
      },
    ],
  },
  {
    id: 'live',
    title: 'LIVE',
    items: [
      {
        q: 'How to go live',
        a: 'Open LIVE, choose Go Live, give your stream a title and allow camera and microphone access when your browser asks. Viewers can join, chat and send reactions.',
        link: { label: 'Open LIVE', href: '/live' },
      },
      {
        q: 'My camera or microphone isn’t working in LIVE',
        a: 'Check that you allowed camera and microphone access for ClipPulse in your browser’s site settings, and that no other app is using the camera. Then tap the camera banner in the stream to try again.',
      },
      {
        q: 'How do I share my screen?',
        a: 'Use the screen-share button in the LIVE toolbar (on browsers that support it). Shared screens are shown in full, without cropping, and everyone else’s video moves to small tiles.',
      },
      {
        q: 'I see “Network connection lost. Reconnecting…”',
        a: 'Your connection dropped, for example mobile data switched off. Stay on the page: ClipPulse reconnects and rejoins the stream automatically once you’re back online. Other people in the stream are told when someone’s connection is unstable.',
      },
    ],
  },
  {
    id: 'using',
    title: 'Using ClipPulse',
    items: [
      {
        q: 'Direct messages',
        a: 'Swipe a message right to reply, or press and hold it for Reply, Copy, Forward and Delete. You can delete a message for yourself, or for everyone if you sent it.',
        link: { label: 'Open messages', href: '/messages' },
      },
      {
        q: 'Following and unfollowing',
        a: 'Tap Follow on a profile to see their videos in your Following feed. Tap the button again to unfollow.',
      },
      {
        q: 'Saving videos to collections',
        a: 'Tap Save on a video to add it to a collection. You can invite others to collaborate on a collection.',
        link: { label: 'My collections', href: '/collections' },
      },
      {
        q: 'Using less mobile data',
        a: 'Turn on Data Saver Mode in Settings to lower video quality on mobile networks, and use Clear Cache to free space used by cached videos.',
      },
    ],
  },
  {
    id: 'monetisation',
    title: 'Monetisation',
    items: [
      {
        q: 'How do tips work?',
        a: 'Viewers can tip a creator from a video or a LIVE stream. Tips appear in your earnings once they’re processed.',
        link: { label: 'View earnings', href: '/earnings' },
      },
      {
        q: 'How do I get paid?',
        a: 'Connect a payout account from the Earnings page. Payouts are handled by our payment provider, and you can see your balance and history there.',
        link: { label: 'Earnings', href: '/earnings' },
      },
      {
        q: 'What are AI credits?',
        a: 'Generating an AI template video uses one credit. If a generation fails, the credit is refunded automatically.',
      },
    ],
  },
  {
    id: 'other',
    title: 'Other',
    items: [
      {
        q: 'Discover and search',
        a: 'Use Search to find creators, videos and sounds. Your recent searches are kept in Activity centre → Search history, where you can clear them.',
        link: { label: 'Search history', href: '/settings/activity/search' },
      },
      {
        q: 'Where are the Terms and Privacy Policy?',
        a: 'You’ll find both under Settings → Support & about.',
        link: { label: 'Privacy Policy', href: '/legal/privacy' },
      },
    ],
  },
];

// Pulled to the top of the page.
export const FEATURED = [
  ['posts', 0],
  ['safety', 4],
  ['safety', 0],
  ['live', 0],
];
