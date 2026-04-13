import { generateChapterOutline } from "@manga-ai-studio/ai";
import { repairGhostCharacters } from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";

export type OutlineJobInput = {
  fromChapterId?: string | null;
  intent?: string | null;
  quickTag?: string | null;
};

/**
 * Génère outline + résumé + cliffhanger et les persiste sur le chapitre.
 */
export async function runOutlineForChapterId(
  chapterId: string,
  jobInput?: OutlineJobInput,
): Promise<{ ok: boolean; error?: string; usedOpenAI?: boolean }> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { project: true },
  });
  if (!chapter) return { ok: false, error: "chapter_not_found" };

  let prevSummary: string | null = null;
  let prevCliff: string | null = null;
  const fromId = jobInput?.fromChapterId;
  if (fromId) {
    const prev = await prisma.chapter.findFirst({
      where: { id: fromId, projectId: chapter.projectId },
    });
    if (prev) {
      prevSummary = prev.summary;
      prevCliff = prev.cliffhanger;
    }
  } else if (chapter.chapterNumber > 1) {
    const prev = await prisma.chapter.findFirst({
      where: { projectId: chapter.projectId, chapterNumber: chapter.chapterNumber - 1 },
    });
    if (prev) {
      prevSummary = prev.summary;
      prevCliff = prev.cliffhanger;
    }
  }

  const userIntent =
    jobInput?.intent?.trim() ||
    chapter.userIntent?.trim() ||
    `Poursuivre l’histoire du projet « ${chapter.project.title} » pour ce chapitre.`;

  const { outline, usedOpenAI, model } = await generateChapterOutline({
    projectTitle: chapter.project.title,
    pitch: chapter.project.pitch,
    primaryGenre: chapter.project.primaryGenre,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
    userIntent,
    quickTag: jobInput?.quickTag ?? null,
    previousSummary: prevSummary,
    previousCliffhanger: prevCliff,
  });

  // A3 : Réparer les personnages fantômes avant persistance
  const knownCharacters = await prisma.character.findMany({
    where: { projectId: chapter.projectId },
    select: { id: true, name: true, roleType: true },
  });
  const knownCharacterIds = knownCharacters.map((c) => c.id);
  const repairedBeats = outline.beats as Array<Record<string, unknown>>;
  const ghostRepair = repairGhostCharacters(
    { beats: repairedBeats },
    knownCharacterIds,
    knownCharacters,
  );
  if (ghostRepair.ghostsFound > 0) {
    console.warn(
      `[outline] ghost_repair chapterId=${chapterId} found=${ghostRepair.ghostsFound} resolved=${ghostRepair.ghostsResolved}`,
    );
  }

  const outlineJson: Prisma.InputJsonValue = {
    beats: repairedBeats as unknown as Prisma.InputJsonValue,
    _meta: {
      generatedAt: new Date().toISOString(),
      ...(model ? { model } : {}),
      source: usedOpenAI ? "openai" : "fallback",
      ...(ghostRepair.ghostsFound > 0 ? { ghostRepair: { found: ghostRepair.ghostsFound, resolved: ghostRepair.ghostsResolved } } : {}),
    },
  } as Prisma.InputJsonValue;

  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      outline: outlineJson,
      summary: outline.summary,
      cliffhanger: outline.cliffhanger,
      ...(outline.title ? { title: outline.title } : {}),
    },
  });

  return { ok: true, usedOpenAI };
}

/**
 * Exécute un job Prisma `GENERATE_CHAPTER_OUTLINE` (statuts + erreurs).
 */
export async function runChapterOutlineFromJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.type !== "GENERATE_CHAPTER_OUTLINE" || !job.chapterId) {
    return { ok: false, error: "invalid_job" };
  }
  if (job.status === "completed") return { ok: true };

  const input = job.input as OutlineJobInput;

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "running", startedAt: new Date() },
  });

  try {
    const r = await runOutlineForChapterId(job.chapterId, input);
    if (!r.ok) {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: { message: r.error ?? "outline_failed" },
        },
      });
      return { ok: false, error: r.error };
    }
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "completed",
        finishedAt: new Date(),
        output: { usedOpenAI: r.usedOpenAI ?? false },
      },
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: { message: msg },
      },
    });
    return { ok: false, error: msg };
  }
}
