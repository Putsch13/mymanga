import { prisma } from "@manga-ai-studio/db";
import { setJobProgress } from "./pipeline-job";
import { normalizeCreativeControls, type PipelineJobInput } from "./pipeline-quality";
import {
  queueAutoLoraTrainingIfEligible,
  type LoadedLoraAttachment,
} from "./pipeline-lora";
import { loadCharactersForPipeline } from "./pipeline-db-loader";
import { runMemoryPass } from "./passes/memory-pass";
import { runImageGenerationPass } from "./passes/image-generation-pass";
import { runNarrativePass } from "./passes/narrative-pass";
import { assertPremiumContractFromChapter } from "./passes/assert-premium-contract-guard";
import {
  buildChapterImagePlanFromNarrative,
  deriveContentRatingFromProject,
  deriveMangaStyleProfileFromStylePack,
} from "./chapter-image-plan-from-narrative";

export { setJobProgress } from "./pipeline-job";

export async function runFullChapterPipelineFromJob(jobId: string) {
  // Diagnostic de configuration au démarrage du pipeline
  console.log(`[pipeline:config] SUPABASE_URL=${!!process.env.NEXT_PUBLIC_SUPABASE_URL} SERVICE_ROLE=${!!process.env.SUPABASE_SERVICE_ROLE_KEY} ANON_KEY=${!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY} BUCKET=${process.env.STORAGE_BUCKET ?? "(default:MyManga)"}`);

  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job || !job.chapterId || !job.projectId) {
    return { ok: false as const, error: "invalid_job" };
  }

  const [chapter, project, stylePacks, loraAttachments, rawCharacters, npcProfiles, propInventory] = await Promise.all([
    prisma.chapter.findUnique({ where: { id: job.chapterId } }),
    prisma.project.findUnique({ where: { id: job.projectId }, include: { settings: true } }),
    prisma.stylePack.findMany({ where: { projectId: job.projectId }, orderBy: { createdAt: "desc" }, take: 1 }),
    prisma.loraAttachment.findMany({ where: { projectId: job.projectId }, include: { lora: true } }),
    loadCharactersForPipeline(job.projectId),
    prisma.npcVisualProfile.findMany({
      where: { projectId: job.projectId ?? undefined, characterId: { not: null } },
      orderBy: [{ updatedAt: "desc" }, { appearanceCount: "desc" }],
      select: {
        characterId: true, importanceLevel: true, promotionStatus: true,
        appearanceCount: true, silhouetteSignature: true, accessoryMarker: true,
        outfitSignature: true, shortVisualCore: true, metadata: true,
      },
    }),
    prisma.characterPropInventory.findMany({
      where: { projectId: job.projectId ?? undefined, isActive: true },
      select: { characterId: true, propCanonicalName: true, propCategory: true, visualDescription: true },
    }),
  ]);

  if (!chapter) {
    return { ok: false as const, error: "invalid_job" };
  }

  // P1-1 : défense en profondeur — si le job a été créé hors launch/pipeline
  // (run-now direct, retry manuel, flow interne), on revalide ici le contrat
  // premium avant d'engager le moindre coût LLM/image.
  const contractGuard = assertPremiumContractFromChapter(chapter.outline, chapter.minimumImages);
  if (!contractGuard.ok) {
    console.error(
      `[pipeline:P1-1] premium_contract_incomplete chapterId=${job.chapterId} missing=${contractGuard.missing.join(" | ")}`,
    );
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        output: {
          error: "premium_contract_incomplete",
          missing: contractGuard.missing,
          warnings: contractGuard.warnings,
          message:
            "Le contrat premium du chapitre est incomplet. Retourne dans le studio pour régénérer le plan avant de relancer la pipeline.",
        } as never,
      },
    });
    return { ok: false as const, error: "premium_contract_incomplete" };
  }
  if (contractGuard.warnings.length > 0) {
    console.warn(
      `[pipeline:P1-1] premium_contract_warnings chapterId=${job.chapterId} warnings=${contractGuard.warnings.join(" | ")}`,
    );
  }

  const projectId = job.projectId;
  const chapterId = job.chapterId;
  const chapterNumber = chapter.chapterNumber;
  const npcProfileByCharacterId = new Map(
    npcProfiles
      .filter((profile): profile is typeof profile & { characterId: string } => typeof profile.characterId === "string")
      .map((profile) => [profile.characterId, profile]),
  );
  const intensityLayer = (project?.intensityLayer as string | null) ?? "TEEN";
  const jobInput = ((job.input as Record<string, unknown>) ?? {}) as PipelineJobInput;
  const focusCharacterIds = Array.isArray(jobInput.focusCharacterIds) ? jobInput.focusCharacterIds.filter(Boolean) : [];
  const selectedPlotLabel =
    jobInput.selectedPlotLabel === "safe" || jobInput.selectedPlotLabel === "bold" || jobInput.selectedPlotLabel === "shock"
      ? jobInput.selectedPlotLabel
      : undefined;
  const effectiveCreativeControls = normalizeCreativeControls(
    jobInput.creativityControls,
    project?.settings?.canonStrictness,
  );

  const pipelineVersion = project?.settings?.pipelineVersion === "v2" ? "v2" : "v1";

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "running", startedAt: job.startedAt ?? new Date(), pipelineVersion },
  });

  console.log(`[pipeline:T12] pipelineVersion=${pipelineVersion} project=${projectId} job=${jobId}`);

  try {
    // LoRA auto non bloquant: on queue l'entraînement, sans retarder le chapitre courant.
    const autoLoraQueued = await queueAutoLoraTrainingIfEligible({
      projectId,
      characters: rawCharacters,
      loraAttachments: loraAttachments as LoadedLoraAttachment[],
    }).catch((error) => {
      const msg = error instanceof Error ? error.message : "auto_lora_queue_failed";
      console.error(`[auto-lora] queue failed project=${projectId} error=${msg}`);
      return 0;
    });
    if (autoLoraQueued > 0) {
      console.log(`[auto-lora] queued_for_project=${projectId} count=${autoLoraQueued}`);
    }

    // Prétraiter le userIntent pour mapper aux entités du projet
    const enrichedIntent = (() => {
      const intent = chapter.userIntent ?? "";
      const intentLower = intent.toLowerCase();
      const mentionedChars = rawCharacters
        .filter((c) => intentLower.includes(c.name.toLowerCase()))
        .map((c) => c.name);
      const unmatchedFocusNames = focusCharacterIds
        .map((fid) => rawCharacters.find((c) => c.id === fid)?.name)
        .filter((n): n is string => typeof n === "string" && n.length > 0 && !mentionedChars.includes(n));

      const parts = [intent];
      if (unmatchedFocusNames.length > 0) {
        parts.push(`[Personnages sélectionnés mais pas encore mentionnés : ${unmatchedFocusNames.join(", ")}]`);
      }
      if (mentionedChars.length > 0) {
        parts.push(`[Personnages détectés dans l'intention : ${mentionedChars.join(", ")}]`);
      }
      return parts.join("\n");
    })();

    // ── Passes narratives : contexte, bundle, cohérence, persistance, continuité ──
    const narrativeResult = await runNarrativePass(
      { jobId, chapterId, projectId, userId: "", chapterNumber, pipelineVersion },
      {
        chapter,
        project,
        job,
        stylePacks,
        loraAttachments,
        rawCharacters,
        npcProfiles,
        propInventory,
        npcProfileByCharacterId,
        intensityLayer,
        effectiveCreativeControls,
        enrichedIntent,
        selectedPlotLabel,
        focusCharacterIds,
        jobInput,
      },
    );
    const {
      context,
      revisedBundle,
      continuity,
      narrative,
      continuityKernel,
      studioSnapshot,
      productionSource,
      adultEngine,
      finalPanelBlueprints,
      plannedImages,
      chapterLookProfile,
      canonRefByName,
      faceCloseupRefByName,
      loraByCharId,
      loraByCharName,
      validatedSceneSnapshots,
      kernelValidationWarnings,
    } = narrativeResult;

    // ── Étape 3.5 : Compilateur visuel de chapitre (plan canonique) ────────
    // Transforme plannedImages + baseMetadata en `ChapterImagePlanItem[]`.
    // Plan + validation persistés pour audit. Consommé par image-generation
    // pass pour construire les `CanonicalImagePromptPacket` packet-aware.
    const chapterImagePlan = buildChapterImagePlanFromNarrative({
      projectId,
      chapterId,
      mangaStyleProfile: deriveMangaStyleProfileFromStylePack(stylePacks as Array<{ name?: string | null }>),
      contentRating: deriveContentRatingFromProject({
        intensityLayer,
        settings: project?.settings as { contentRating?: string | null } | null | undefined,
      }),
      plannedImages: plannedImages as Parameters<typeof buildChapterImagePlanFromNarrative>[0]["plannedImages"],
      rawCharacters: rawCharacters as Array<{ id: string; name: string; roleType?: string | null }>,
    });
    console.log(
      `[pipeline:chapter-image-plan] chapter=${chapterId} items=${chapterImagePlan.plan.length} valid=${chapterImagePlan.validation.valid} issues=${chapterImagePlan.validation.issues.length} warnings=${chapterImagePlan.validation.warnings.length}`,
    );
    if (chapterImagePlan.validation.issues.length > 0) {
      console.warn(
        `[pipeline:chapter-image-plan] issues=${chapterImagePlan.validation.issues.join(" | ")}`,
      );
    }
    if (chapterImagePlan.validation.warnings.length > 0) {
      console.warn(
        `[pipeline:chapter-image-plan] warnings=${chapterImagePlan.validation.warnings.join(" | ")}`,
      );
    }

    // ── Étape 4 : Génération des images réelles via FAL ────────────────────
    const imageResult = await runImageGenerationPass(
      { jobId, chapterId, projectId, userId: "", chapterNumber },
      {
        rawCharacters,
        stylePacks,
        chapter,
        project,
        intensityLayer,
        adultEngine,
        context,
        revisedBundle,
        studioSnapshot,
        productionSource,
        finalPanelBlueprints,
        plannedImages,
        chapterLookProfile,
        canonRefByName,
        faceCloseupRefByName,
        loraByCharName,
        loraByCharId,
        effectiveCreativeControls,
        chapterImagePlan,
      },
    );
    const { generatedCount, failedCount, chapterQualityReport, generationRunSummary } = imageResult;

    // ── Étape 5 : Mémoire, continuity, canon state, finalisation ──────────
    await runMemoryPass(
      { jobId, chapterId, projectId, userId: "", chapterNumber },
      {
        revisedBundle,
        continuity,
        narrative,
        continuityKernel,
        validatedSceneSnapshots,
        kernelValidationWarnings,
        plannedImages,
        chapterQualityReport,
        generatedCount,
        failedCount,
        generationRunSummary,
        effectiveCreativeControls,
        context: context as unknown as { characters: { name: string; status?: string }[] },
      },
    );

    return { ok: true as const };

  } catch (error) {
    const message = error instanceof Error ? error.message : "pipeline_failed";
    const stack = error instanceof Error ? error.stack?.slice(0, 500) : undefined;
    console.error(`[pipeline] FAILED jobId=${jobId} error=${message}`, stack ?? "");
    try {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "failed", finishedAt: new Date(), error: { message, stack } },
      });
    } catch (dbErr) {
      console.error(`[pipeline] Cannot update job status:`, dbErr);
    }
    return { ok: false as const, error: message };
  }
}
