import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rules = [
    { key: "chapter_text", label: "Chapitre texte", baseCost: 80, active: true },
    { key: "image_panel_draft", label: "Case draft", baseCost: 20, active: true },
    { key: "image_panel_final", label: "Case finale", baseCost: 40, active: true },
    { key: "image:panel_draft", label: "Case draft V3", baseCost: 20, active: true },
    { key: "image:panel_final", label: "Case finale V3", baseCost: 40, active: true },
    { key: "provider:fal", label: "Provider fal", baseCost: 1, active: true },
    { key: "provider:stability", label: "Provider stability", baseCost: 1, active: true, costFormula: { multiplier: 1.15 } },
  ];
  for (const r of rules) {
    await prisma.tokenPricingRule.upsert({
      where: { key: r.key },
      create: { ...r, costFormula: "costFormula" in r ? r.costFormula : {} },
      update: { baseCost: r.baseCost, active: r.active, costFormula: "costFormula" in r ? r.costFormula : {} },
    });
  }

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@manga-ai.studio" },
    update: {},
    create: {
      email: "demo@manga-ai.studio",
      displayName: "Demo Studio",
      role: "admin",
      ageVerifiedAt: new Date(),
      preferences: {
        create: {
          matureContentEnabled: true,
          preferredGenres: ["dark fantasy", "thriller"],
          preferredVisualStyle: "gothic detailed ink",
        },
      },
      wallets: {
        create: {
          balance: 5000,
          lifetimePurchased: 5000,
          lifetimeSpent: 0,
          lifetimeRefunded: 0,
        },
      },
    },
  });

  const demoProject = await prisma.project.upsert({
    where: { slug: "demo-v3-dark-fantasy" },
    update: {},
    create: {
      userId: demoUser.id,
      title: "Demo V3 Dark Fantasy",
      slug: "demo-v3-dark-fantasy",
      pitch: "Une héritière maudite doit reprendre un royaume rongé par des pactes anciens.",
      description: "Projet seedé pour tester la V3 : lecteur manga, arcs, personnages, mémoire et wallet.",
      primaryGenre: "dark fantasy",
      subGenres: ["thriller", "romance tragique"],
      tone: "sombre et lyrique",
      format: "manga",
      visualStyle: "gothic detailed ink",
      contentRating: "MATURE",
      intensityLayer: "MATURE_DRAMA",
      settings: {
        create: {
          violenceLevel: 60,
          romanceLevel: 35,
          darknessLevel: 85,
          mysteryLevel: 75,
          dialogueDensity: 55,
          canonStrictness: 90,
        },
      },
      storyBible: {
        create: {
          summary: "Royaume fracturé, magie du sang, lignées rivales et dettes surnaturelles.",
          worldRules: {
            bloodMagic: "Chaque serment exige un prix tangible.",
          },
          themes: ["héritage", "culpabilité", "désir de pouvoir"],
          lore: {
            dynasties: ["Maison Vaelor", "Maison Serev"],
          },
          lockedCanon: {
            immutableTruth: ["Le pacte originel a été signé par les deux familles."],
          },
        },
      },
      stylePacks: {
        create: {
          version: 1,
        },
      },
    },
  });

  const existingCharacters = await prisma.character.findMany({ where: { projectId: demoProject.id } });
  if (existingCharacters.length === 0) {
    await prisma.character.createMany({
      data: [
        { projectId: demoProject.id, name: "Lyra Vaelor", slug: "lyra-vaelor", roleType: "hero", biography: "Héritière lucide et blessée.", status: "alive", emotionalState: "déterminée", objective: "briser le pacte", traits: ["lucide", "féroce"], flaws: ["froideur"], secrets: ["voit les morts"] },
        { projectId: demoProject.id, name: "Kael Serev", slug: "kael-serev", roleType: "antagonist", biography: "Prince rival, plus nuancé qu'il n'y paraît.", status: "alive", emotionalState: "contrôlé", objective: "protéger sa maison", traits: ["charismatique"], flaws: ["orgueil"], secrets: ["doute du pacte"] },
        { projectId: demoProject.id, name: "Mira", slug: "mira", roleType: "support", biography: "Confidente et stratège.", status: "alive", emotionalState: "inquiète" },
        { projectId: demoProject.id, name: "Le Veilleur", slug: "le-veilleur", roleType: "support", biography: "Figure inquiétante liée au sanctuaire.", status: "alive", emotionalState: "impassible" },
      ],
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
