import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const templates = [
    {
      title: "July is Calling",
      modelEndpoint: "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438",
    },
    {
      title: "Cyberpunk Portrait",
      modelEndpoint: "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438",
    },
    {
      title: "Then vs Now",
      modelEndpoint: "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438",
    }
  ];

  for (const t of templates) {
    await prisma.aiTemplate.updateMany({
      where: { title: t.title },
      data: { modelEndpoint: t.modelEndpoint },
    });
  }

  console.log("Updated AI Template endpoints successfully.");
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());