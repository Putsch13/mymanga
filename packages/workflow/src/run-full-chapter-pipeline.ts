import {
  generateChapterBundle,
  runRoutedImageGeneration,
  composeMangaPanelPrompt,
  type StoryboardPanel,
  type RoutingContext,
  type ProjectContextForChapter,
} from "@manga-ai-studio/ai";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import {
  buildProjectContext,
  detectCanonWarnings,
  persistChapterMemory,
  replaceRagDocument,
} from "@manga-ai-studio/memory";

type JobStep = {
  key: string;
  label: string;
  status?: "queued" | "running" | "completed" | "failed";
  detail?: string;
};

async function setJobProgress(jobId: string, step: JobStep, status: "running" | "completed" | "failed") {
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
      startedAt: status === "running" ? (job.startedAt ?? new Date()) : job.startedAt,
      output: {
        ...output,
        currentStep: step.key,
        steps: nextSteps,
      },
    },
  });
}

function buildRoutingContext(
  intensityLayer: string,
  panel: StoryboardPanel,
): RoutingContext {
  return {
    mode: "PANEL_DRAFT",
    contentIntensityLayer: intensityLayer,
    isNewCharacter: false,
    hasCanonReferences: false,
    characterCountInScene: panel.characters.length,
    needsInpaint: false,
    needsPoseVariation: false,
    preferPhotorealCover: false,
    explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
    goreStylizedMature:
      intensityLayer === "MATURE_VISUAL" || intensityLayer === "ADULT_EXPLICIT",
  };
}

