// Template catalog for the studio's Templates tab.
//
// There's no backend Template model yet, so this is a fixed local catalog.
// Each entry points at a looping preview clip and a poster frame under
// /public/templates. The clips that ship are abstract placeholders made by
// scripts/make-template-previews.py — drop real previews in at the same paths
// (or change previewUrl/posterUrl) and the cards pick them up unchanged.
//
// `uses` is a raw number; the card formats it ("1.2M videos") so it can be
// swapped for a live count from an API later without touching the UI.

export const TEMPLATE_CATEGORIES = [
  'For You', 'Viral Song', 'Trendy', 'AI', 'Monthly Recap', 'Daily life', 'Aesthetic', 'One Clip',
];

const preview = (id) => ({ previewUrl: `/templates/${id}.mp4`, posterUrl: `/templates/${id}.jpg` });

export const TEMPLATES = [
  { id: 'tp1', title: 'July is calling', category: 'Monthly Recap', clipCount: 6, uses: 185200, tag: 'Trending', sound: 'Summer Drive', ...preview('tp1') },
  { id: 'tp2', title: 'Then vs Now', category: 'Trendy', clipCount: 2, uses: 92400, tag: 'Viral', sound: 'Time Machine', ...preview('tp2') },
  { id: 'tp3', title: 'AI Fridge Magnet Football', category: 'AI', clipCount: 1, uses: 340700, tag: 'AI', sound: 'Stadium Echo', ...preview('tp3') },
  { id: 'tp4', title: 'World Cup Player Avatar', category: 'AI', clipCount: 1, uses: 1210000, tag: 'AI', sound: 'Final Whistle', ...preview('tp4') },
  { id: 'tp5', title: 'Crochet Yourself', category: 'AI', clipCount: 1, uses: 128300, tag: 'AI', sound: 'Soft Thread', ...preview('tp5') },
  { id: 'tp6', title: 'A Day in My Life', category: 'Daily life', clipCount: 8, uses: 76100, tag: 'New', sound: 'Morning Light', ...preview('tp6') },
  { id: 'tp7', title: 'Golden Hour Moodboard', category: 'Aesthetic', clipCount: 5, uses: 54800, tag: 'Aesthetic', sound: 'Golden Hour', ...preview('tp7') },
  { id: 'tp8', title: 'One Take Glow Up', category: 'One Clip', clipCount: 1, uses: 301500, tag: 'Viral', sound: 'Glow Up', ...preview('tp8') },
  { id: 'tp9', title: 'Beat Drop Sync', category: 'Viral Song', clipCount: 4, uses: 1480000, tag: 'Trending', sound: 'Beat Drop Loop', ...preview('tp9') },
  { id: 'tp10', title: 'Slow Motion Reveal', category: 'Trendy', clipCount: 3, uses: 67200, tag: 'New', sound: 'Slow Burn', ...preview('tp10') },
  { id: 'tp11', title: 'This Month in Review', category: 'Monthly Recap', clipCount: 10, uses: 145600, tag: 'Trending', sound: 'Recap Theme', ...preview('tp11') },
  { id: 'tp12', title: 'Minimal Morning', category: 'Aesthetic', clipCount: 6, uses: 38900, tag: 'Aesthetic', sound: 'Quiet Coffee', ...preview('tp12') },
];
