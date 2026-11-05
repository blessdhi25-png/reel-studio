// Copy for the in-app legal pages (/legal/[doc]), linked from Settings →
// Platform Information. Each section is { heading, body }.
//
// NOTE: this is plain-language starter copy describing how ClipPulse actually
// behaves. It is NOT reviewed legal text — have counsel replace it (or point
// the Settings rows at your hosted documents) before a public launch.

export const LEGAL_UPDATED = 'November 2026';

export const LEGAL_DOCS = {
  terms: {
    title: 'Terms of Service',
    intro: 'By creating an account or using ClipPulse you agree to these terms.',
    sections: [
      { heading: 'Your account', body: 'You are responsible for your account and for keeping your password secure. You must provide accurate information and be old enough to use the service where you live.' },
      { heading: 'Your content', body: 'You own the videos and other content you post. By posting, you give ClipPulse permission to host, stream, display and promote it within the app. You confirm you have the rights to everything you upload.' },
      { heading: 'Acceptable use', body: 'Do not post unlawful, hateful, harassing or misleading content, attempt to interfere with the service, or use it to harm others. Our Community Guidelines explain what is and is not allowed.' },
      { heading: 'Creator earnings & tips', body: 'Tips and creator balances are processed through our payment provider and are subject to its terms and verification requirements.' },
      { heading: 'Ending your account', body: 'You can stop using ClipPulse at any time. We may suspend or remove accounts or content that break these terms or the Community Guidelines.' },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'How ClipPulse handles your information.',
    sections: [
      { heading: 'What we collect', body: 'Account details (email, username, profile info), the videos and comments you post, and activity such as what you watch and like, which we use to personalise your feed.' },
      { heading: 'What stays on your device', body: 'Preferences such as Data Saver, watermarking and break reminders, and your screen-time totals, are stored locally on your device and are not sent to our servers.' },
      { heading: 'Your controls', body: 'In Settings and Privacy you can make your profile private, choose who can comment on your videos or message you, block accounts, and clear cached media.' },
      { heading: 'Sharing', body: 'We use service providers for hosting, video delivery, email and payments, and share data with them only as needed to run the service.' },
      { heading: 'Contact', body: 'Questions about your data? Contact the ClipPulse team through the support address listed in the app.' },
    ],
  },
  guidelines: {
    title: 'Community Guidelines',
    intro: 'ClipPulse works best when everyone feels safe to create and watch.',
    sections: [
      { heading: 'Be respectful', body: 'No harassment, bullying, hate speech or threats. Disagree without attacking people.' },
      { heading: 'Keep it safe', body: 'No content that shows or encourages violence, self-harm, dangerous challenges or the exploitation of minors.' },
      { heading: 'Be authentic', body: 'No spam, scams, impersonation or deceptive engagement. Credit creators whose work you remix or reuse.' },
      { heading: 'Respect privacy', body: "Don't share other people's private information or film them in private settings without consent." },
      { heading: 'Reporting & enforcement', body: 'Use Report on any video, comment or profile. Content that breaks these guidelines may be removed, and repeat violations can lead to account restrictions.' },
    ],
  },
};