export async function runFullChapterPipelineFromJob(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job || !job.chapterId || !job.projectId) {
    return { ok: false as const, error: "invalid_job" };
  }

  const [chapter, project, stylePacks, rawCharacters] = await Promise.all([
    prisma.chapter.findUnique({ where: { id: job.chapterId } }),
    prisma.project.findUnique({
      where: { id: job.projectId },
      include: { settings: true },
    }),
    prisma.stylePack.findMany({
      where: { projectId: job.projectId },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
    // Raw query pour récupérer les nouveaux champs non encore dans le client Prisma
    prisma.$queryRawUnsafe<Array<{
      id: string;
      name: string;
      appearance: string | null;
      hairColor: string | null;
      eyeColor: string | null;
      outfitDefault: string | null;
    }>>(
      `SELECT id, name, appearance, "hairColor", "eyeColor", "outfitDefault" FROM "Character" WHERE "projectId" = $1`,
      job.projectId,
    ),
  ]);

  if (!chapter) {
    return { ok: false as const, error: "invalid_job" };
  }

  const projectId = job.projectId;
  const chapterId = job.chapterId;
  const chapterNumber = chapter.chapterNumber;
  const intensityLayer = (project?.intensityLayer as string | null) ?? "TEEN";

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "running", startedAt: job.startedAt ?? new Date() },
  });

  try {
    // ── Étape 1 : Contexte projet ──────────────────────────────────────────
    await setJobProgress(jobId, { key: "build_context", label: "Contexte projet" }, "running");
    const contextRaw = await buildProjectContext(prisma, projectId, chapter.userIntent);
    if (!contextRaw) throw new Error("project_context_not_found");
    const context = contextRaw as unknown as ProjectContextForChapter;

    await replaceRagDocument(prisma, {
      projectId,
      entityType: "project_context",
      entityId: chapterId,
      title: `Contexte chapitre ${chapterNumber}`,
      content: JSON.stringify(context).slice(0, 3500),
      metadata: { chapterId },
    });
    await setJobProgress(jobId, { key: "build_context", label: "Contexte projet" }, "completed");

    // ── Étape 2 : Génération bundle (outline, script, storyboard) ──────────
    await setJobProgress(
      jobId,
      { key: "generate_bundle", label: "Direction, outline, script, storyboard" },
      "running",
    );
    const bundle = generateChapterBundle({
      chapterNumber,
      chapterTitle: chapter.title,
      userIntent: chapter.userIntent ?? `Continuer ${context.project.title}`,
      context,
    });
    await setJobProgress(
      jobId,
      { key: "generate_bundle", label: "Direction, outline, script, storyboard" },
      "completed",
    );

    // ── Étape 3 : Persistance chapitre + scènes + images planifiées ────────
    await setJobProgress(
      jobId,
      { key: "persist_chapter", label: "Persistance chapitre" },
      "running",
    );

    const chapterOutline: Prisma.InputJsonValue = bundle.outline;
    const chapterScript: Prisma.InputJsonValue = bundle.script;
    const chapterStoryboard: Prisma.InputJsonValue = bundle.storyboard;

    // Map sceneId → list of planned SceneImage ids (for image generation step)
    const plannedImages: Array<{
      sceneImageId: string;
      panel: StoryboardPanel;
      sceneIndex: number;
    }> = [];

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

      await tx.sceneImage.deleteMany({ where: { scene: { chapterId } } });
      await tx.chapterScene.deleteMany({ where: { chapterId } });

      for (let index = 0; index < bundle.script.scenes.length; index++) {
        const scene = bundle.script.scenes[index];
        if (!scene) continue;

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
          // Compose le prompt enrichi via le manga-prompt-composer
              const stylePack = stylePacks[0];
              let composedPositive = panel.prompt;
              let composedNegative = panel.negativePrompt;

              try {
                const composed = composeMangaPanelPrompt({
                  stylePack: stylePack
                    ? {
                        name: stylePack.renderFamily,
                        description: `${stylePack.lineWeight} lines, ${stylePack.shadingMode} shading, ${stylePack.contrastProfile} contrast`,
                        visualStyle: project?.visualStyle ?? null,
                      }
                    : { visualStyle: project?.visualStyle ?? null },
                  characters: rawCharacters
                    .filter((c) => panel.characters.includes(c.name))
                    .map((c) => ({
                      name: c.name,
                      appearance: c.appearance,
                      hairColor: c.hairColor,
                      eyeColor: c.eyeColor,
                      outfitDefault: c.outfitDefault,
                    })),
              location: scene.location,
              action: panel.caption,
              camera: panel.camera,
              mood: panel.mood,
              contentIntensityLayer: intensityLayer,
              dialogueHint: panel.dialogue?.text,
            });
            composedPositive = composed.positive;
            composedNegative = composed.negative;
          } catch {
            // fallback sur le prompt du storyboard
          }

          const created = await tx.sceneImage.create({
            data: {
              sceneId: createdScene.id,
              panelNumber: panel.panelNumber,
              renderingMode: "PANEL_DRAFT",
              prompt: composedPositive,
              negativePrompt: composedNegative,
              status: "planned",
              width: 768,
              height: 1024,
              metadata: {
                caption: panel.caption,
                camera: panel.camera,
                characters: panel.characters,
                mood: panel.mood,
                sfx: panel.sfx,
                dialogue: panel.dialogue,
                narration: panel.narration,
                layout: storyboardPage.layout,
              },
            },
          });

          plannedImages.push({ sceneImageId: created.id, panel, sceneIndex: index });
        }
      }
    });
    await setJobProgress(
      jobId,
      { key: "persist_chapter", label: "Persistance chapitre" },
      "completed",
    );

    // ── Étape 4 : Génération des images réelles via FAL ────────────────────
    await setJobProgress(
      jobId,
      { key: "generate_images", label: `Génération images (0/${plannedImages.length})` },
      "running",
    );

    let generatedCount = 0;
    let failedCount = 0;

    for (const item of plannedImages) {
      try {
        const routingCtx = buildRoutingContext(intensityLayer, item.panel);
        const result = await runRoutedImageGeneration(routingCtx, {
          mode: "PANEL_DRAFT",
          positivePrompt: item.panel.prompt,
          negativePrompt: item.panel.negativePrompt,
          width: 768,
          height: 1024,
          providerParams: {
            contentIntensityLayer: intensityLayer,
            mode: "PANEL_DRAFT",
          },
        });

        if (result.ok) {
          await prisma.sceneImage.update({
            where: { id: item.sceneImageId },
            data: {
              imageUrl: result.result.imageUrl,
              provider: result.result.provider,
              model: result.result.model,
              status: "completed",
              routingDecision: result.routing as unknown as Prisma.InputJsonValue,
            },
          });
          generatedCount++;
        } else {
          await prisma.sceneImage.update({
            where: { id: item.sceneImageId },
            data: { status: "blocked", metadata: { blockedReason: result.reason } as Prisma.InputJsonValue },
          });
          failedCount++;
        }
      } catch (imgError) {
        const msg = imgError instanceof Error ? imgError.message : "image_error";
        await prisma.sceneImage.update({
          where: { id: item.sceneImageId },
          data: { status: "failed", metadata: { error: msg } as Prisma.InputJsonValue },
        });
        failedCount++;
      }

      // Mise à jour du progrès toutes les 3 images
      if ((generatedCount + failedCount) % 3 === 0) {
        await setJobProgress(
          jobId,
          {
            key: "generate_images",
            label: `Génération images (${generatedCount}/${plannedImages.length})`,
            detail: failedCount > 0 ? `${failedCount} échecs` : undefined,
          },
          "running",
        );
      }
    }

    await setJobProgress(
      jobId,
      {
        key: "generate_images",
        label: `Images générées (${generatedCount}/${plannedImages.length})`,
        detail: failedCount > 0 ? `${failedCount} échec(s)` : undefined,
      },
      failedCount === plannedImages.length ? "failed" : "completed",
    );

    // Mettre à jour le statut du chapitre
    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        status: generatedCount > 0 ? "published" : "ready_for_render",
      },
    });

    // ── Étape 5 : Mémoire et timeline ─────────────────────────────────────
    await setJobProgress(
      jobId,
      { key: "update_memory", label: "Mémoire et timeline" },
      "running",
    );

    const canonWarnings = detectCanonWarnings({
      characterStatuses: context.characters.map((c) => ({ name: c.name, status: c.status })),
      scriptText: JSON.stringify(bundle.script),
    });

    const snapshot = await persistChapterMemory(prisma, {
      projectId,
      chapterId,
      chapterNumber,
      title: bundle.outline.chapter_title,
      summary: bundle.memory.narrativeSummary,
      structuredState: { ...bundle.memory.structuredState, canonWarnings },
      timelineEvents: bundle.memory.timelineEvents,
      openLoops: bundle.memory.openLoops,
    });

    await setJobProgress(
      jobId,
      { key: "update_memory", label: "Mémoire et timeline" },
      "completed",
    );

    // ── Finalisation ───────────────────────────────────────────────────────
    const finalStatus =
      failedCount === plannedImages.length
        ? "failed"
        : canonWarnings.length > 0 || failedCount > 0
          ? "partial_success"
          : "completed";

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        finishedAt: new Date(),
        output: {
          currentStep: "done",
          steps: [
            { key: "build_context", label: "Contexte projet", status: "completed" },
            {
              key: "generate_bundle",
              label: "Direction, outline, script, storyboard",
              status: "completed",
            },
            { key: "persist_chapter", label: "Persistance chapitre", status: "completed" },
            {
              key: "generate_images",
              label: `Images : ${generatedCount}/${plannedImages.length}`,
              status: failedCount === plannedImages.length ? "failed" : "completed",
            },
            { key: "update_memory", label: "Mémoire et timeline", status: "completed" },
          ],
          plotOptions: bundle.plotOptions,
          creativeDirection: bundle.creativeDirection,
          memorySnapshotId: snapshot.id,
          canonWarnings,
          imageStats: { total: plannedImages.length, generated: generatedCount, failed: failedCount },
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
