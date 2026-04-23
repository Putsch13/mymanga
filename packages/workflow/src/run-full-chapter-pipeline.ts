import { prisma } from "@manga-ai-studio/db";
import { setJobProgress } from "./pipeline-job";
import { normalizeCreativeControls, type PipelineJobInput } from "./pipeline-quality";
import {
  queueAutoLoraTrainingIfEligible,
  type LoadedLoraAttachment,
} from "./pipeline-lora";
import { loadCharactersForPipeline } from "./pipeline-db-loader";
import { assertPremiumContractFromChapter } from "./passes/assert-premium-contract-guard";
import {
  isPipelineV3StoryboardEnabled,
  isPipelineV3PremiumOnlyEnabled,
} from "./pipeline-feature-flags";
import { runPremiumV3Pipeline } from "./run-premium-v3-pipeline";
import { runLegacyCompatibleChapterPipeline } from "./run-legacy-compatible-chapter-pipeline";

export { setJobProgress } from "./pipeline-job";
export { buildStyleBibleFromUserProject } from "./chapter-style-bible-resolver";

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

  const pipelineV3Enabled = isPipelineV3StoryboardEnabled();
  const premiumV3OnlyEnabled = isPipelineV3PremiumOnlyEnabled();
  console.log(
    `[pipeline:v3] PIPELINE_V3_STORYBOARD=${pipelineV3Enabled} PIPELINE_V3_PREMIUM_ONLY=${premiumV3OnlyEnabled}`,
  );

  try {
    const { v3RenderSucceeded } = await runPremiumV3Pipeline({
      chapterId,
      projectId,
      chapterNumber,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      chapterUserIntent: chapter.userIntent,
      project: project as unknown as Record<string, unknown> | null,
      stylePacks: stylePacks as unknown as Array<Record<string, unknown>>,
      rawCharacters: rawCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        roleType: (c as { roleType?: string | null }).roleType ?? null,
      })),
      focusCharacterIds,
      pipelineV3Enabled,
      premiumV3OnlyEnabled,
    });

    // P3 — gate : en mode premium-only, on SAUTE la pipeline legacy
    // (narrative-pass + image-generation-pass). C'est le v3 qui a fait
    // la génération image. On fait juste un minimum de memoryPass.
    const skipLegacyImagePipeline = premiumV3OnlyEnabled && v3RenderSucceeded;
    console.log(
      `[pipeline:v3] v3RenderSucceeded=${v3RenderSucceeded} skipLegacyImagePipeline=${skipLegacyImagePipeline}`,
    );

    // P3 — aucune retombée legacy en premium-only, même si v3 a échoué partiellement.
    if (premiumV3OnlyEnabled && !skipLegacyImagePipeline) {
      throw new Error(
        "premium_v3_only_violation: legacy pipeline would run because v3 did not fully succeed. " +
          "This is forbidden — fail hard and fix the v3 root cause.",
      );
    }

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

    // P3 — court-circuit premium v3 only : si le v3 a bien rendu, on
    // NE DOIT PAS relancer la narrative-pass + image-generation-pass
    // legacy. Le job est considéré terminé. Le memory-pass legacy
    // reste à câbler sur les outputs v3 dans un sprint ultérieur —
    // pour l'instant on finalise le job directement.
    if (skipLegacyImagePipeline) {
      console.log(
        `[pipeline:v3] premium_v3_only_finalized chapterId=${chapterId} — legacy narrative + image passes skipped.`,
      );
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "completed", finishedAt: new Date() },
      });
      return { ok: true as const };
    }

    await runLegacyCompatibleChapterPipeline({
      jobId,
      chapterId,
      projectId,
      chapterNumber,
      pipelineVersion,
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
    });

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
