// Usage (from backend/): node prisma/seed-ai-templates.js
// Upserts the AI templates (create if missing, refresh title/uses/sound/endpoint if present).
// All rows use Stable Video Diffusion on Replicate, which animates the uploaded photo and has
// no template-specific effect — swap `modelEndpoint` per template for distinct looks.
// SVD takes the photo as `input_image`, so set REPLICATE_IMAGE_INPUT_KEY=input_image.
import prisma from '../src/config/db.js';

const SVD = 'stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438';

const rows = [
  { id: 'tp1', title: 'July is Calling', previewUrl: '/templates/tp1.mp4', uses: 185200, soundTitle: 'Summer Drive' },
  { id: 'tp2', title: 'Then vs Now', previewUrl: '/templates/tp2.mp4', uses: 92400, soundTitle: 'Time Machine' },
  { id: 'ai-cyberpunk', title: 'Cyberpunk Portrait', previewUrl: '/templates/tp3.mp4', uses: 0, soundTitle: 'Neon Rain' }, // placeholder preview — replace
  { id: 'tp3', title: 'AI Fridge Magnet Football', previewUrl: '/templates/tp3.mp4', uses: 340700, soundTitle: 'Stadium Echo' },
  { id: 'tp4', title: 'World Cup Player Avatar', previewUrl: '/templates/tp4.mp4', uses: 1210000, soundTitle: 'Final Whistle' },
  { id: 'tp5', title: 'Crochet Yourself', previewUrl: '/templates/tp5.mp4', uses: 128300, soundTitle: 'Soft Thread' },
];

for (const r of rows) {
  const data = { title: r.title, category: 'AI', previewUrl: r.previewUrl, modelEndpoint: SVD, uses: r.uses, soundTitle: r.soundTitle };
  await prisma.aiTemplate.upsert({ where: { id: r.id }, update: data, create: { id: r.id, ...data } });
}
console.log(`Seeded ${rows.length} AI templates`);
await prisma.$disconnect();