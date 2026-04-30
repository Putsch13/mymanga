import { prisma } from "@manga-ai-studio/db";
import type { CharacterCanon, PanelBlueprintPremium } from "@manga-ai-studio/core";
import { setJobProgress, mergeJobOutput } from "./pipeline-job";
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
import { extractPriorChapterDialogueSnippets } from "./load-prior-chapter-dialogue-snippets";
import { runPremiumV3Pipeline } from "./run-premium-v3-pipeline";
import { runLegacyCompatibleChapterPipeline } from "./legacy/run-legacy-compatible-chapter-pipeline";

/** Extrait `data.characterCanons` du JSON `chapter.outline` (snapshot studio embarqué). */
function characterCanonsByIdFromChapterOutline(outline: unknown): Record<string, CharacterCanon> | undefined {
  if (!outline || typeof outline !== "object") return undefined;
  const root = outline as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  const list = data.characterCanons;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const out: Record<string, CharacterCanon> = {};
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { characterId?: unknown }).characterId;
    if (typeof id === "string" && id.length > 0) {
      out[id] = item as CharacterCanon;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function resolvePrimaryLoraForPipelineCharacter(
  characterId: string,
  attachments: Array<{
    characterId: string | null;
    enabled: boolean;
    weight: number;
    lora: { name: string; status: string; weightsMeta: unknown };
  }>,
): { loraUrl: string | null; loraTriggerWord: string | null; loraScale: number | null } {
  for (const att of attachments) {
    if (att.characterId !== characterId || !att.enabled) continue;
    const meta = att.lora.weightsMeta as Record<string, unknown>;
    const loraUrl = typeof meta.loraUrl === "string" && meta.loraUrl.length > 0 ? meta.loraUrl : null;
    if (!loraUrl || att.lora.status !== "active") continue;
    const triggerWord =
      typeof meta.triggerWord === "string" && meta.triggerWord.trim().length > 0
        ? meta.triggerWord.trim()
        : typeof att.lora.name === "string"
          ? att.lora.name
          : null;
    return { loraUrl, loraTriggerWord: triggerWord, loraScale: att.weight };
  }
  return { loraUrl: null, loraTriggerWord: null, loraScale: null };
}

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
  const rawJobInput = (job.input as Record<string, unknown>) ?? {};
  const jobInput = rawJobInput as PipelineJobInput;
  const sceneDialogueEnrichFromJob = rawJobInput.sceneDialogueEnrich === true;
  const heroCharacterId = typeof jobInput.heroCharacterId === "string" && jobInput.heroCharacterId.length > 0
    ? jobInput.heroCharacterId
    : null;
  const secondaryHeroCharacterId =
    typeof jobInput.secondaryHeroCharacterId === "string" && jobInput.secondaryHeroCharacterId.length > 0
      ? jobInput.secondaryHeroCharacterId
      : null;
  const focusCharacterIds = Array.isArray(jobInput.focusCharacterIds) ? jobInput.focusCharacterIds.filter(Boolean) : [];
  const activeNpcIds = Array.isArray(jobInput.activeNpcIds) ? jobInput.activeNpcIds.filter(Boolean) : [];
  const activeCreatureIds = Array.isArray(jobInput.activeCreatureIds) ? jobInput.activeCreatureIds.filter(Boolean) : [];
  const locationIds = Array.isArray(jobInput.locationIds) ? jobInput.locationIds.filter(Boolean) : [];
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
  const chapterLocationName =
    typeof (chapter as unknown as { location?: string | null }).location === "string"
      ? (chapter as unknown as { location: string }).location
      : null;
  console.log(
    `[pipeline:v3] PIPELINE_V3_STORYBOARD=${pipelineV3Enabled} PIPELINE_V3_PREMIUM_ONLY=${premiumV3OnlyEnabled}`,
  );

  const outlineRecord = (chapter.outline as Record<string, unknown> | null | undefined) ?? {};
  const approvedOutlineForV3 =
    outlineRecord.approvedOutline
    && typeof outlineRecord.approvedOutline === "object"
    && !Array.isArray(outlineRecord.approvedOutline)
      ? (outlineRecord.approvedOutline as Record<string, unknown>)
      : null;
  const productionPlanRaw = jobInput.productionPlan;
  const productionPlanRecord =
    productionPlanRaw && typeof productionPlanRaw === "object" && !Array.isArray(productionPlanRaw)
      ? (productionPlanRaw as Record<string, unknown>)
      : null;
  const topLevelBlueprints = Array.isArray(jobInput.panelBlueprints) ? jobInput.panelBlueprints : [];
  const productionPlanForV3 =
    productionPlanRecord
    && Array.isArray(productionPlanRecord.panelBlueprints)
    && (productionPlanRecord.panelBlueprints as unknown[]).length > 0
      ? productionPlanRecord
      : topLevelBlueprints.length > 0
        ? { ...(productionPlanRecord ?? {}), panelBlueprints: topLevelBlueprints }
        : productionPlanRecord;

  let priorChapterDialogueSnippets: string[] | undefined;
  if (chapter.chapterNumber > 1) {
    const prevChapter = await prisma.chapter.findFirst({
      where: { projectId, chapterNumber: chapter.chapterNumber - 1 },
      select: { outline: true, summary: true, userIntent: true },
    });
    priorChapterDialogueSnippets = extractPriorChapterDialogueSnippets(prevChapter, 48);
    if (priorChapterDialogueSnippets?.length) {
      console.info(
        `[pipeline:v3:prior-dialogue] snippets_from_chapter_n_minus_1=${priorChapterDialogueSnippets.length}`,
      );
    }
  }

  try {
    const { v3RenderSucceeded, visualWorldDiscovery } = await runPremiumV3Pipeline({
      chapterId,
      projectId,
      chapterNumber,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      chapterUserIntent: chapter.userIntent,
      project: project as unknown as Record<string, unknown> | null,
      stylePacks: stylePacks as unknown as Array<Record<string, unknown>>,
      rawCharacters: rawCharacters.map((c) => {
        const lora = resolvePrimaryLoraForPipelineCharacter(c.id, loraAttachments);
        const profile = npcProfileByCharacterId.get(c.id);
        const vp = c.visualProfile ?? {};
        const hairStyle = typeof vp.hairStyle === "string" ? vp.hairStyle : null;
        const skinTone = typeof vp.skinTone === "string" ? vp.skinTone : null;
        return {
          id: c.id,
          name: c.name,
          roleType: (c as { roleType?: string | null }).roleType ?? null,
          hairColor: c.hairColor,
          eyeColor: c.eyeColor,
          hairStyle,
          skinTone,
          outfitSignature: profile?.outfitSignature ?? null,
          canonSignatureText: c.canonSignatureText,
          forbiddenVisualDrift: Array.isArray(c.forbiddenVisualDrift) ? c.forbiddenVisualDrift : [],
          faceRefUrl: c.faceCloseupImageUrl ?? c.canonicalImageUrl ?? null,
          loraUrl: lora.loraUrl,
          loraTriggerWord: lora.loraTriggerWord,
          loraScale: lora.loraScale,
          stableVisualDNA: c.stableVisualDNA ?? null,
        };
      }),
      approvedOutline: approvedOutlineForV3,
      productionPlan: productionPlanForV3,
      heroCharacterId,
      secondaryHeroCharacterId,
      focusCharacterIds,
      activeNpcIds,
      activeCreatureIds,
      locationIds,
      pipelineV3Enabled,
      premiumV3OnlyEnabled,
      productionPlanPages: Array.isArray(jobInput.productionPlanPages)
        ? jobInput.productionPlanPages as Array<{ pageNumber: number; panelCount: number; beatIds?: string[] | null }>
        : undefined,
      panelBlueprints: Array.isArray(jobInput.panelBlueprints)
        ? jobInput.panelBlueprints as PanelBlueprintPremium[]
        : undefined,
      chapterLocationName,
      priorChapterDialogueSnippets,
      sceneDialogueEnrich: sceneDialogueEnrichFromJob,
      characterCanonsById: characterCanonsByIdFromChapterOutline(chapter.outline),
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
      await mergeJobOutput(jobId, {
        premiumV3: true,
        visualWorldDiscovery: visualWorldDiscovery ?? null,
      });
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
