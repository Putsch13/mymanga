import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rules = [
    { key: "chapter_text", label: "Chapitre texte", baseCost: 80, active: true },
    { key: "image_panel_draft", label: "Case draft", baseCost: 20, active: true },
    { key: "image_panel_final", label: "Case finale", baseCost: 40, active: true },
  ];
  for (const r of rules) {
    await prisma.tokenPricingRule.upsert({
      where: { key: r.key },
      create: { ...r, costFormula: {} },
      update: { baseCost: r.baseCost, active: r.active },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
