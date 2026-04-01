import { generateChapterBundle } from "@manga-ai-studio/ai";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { buildProjectContext, detectCanonWarnings, persistChapterMemory, replaceRagDocument } from "@manga-ai-studio/memory";

type JobStep = {
  key: string;
  label: string;
  status?: "queued" | "running" | "completed";
  detail?: string;
};

async function setJobProgress(jobId: string, step: JobStep, status: "running" | "completed") {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  const output = (job.output as Record<string, unknown>) ?? {};
  const previousSteps = Array.isArray(output.steps) ? (output.steps as JobStep[]) : [];
  const nextSteps = [
    ...previousSteps.filter((existing) => existing.key !== step.key),
    { ...step, status },
  ];
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "running",
      startedAt: status === "running" ? job.startedAt ?? new Date() : job.startedAt,
      output: {
        ...output,
        currentStep: step.key,
        steps: nextSteps,
      },
    },
  });
}

export async function runFullChapterPipelineFromJob(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { chapter: true, project: true },
  });
  if (!job || !job.chapterId || !job.projectId || !job.chapter) {
    return { ok: false as const, error: "invalid_job" };
  }
  const chapter = job.chapter;
  const projectId = job.projectId;
  const chapterId = job.chapterId;
  const chapterNumber = chapter.chapterNumber;

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "running", startedAt: job.startedAt ?? new Date() },
  });

  try {
    await setJobProgress(jobId, { key: "build_context", label: "Contexte projet" }, "running");
    const context = await buildProjectContext(prisma, projectId, chapter.userIntent);
    if (!context) {
      throw new Error("project_context_not_found");
    }
    await replaceRagDocument(prisma, {
      projectId,
      entityType: "project_context",
      entityId: chapterId,
      title: `Contexte chapitre ${chapterNumber}`,
      content: JSON.stringify(context).slice(0, 3500),
      metadata: { chapterId },
    });
    await setJobProgress(jobId, { key: "build_context", label: "Contexte projet" }, "completed");

    await setJobProgress(jobId, { key: "generate_bundle", label: "Direction, outline, script, storyboard" }, "running");
    const bundle = generateChapterBundle({
      chapterNumber,
      chapterTitle: chapter.title,
      userIntent: chapter.userIntent ?? `Continuer ${context.project.title}`,
      context,
    });
    await setJobProgress(jobId, { key: "generate_bundle", label: "Direction, outline, script, storyboard" }, "completed");

    await setJobProgress(jobId, { key: "persist_chapter", label: "Persistance chapitre" }, "running");
    const chapterOutline: Prisma.InputJsonValue = bundle.outline;
    const chapterScript: Prisma.InputJsonValue = bundle.script;
    const chapterStoryboard: Prisma.InputJsonValue = bundle.storyboard;

    await prisma.$transaction(async (tx) => {
      await tx.chapter.update({
        where: { id: chapterId },
        data: {
          title: bundle.outline.chapter_title,
          outline: chapterOutline,
          script: chapterScript,
          storyboard: chapterStoryboard,
          summary: bundle.memory.narrativeSummary,
          cliffhanger: bundle.outline.cliffhanger,
          status: "ready_for_render",
          tokenEstimate: job.estimatedTokenCost ?? 80,
          tokenActual: job.actualTokenCost ?? job.estimatedTokenCost ?? 80,
        },
      });

      await tx.sceneImage.deleteMany({
        where: { scene: { chapterId } },
      });
      await tx.chapterScene.deleteMany({
        where: { chapterId },
      });

      for (let index = 0; index < bundle.script.scenes.length; index += 1) {
        const scene = bundle.script.scenes[index];
        const createdScene = await tx.chapterScene.create({
          data: {
            chapterId,
            sceneNumber: index + 1,
            title: scene.title,
            summary: scene.summary,
            script: scene as unknown as Prisma.InputJsonValue,
            dialogue: scene.dialogue as unknown as Prisma.InputJsonValue,
            metadata: {
              location: scene.location,
              characters: scene.characters,
              purpose: scene.purpose,
            },
          },
        });

        const storyboardPage = bundle.storyboard.pages[index];
        if (!storyboardPage) continue;
        for (const panel of storyboardPage.panels) {
          await tx.sceneImage.create({
            data: {
              sceneId: createdScene.id,
              panelNumber: panel.panelNumber,
              renderingMode: "PANEL_DRAFT",
              prompt: panel.prompt,
              status: "planned",
              imageUrl: `https://placehold.co/1200x1600/png?text=${encodeURIComponent(`Chap ${chapterNumber} - Scene ${index + 1} - Panel ${panel.panelNumber}`)}`,
              metadata: {
                caption: panel.caption,
                camera: panel.camera,
                characters: panel.characters,
              },
            },
          });
        }
      }
    });
    await setJobProgress(jobId, { key: "persist_chapter", label: "Persistance chapitre" }, "completed");

    await setJobProgress(jobId, { key: "update_memory", label: "Mémoire et timeline" }, "running");
    const canonWarnings = detectCanonWarnings({
      characterStatuses: context.characters.map((character) => ({
        name: character.name,
        status: character.status,
      })),
      scriptText: JSON.stringify(bundle.script),
    });

    const snapshot = await persistChapterMemory(prisma, {
      projectId,
      chapterId,
      chapterNumber,
      title: bundle.outline.chapter_title,
      summary: bundle.memory.narrativeSummary,
      structuredState: {
        ...bundle.memory.structuredState,
        canonWarnings,
      },
      timelineEvents: bundle.memory.timelineEvents,
      openLoops: bundle.memory.openLoops,
    });
    await setJobProgress(jobId, { key: "update_memory", label: "Mémoire et timeline" }, "completed");

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: canonWarnings.length > 0 ? "partial_success" : "completed",
        finishedAt: new Date(),
        output: {
          currentStep: "done",
          steps: [
            { key: "build_context", label: "Contexte projet", status: "completed" },
            { key: "generate_bundle", label: "Direction, outline, script, storyboard", status: "completed" },
            { key: "persist_chapter", label: "Persistance chapitre", status: "completed" },
            { key: "update_memory", label: "Mémoire et timeline", status: "completed" },
          ],
          plotOptions: bundle.plotOptions,
          creativeDirection: bundle.creativeDirection,
          memorySnapshotId: snapshot.id,
          canonWarnings,
        },
      },
    });

    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "pipeline_failed";
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: { message },
      },
    });
    return { ok: false as const, error: message };
  }
}
