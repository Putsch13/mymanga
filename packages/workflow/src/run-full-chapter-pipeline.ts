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
import { runStoryPass } from "./passes/story-pass";
import { runStoryboardPass } from "./passes/storyboard-pass";
import { runPageQaPass } from "./passes/page-qa-pass";
import { runRenderPass } from "./passes/render-pass";
import { loadChapterVisualMemory } from "./passes/load-chapter-visual-memory";
import { createDefaultPanelImageGenerator } from "./passes/default-panel-image-generator";
import { createDefaultChapterStyleBible } from "@manga-ai-studio/ai/contracts";
import {
  extractRequiredVisualCoverage,
  validateVisualCoverage,
} from "@manga-ai-studio/ai";
import { assertPremiumContractFromChapter } from "./passes/assert-premium-contract-guard";
import {
  isPipelineV3StoryboardEnabled,
  isPipelineV3RenderFalEnabled,
} from "./pipeline-feature-flags";
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

  const pipelineV3Enabled = isPipelineV3StoryboardEnabled();
  console.log(`[pipeline:v3] PIPELINE_V3_STORYBOARD=${pipelineV3Enabled}`);

  try {
    // ── Pipeline v3 (shadow mode) : on persiste StoryArc + StoryboardPlan
    // AVANT toute génération image. Flag-gated pour permettre un rollback
    // immédiat. Quand le flag est ON, la sortie reste fournie par la
    // pipeline legacy pour ne rien casser en prod pendant le Sprint 1.
    // Les Sprints suivants remplaceront progressivement la narrative-pass
    // et l'image-generation-pass par les passes v3 strictes.
    if (pipelineV3Enabled) {
      try {
        const storyPassResult = await runStoryPass({
          chapterId,
          chapterNumber,
          title: chapter.title,
          userIntent: chapter.userIntent,
          summary: chapter.summary,
          mainCharacters: rawCharacters.map((c) => ({
            id: c.id,
            name: c.name,
            roleType: (c as { roleType?: string | null }).roleType ?? null,
          })),
          locations: [],
        });
        if (storyPassResult.warnings.length > 0) {
          console.warn(
            `[pipeline:v3:story] warnings=${storyPassResult.warnings.join(" | ")}`,
          );
        }
        const storyboardPassResult = await runStoryboardPass({
          storyArc: storyPassResult.storyArc,
          heroCharacterIds: focusCharacterIds,
        });
        if (storyboardPassResult.blockers.length > 0) {
          console.error(
            `[pipeline:v3:storyboard] blockers=${storyboardPassResult.blockers.join(" | ")}`,
          );
        }
        if (storyboardPassResult.warnings.length > 0) {
          console.warn(
            `[pipeline:v3:storyboard] warnings=${storyboardPassResult.warnings.join(" | ")}`,
          );
        }
        const pageQa = await runPageQaPass(storyboardPassResult.storyboardPlan);
        console.log(
          `[pipeline:v3:page-qa] ok=${pageQa.okCount} fail=${pageQa.failCount}`,
        );

        // H12/H13 — visual coverage strict : on extrait les obligations
        // visuelles du StoryArc et on vérifie que le storyboard les
        // couvre toutes via des panels dédiés (renderMode + subjectFocus
        // exacts). Sinon on bloque (pas de warning).
        const requiredCoverage = extractRequiredVisualCoverage(storyPassResult.storyArc);
        const coverageReport = validateVisualCoverage(
          requiredCoverage,
          storyboardPassResult.storyboardPlan,
        );
        console.log(
          `[pipeline:v3:visual-coverage] required=${requiredCoverage.length} fulfilled=${coverageReport.fulfilled.length} gaps=${coverageReport.gaps.length}`,
        );
        if (!coverageReport.ok) {
          const gapSummary = coverageReport.gaps
            .slice(0, 8)
            .map((g) => `${g.coverage.entityType}:${g.coverage.entity}@${g.coverage.sourceBeatId}`)
            .join(" | ");
          console.error(
            `[pipeline:v3:visual-coverage] gaps=${coverageReport.gaps.length} ${gapSummary}`,
          );
          // En shadow mode v3 on loggue fortement mais on ne throw pas
          // encore pour ne pas bloquer la prod pendant la bascule. Le
          // guard dur est au niveau du launch route (H1) + de l'image-
          // generation-pass (H4). À durcir en fail dur lorsque toutes
          // les obligations storyboard seront couvertes par l'agent LLM.
        }

        // Render-pass v3 en shadow : hydrate la visual memory depuis la DB,
        // construit les specs + prompts + route FAL pour chaque panel, persiste
        // le summary pour audit. Aucune image n'est générée ici tant qu'on
        // n'a pas branché un adapter FAL v3 (la pipeline legacy continue).
        try {
          const visualMemoryResult = await loadChapterVisualMemory({
            chapterId,
            projectId,
            mainCharacterIds: focusCharacterIds,
          });
          if (visualMemoryResult.warnings.length > 0) {
            console.warn(
              `[pipeline:v3:visual-memory] warnings=${visualMemoryResult.warnings.slice(0, 5).join(" | ")}`,
            );
          }
          console.log(
            `[pipeline:v3:visual-memory] chars=${visualMemoryResult.stats.charactersLoaded} missing_face=${visualMemoryResult.stats.charactersMissingFaceRef} env=${visualMemoryResult.stats.environmentsLoaded} style=${visualMemoryResult.stats.styleRefsLoaded}`,
          );
          const renderFalEnabled = isPipelineV3RenderFalEnabled();
          console.log(
            `[pipeline:v3:render] fal_real_enabled=${renderFalEnabled} (flag PIPELINE_V3_RENDER_FAL)`,
          );
          const renderPassResult = await runRenderPass({
            chapterId,
            storyboardPlan: storyboardPassResult.storyboardPlan,
            styleBible: createDefaultChapterStyleBible(),
            visualMemory: visualMemoryResult.memory,
            characters: rawCharacters.map((c) => ({
              id: c.id,
              name: c.name,
              roleType: (c as { roleType?: string | null }).roleType ?? null,
            })),
            mainCharacterIds: focusCharacterIds,
            generatePanelImage: renderFalEnabled
              ? createDefaultPanelImageGenerator()
              : undefined,
          });
          console.log(
            `[pipeline:v3:render] total=${renderPassResult.summary.totalPanels} specs=${renderPassResult.specs.length} failed=${renderPassResult.summary.failedCount} panel_qa_ok=${renderPassResult.panelQa.okCount}/${renderPassResult.panelQa.okCount + renderPassResult.panelQa.failCount}`,
          );
          if (renderPassResult.summary.warnings.length > 0) {
            console.warn(
              `[pipeline:v3:render] warnings=${renderPassResult.summary.warnings.slice(0, 5).join(" | ")}`,
            );
          }
        } catch (renderErr) {
          const renderMsg = renderErr instanceof Error ? renderErr.message : String(renderErr);
          console.error(
            `[pipeline:v3:render] shadow_render_failed chapterId=${chapterId} error=${renderMsg}`,
          );
        }
      } catch (v3Err) {
        const v3Msg = v3Err instanceof Error ? v3Err.message : String(v3Err);
        console.error(
          `[pipeline:v3] shadow_mode_failed chapterId=${chapterId} error=${v3Msg}`,
        );
      }
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
