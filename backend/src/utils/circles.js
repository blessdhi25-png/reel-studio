// Topic Circles are a fixed, curated set of micro-communities (not a free-form
// tag system) so the feed filter stays a small, predictable list rather than
// fragmenting into thousands of one-off values. Mirrors ALLOWED_CIRCLES in
// frontend/src/lib/circles.js — keep both lists in sync if this changes.
export const ALLOWED_CIRCLES = [
  '#CodeNewbies',
  '#3DPrinting',
  '#GamerLounge',
  '#IndieMusic',
  '#HomeCooking',
  '#FilmCraft',
  '#Bookworms',
  '#FitJourney',
];

export function normalizeCircle(input) {
  if (!input) return null;
  const match = ALLOWED_CIRCLES.find((c) => c.toLowerCase() === String(input).toLowerCase());
  return match || null;
}
