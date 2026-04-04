import {
  generateChapterBundle,
  runRoutedImageGeneration,
  composeMangaPanelPrompt,
  runChapterContinuityPass,
  runChapterNarrativeCoherencePass,
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
import { createClient } from "@supabase/supabase-js";

type JobStep = {
  key: string;
  label: string;
  status?: "queued" | "running" | "completed" | "failed";
  detail?: string;
};

type PlannedImage = {
  sceneImageId: string;
  panel: StoryboardPanel;
  sceneIndex: number;
  baseMetadata: Record<string, unknown>;
};

type PipelineJobInput = {
  focusCharacterIds?: string[];
  selectedPlotLabel?: "safe" | "bold" | "shock";
};

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isDataUrl(url: string) {
  return url.startsWith("data:image/");
}

function looksLikeBflDelivery(url: string) {
  try {
    const u = new URL(url);
    return u.hostname.startsWith("delivery-") && u.hostname.endsWith(".bfl.ai");
  } catch {
    return false;
  }
}

async function persistImageIfNeeded(opts: {
  imageUrl: string;
  projectId: string;
  chapterId: string;
  sceneImageId: string;
}) {
  const bucket = process.env.STORAGE_BUCKET ?? "mymanga-images";
  const client = getStorageClient();

  const mustPersist = isDataUrl(opts.imageUrl) || looksLikeBflDelivery(opts.imageUrl);
  if (!mustPersist) return { ok: true as const, url: opts.imageUrl, persisted: false as const };

  if (!client) {
    return {
      ok: false as const,
      error:
        "Image non persistable (data URL / BFL delivery) sans SUPABASE_SERVICE_ROLE_KEY + STORAGE_BUCKET. Configure le stockage.",
    };
  }

  let bytes: Uint8Array;
  let contentType = "image/jpeg";

  if (isDataUrl(opts.imageUrl)) {
    // data:image/png;base64,....
    const commaIdx = opts.imageUrl.indexOf(",");
    if (commaIdx <= 0) return { ok: false as const, error: "data URL invalide" };
    const header = opts.imageUrl.slice(0, commaIdx);
    const b64 = opts.imageUrl.slice(commaIdx + 1);
    // header exemple: data:image/png;base64
    const ct = header.split(";")[0]?.slice("data:".length);
    if (ct?.startsWith("image/")) contentType = ct;
    bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  } else {
    const res = await fetch(opts.imageUrl);
    if (!res.ok) return { ok: false as const, error: `download failed ${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    bytes = buf;
    const ct = res.headers.get("content-type");
    if (ct?.startsWith("image/")) contentType = ct;
  }

  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const path = `projects/${opts.projectId}/chapters/${opts.chapterId}/panels/${opts.sceneImageId}.${ext}`;

  const up = await client.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
    cacheControl: "31536000",
  });
  if (up.error) {
    return { ok: false as const, error: `upload failed: ${up.error.message}` };
  }

  const publicUrl = client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  return { ok: true as const, url: publicUrl, persisted: true as const };
}

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
  const jobInput = ((job.input as Record<string, unknown>) ?? {}) as PipelineJobInput;
  const focusCharacterIds = Array.isArray(jobInput.focusCharacterIds) ? jobInput.focusCharacterIds.filter(Boolean) : [];
  const selectedPlotLabel =
    jobInput.selectedPlotLabel === "safe" || jobInput.selectedPlotLabel === "bold" || jobInput.selectedPlotLabel === "shock"
      ? jobInput.selectedPlotLabel
      : undefined;

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "running", startedAt: job.startedAt ?? new Date() },
  });

  try {
    // ── Étape 1 : Contexte projet ──────────────────────────────────────────
    await setJobProgress(jobId, { key: "build_context", label: "Contexte projet" }, "running");
    const contextRaw = await buildProjectContext(prisma, projectId, chapter.userIntent, { focusCharacterIds });
    if (!contextRaw) throw new Error("project_context_not_found");
    const context = contextRaw as unknown as ProjectContextForChapter;

    const contextDocument = [
      `Projet: ${context.project.title}`,
      context.project.pitch ? `Pitch: ${context.project.pitch}` : "",
      context.project.description ? `Description: ${context.project.description}` : "",
      context.project.primaryGenre ? `Genre: ${context.project.primaryGenre}` : "",
      context.project.subGenres?.length ? `Sous-genres: ${context.project.subGenres.join(", ")}` : "",
      context.storyBible?.summary ? `Bible: ${context.storyBible.summary}` : "",
      context.characters.length
        ? `Personnages:\n${context.characters
            .slice(0, 6)
            .map((character) => `- ${character.name} | ${character.roleType ?? "rôle?"} | obj: ${character.objective ?? "n/a"} | peur: ${character.fear ?? "n/a"}`)
            .join("\n")}`
        : "",
      context.recentMemory.length
        ? `Mémoire récente:\n${context.recentMemory
            .map((memory) => memory.narrativeSummary)
            .filter(Boolean)
            .slice(0, 3)
            .join("\n")}`
        : "",
      context.retrievedDocs.length
        ? `RAG:\n${context.retrievedDocs
            .slice(0, 4)
            .map((doc) => `${doc.title ?? doc.entityType ?? "doc"}: ${doc.content}`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 3900);

    await replaceRagDocument(prisma, {
      projectId,
      entityType: "project_context",
      entityId: chapterId,
      title: `Contexte chapitre ${chapterNumber}`,
      content: contextDocument,
      metadata: { chapterId, focusCharacterIds, selectedPlotLabel },
    });
    await setJobProgress(jobId, { key: "build_context", label: "Contexte projet" }, "completed");

    // ── Étape 2 : Génération bundle (outline, script, storyboard) ──────────
    await setJobProgress(
      jobId,
      { key: "generate_bundle", label: "Direction, outline, script, storyboard" },
      "running",
    );
    const bundle = await generateChapterBundle({
      chapterNumber,
      chapterTitle: chapter.title,
      userIntent: chapter.userIntent ?? `Continuer ${context.project.title}`,
      selectedPlotLabel,
      context,
    });
    await setJobProgress(
      jobId,
      { key: "generate_bundle", label: "Direction, outline, script, storyboard" },
      "completed",
    );
    await setJobProgress(
      jobId,
      { key: "continuity_pass", label: "Continuité IA avant images" },
      "running",
    );
    const continuity = await runChapterContinuityPass({
      context,
      bundle,
      chapterGoal: bundle.creativeDirection.chapterGoal,
      selectedPlotLabel,
    });
    let revisedBundle = continuity.bundle;
    await setJobProgress(
      jobId,
      {
        key: "continuity_pass",
        label: continuity.usedOpenAI ? "Continuité IA appliquée" : "Continuité fallback appliquée",
        detail: continuity.notes.slice(0, 2).join(" · ") || undefined,
      },
      "completed",
    );

    await setJobProgress(jobId, { key: "story_coherence_pass", label: "Cohérence narrative & rythme" }, "running");
    const narrative = await runChapterNarrativeCoherencePass({
      context,
      bundle: revisedBundle,
      chapterGoal: revisedBundle.creativeDirection.chapterGoal,
      selectedPlotLabel,
    });
    revisedBundle = narrative.bundle;
    await setJobProgress(
      jobId,
      {
        key: "story_coherence_pass",
        label: narrative.usedOpenAI ? "Narration peaufinée" : "Narration (fallback)",
        detail: narrative.notes.slice(0, 2).join(" · ") || undefined,
      },
      "completed",
    );

    // ── Étape 3 : Persistance chapitre + scènes + images planifiées ────────
    await setJobProgress(
      jobId,
      { key: "persist_chapter", label: "Persistance chapitre" },
      "running",
    );

    const chapterOutline: Prisma.InputJsonValue = revisedBundle.outline;
    const chapterScript: Prisma.InputJsonValue = revisedBundle.script;
    const chapterStoryboard: Prisma.InputJsonValue = revisedBundle.storyboard;

    // Map sceneId → list of planned SceneImage ids (for image generation step)
    const plannedImages: PlannedImage[] = [];

    await prisma.$transaction(
      async (tx) => {
        await tx.chapter.update({
        where: { id: chapterId },
        data: {
          title: revisedBundle.outline.chapter_title,
          outline: chapterOutline,
          script: chapterScript,
          storyboard: chapterStoryboard,
          summary: revisedBundle.memory.narrativeSummary,
          cliffhanger: revisedBundle.outline.cliffhanger,
          status: "ready_for_render",
          tokenEstimate: job.estimatedTokenCost ?? 80,
          tokenActual: job.actualTokenCost ?? job.estimatedTokenCost ?? 80,
        },
      });

        await tx.sceneImage.deleteMany({ where: { scene: { chapterId } } });
        await tx.chapterScene.deleteMany({ where: { chapterId } });

        for (let index = 0; index < revisedBundle.script.scenes.length; index++) {
          const scene = revisedBundle.script.scenes[index];
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

          const storyboardPage = revisedBundle.storyboard.pages[index];
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
              action: panel.narration ?? panel.caption,
              camera: panel.camera,
              mood: panel.mood,
              contentIntensityLayer: intensityLayer,
              dialogueHint: panel.dialogue ? `${panel.dialogue.speaker}: ${panel.dialogue.text}` : undefined,
            });
            composedPositive = composed.positive;
            composedNegative = composed.negative;
          } catch {
            // fallback sur le prompt du storyboard
          }

            const baseMetadata = {
              caption: panel.caption,
              camera: panel.camera,
              characters: panel.characters,
              mood: panel.mood,
              textScale: panel.textScale ?? "normal",
              sfx: panel.sfx,
              dialogue: panel.dialogue,
              narration: panel.narration,
              layout: storyboardPage.layout,
            };

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
                metadata: baseMetadata,
              },
            });

            plannedImages.push({
              sceneImageId: created.id,
              panel: { ...panel, prompt: composedPositive, negativePrompt: composedNegative },
              sceneIndex: index,
              baseMetadata,
            });
          }
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
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
          const persisted = await persistImageIfNeeded({
            imageUrl: result.result.imageUrl,
            projectId,
            chapterId,
            sceneImageId: item.sceneImageId,
          });

          if (!persisted.ok) {
            await prisma.sceneImage.update({
              where: { id: item.sceneImageId },
              data: {
                status: "failed",
                metadata: ({
                  ...item.baseMetadata,
                  error: persisted.error,
                  sourceUrl: result.result.imageUrl,
                  generationLog: result.log,
                } as unknown) as Prisma.InputJsonValue,
              },
            });
            failedCount++;
            continue;
          }

          await prisma.sceneImage.update({
            where: { id: item.sceneImageId },
            data: {
              imageUrl: persisted.url,
              provider: result.result.provider,
              model: result.result.model,
              status: "completed",
              routingDecision: result.routing as unknown as Prisma.InputJsonValue,
              metadata: ({
                ...item.baseMetadata,
                generationLog: result.log,
                persisted: persisted.persisted,
              } as unknown) as Prisma.InputJsonValue,
            },
          });
          generatedCount++;
        } else {
          await prisma.sceneImage.update({
            where: { id: item.sceneImageId },
            data: {
              status: "blocked",
              metadata: ({
                ...item.baseMetadata,
                blockedReason: result.reason,
                generationLog: result.log,
              } as unknown) as Prisma.InputJsonValue,
            },
          });
          failedCount++;
        }
      } catch (imgError) {
        const msg = imgError instanceof Error ? imgError.message : "image_error";
        await prisma.sceneImage.update({
          where: { id: item.sceneImageId },
          data: {
            status: "failed",
            metadata: ({ ...item.baseMetadata, error: msg } as unknown) as Prisma.InputJsonValue,
          },
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
      scriptText: JSON.stringify(revisedBundle.script),
    });

    const snapshot = await persistChapterMemory(prisma, {
      projectId,
      chapterId,
      chapterNumber,
      title: revisedBundle.outline.chapter_title,
      summary: revisedBundle.memory.narrativeSummary,
      structuredState: { ...revisedBundle.memory.structuredState, canonWarnings, continuityNotes: continuity.notes },
      timelineEvents: revisedBundle.memory.timelineEvents,
      openLoops: revisedBundle.memory.openLoops,
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
            { key: "continuity_pass", label: "Continuité IA avant images", status: "completed" },
            { key: "story_coherence_pass", label: "Cohérence narrative", status: "completed" },
            { key: "persist_chapter", label: "Persistance chapitre", status: "completed" },
            {
              key: "generate_images",
              label: `Images : ${generatedCount}/${plannedImages.length}`,
              status: failedCount === plannedImages.length ? "failed" : "completed",
            },
            { key: "update_memory", label: "Mémoire et timeline", status: "completed" },
          ],
          plotOptions: revisedBundle.plotOptions,
          creativeDirection: revisedBundle.creativeDirection,
          memorySnapshotId: snapshot.id,
          canonWarnings,
          continuityNotes: continuity.notes,
          narrativeNotes: narrative.notes,
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
