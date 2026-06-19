import { prisma } from "../src/index";

async function main() {
  const [characterVisualRefs, charactersWithVisualRefs, chapterScenes, totalSceneImages, completedSceneImages, loraModels] =
    await Promise.all([
      prisma.characterVisualRef.count(),
      prisma.character.count({ where: { visualRefs: { some: {} } } }),
      prisma.chapterScene.count(),
      prisma.sceneImage.count(),
      prisma.sceneImage.count({ where: { status: "completed" } }),
      prisma.loraModel.count(),
    ]);

  console.log(
    JSON.stringify(
      {
        characterVisualRefs,
        charactersWithVisualRefs,
        chapterScenes,
        totalSceneImages,
        completedSceneImages,
        loraModels,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[legacy-prechecks] failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
