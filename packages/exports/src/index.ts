import { prisma } from "@manga-ai-studio/db";

export { exportChapterPdf } from "./pdf-export";

export async function exportChapterPdfStub(chapterId: string): Promise<Uint8Array> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      project: true,
      scenes: { include: { images: true }, orderBy: { sceneNumber: "asc" } },
    },
  });
  if (!chapter) {
    throw new Error("chapter_not_found");
  }

  const lines = [
    `MANGA AI STUDIO EXPORT`,
    `Projet: ${chapter.project.title}`,
    `Chapitre: ${chapter.title ?? `Chapitre ${chapter.chapterNumber}`}`,
    "",
    `Résumé: ${chapter.summary ?? "n/a"}`,
    `Cliffhanger: ${chapter.cliffhanger ?? "n/a"}`,
    "",
    "Scenes:",
    ...chapter.scenes.flatMap((scene) => [
      `- Scene ${scene.sceneNumber}: ${scene.title ?? "Sans titre"}`,
      `  ${scene.summary ?? ""}`,
      ...scene.images.map((image) => `  Panel ${image.panelNumber}: ${image.imageUrl ?? "placeholder"}`),
    ]),
  ];

  return new TextEncoder().encode(lines.join("\n"));
}

export async function exportProjectBible(projectId: string): Promise<Uint8Array> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      storyBible: true,
      characters: true,
      arcs: true,
      continuityEvents: { orderBy: { timelineOrder: "asc" }, take: 20 },
    },
  });
  if (!project) {
    throw new Error("project_not_found");
  }

  const lines = [
    `Bible de série: ${project.title}`,
    "",
    `Pitch: ${project.pitch ?? "n/a"}`,
    `Description: ${project.description ?? "n/a"}`,
    `Genre: ${project.primaryGenre ?? "n/a"}`,
    `Ton: ${project.tone ?? "n/a"}`,
    "",
    "Personnages:",
    ...project.characters.map((character) => `- ${character.name} (${character.roleType ?? "role inconnu"})`),
    "",
    "Arcs:",
    ...project.arcs.map((arc) => `- ${arc.name}: ${arc.summary ?? "n/a"}`),
    "",
    "Timeline:",
    ...project.continuityEvents.map((event) => `- ${event.summary ?? event.eventType}`),
    "",
    "Bible monde:",
    JSON.stringify(project.storyBible ?? {}, null, 2),
  ];

  return new TextEncoder().encode(lines.join("\n"));
}

export async function exportProjectPackage(projectId: string): Promise<Uint8Array> {
  const [bible, chapters] = await Promise.all([
    exportProjectBible(projectId),
    prisma.chapter.findMany({
      where: { projectId },
      orderBy: { chapterNumber: "asc" },
    }),
  ]);

  const lines = [
    "Project package",
    "",
    new TextDecoder().decode(bible),
    "",
    "Chapitres:",
    ...chapters.map((chapter) => `- ${chapter.chapterNumber}: ${chapter.title ?? "Sans titre"}`),
  ];

  return new TextEncoder().encode(lines.join("\n"));
}
