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
  type ChapterStyleBible,
} from "@manga-ai-studio/ai";
import { assertPremiumContractFromChapter } from "./passes/assert-premium-contract-guard";
import {
  isPipelineV3StoryboardEnabled,
  isPipelineV3RenderFalEnabled,
  isPipelineV3PremiumOnlyEnabled,
} from "./pipeline-feature-flags";
import { PREMIUM_PANEL_RANGE } from "@manga-ai-studio/core";
import {
  buildChapterImagePlanFromNarrative,
  deriveContentRatingFromProject,
  deriveMangaStyleProfileFromStylePack,
} from "./chapter-image-plan-from-narrative";

export { setJobProgress } from "./pipeline-job";

function buildStyleBibleFromUserProject(input: {
  project: Record<string, unknown> | null;
  stylePacks: Array<Record<string, unknown>>;
}): ChapterStyleBible {
  const base = createDefaultChapterStyleBible();
  const sp = input.stylePacks[0] ?? null;
  const projectTone = typeof input.project?.tone === "string" ? input.project.tone : null;
  const projectGenre = typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null;
  const projectVisualStyle = typeof input.project?.visualStyle === "string" ? input.project.visualStyle : null;

  const renderFamily = sp && typeof sp.renderFamily === "string" ? sp.renderFamily : null;
  const lineWeightRaw = sp && typeof sp.lineWeight === "string" ? sp.lineWeight : null;
  const shadingModeRaw = sp && typeof sp.shadingMode === "string" ? sp.shadingMode : null;
  const contrastRaw = sp && typeof sp.contrastProfile === "string" ? sp.contrastProfile : null;
  const bgDensityRaw = sp && typeof sp.backgroundDensity === "string" ? sp.backgroundDensity : null;
  const negativeConstraints = sp && Array.isArray(sp.negativeConstraints) ? sp.negativeConstraints : [];

  const lineWeightHint: ChapterStyleBible["lineWeightHint"] =
    lineWeightRaw?.toLowerCase().includes("fine") || lineWeightRaw?.toLowerCase().includes("thin")
      ? "fine"
      : lineWeightRaw?.toLowerCase().includes("bold") || lineWeightRaw?.toLowerCase().includes("heavy")
        ? "bold"
        : lineWeightRaw?.toLowerCase().includes("medium")
          ? "medium"
          : base.lineWeightHint;

  const inking: ChapterStyleBible["inking"] =
    lineWeightRaw?.toLowerCase().includes("heavy")
      ? "heavy_ink_weight"
      : lineWeightRaw?.toLowerCase().includes("light")
        ? "light_ink_weight"
        : contrastRaw?.toLowerCase().includes("high")
          ? "mixed_contrast"
          : base.inking;

  const screentoneIntensity: ChapterStyleBible["screentoneIntensity"] =
    shadingModeRaw?.toLowerCase().includes("none")
      ? "none"
      : shadingModeRaw?.toLowerCase().includes("heavy")
        ? "heavy"
        : shadingModeRaw?.toLowerCase().includes("light")
          ? "light"
          : base.screentoneIntensity;

  const backgroundDensity: ChapterStyleBible["backgroundDensity"] =
    bgDensityRaw?.toLowerCase().includes("minimal") || bgDensityRaw?.toLowerCase().includes("low")
      ? "minimal"
      : bgDensityRaw?.toLowerCase().includes("detailed") || bgDensityRaw?.toLowerCase().includes("high")
        ? "detailed"
        : base.backgroundDensity;

  const palette: ChapterStyleBible["palette"] =
    (projectVisualStyle ?? "").toLowerCase().includes("color")
      ? "full_color_manga"
      : base.palette;

  const artStyleParts = [
    renderFamily,
    projectVisualStyle,
    palette === "full_color_manga" ? "full-color manga" : "black and white manga with screentones",
  ].filter(Boolean);

  return {
    ...base,
    artStyle: artStyleParts.length > 0 ? artStyleParts.join(", ") : base.artStyle,
    palette,
    inking,
    screentoneIntensity,
    lineWeightHint,
    backgroundDensity,
    toneKeywords: [
      ...(projectTone ? [projectTone.toLowerCase()] : []),
      ...(projectGenre ? [projectGenre.toLowerCase()] : []),
      ...base.toneKeywords,
    ].slice(0, 6),
    forbiddenStyleKeywords: Array.from(
      new Set([
        ...base.forbiddenStyleKeywords,
        ...(negativeConstraints.filter((x): x is string => typeof x === "string") as string[]),
      ]),
    ),
  };
}

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

  // P0/P3 — invariant premium-only : aucun fallback legacy possible.
  // Si premium-only est ON, la v3 DOIT être ON et le rendu FAL réel DOIT être ON.
  // Sinon on échoue immédiatement (plutôt que “continuer en legacy”).
  if (premiumV3OnlyEnabled && !pipelineV3Enabled) {
    throw new Error(
      "premium_v3_only_misconfigured: PIPELINE_V3_PREMIUM_ONLY=true mais PIPELINE_V3_STORYBOARD=false. " +
        "Le premium-only interdit toute exécution legacy : active la v3 ou désactive PREMIUM_ONLY.",
    );
  }
  if (premiumV3OnlyEnabled && !isPipelineV3RenderFalEnabled()) {
    throw new Error(
      "premium_v3_only_misconfigured: PIPELINE_V3_PREMIUM_ONLY=true impose PIPELINE_V3_RENDER_FAL=true. " +
        "Le render-pass v3 doit générer et persister les images ; aucun fallback legacy n'est autorisé.",
    );
  }

  // P3 — en mode "premium v3 only", le render legacy (image-generation-pass)
  // ne tournera pas. Le v3 render-pass DOIT réussir, sinon on fail dur.
  // On track le succès v3 pour décider en aval.
  let v3RenderSucceeded = false;

  try {
    // ── Pipeline v3 : StoryArc → StoryboardPlan → RenderPass (FAL) ──
    // En premium-only, ce chemin est EXCLUSIF : aucun legacy ne doit tourner.
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
        // COMMIT P9 — projectFormat OBLIGATOIRE dans le storyboard-pass.
        // On résout depuis project.format (string libre en DB) vers l'enum
        // strict `manga | webtoon`. Si la valeur en DB est null ou
        // inconnue, on loggue explicitement le fallback au lieu d'avaler
        // silencieusement (l'utilisateur a pu choisir webtoon et on se
        // retrouve à générer un storyboard manga par défaut).
        const projectFormatRaw = (project as { format?: string | null } | null)?.format ?? null;
        const projectFormat: "manga" | "webtoon" =
          projectFormatRaw === "webtoon" ? "webtoon" : "manga";
        if (projectFormatRaw !== "manga" && projectFormatRaw !== "webtoon") {
          console.warn(
            `[pipeline:v3:storyboard] project_format_fallback raw=${projectFormatRaw ?? "null"} → manga (projectId=${projectId})`,
          );
        }
        const storyboardPassResult = await runStoryboardPass({
          storyArc: storyPassResult.storyArc,
          heroCharacterIds: focusCharacterIds,
          projectFormat,
          targetPanelCount: PREMIUM_PANEL_RANGE.target,
        });
        if (storyboardPassResult.blockers.length > 0) {
          console.error(
            `[pipeline:v3:storyboard] blockers=${storyboardPassResult.blockers.join(" | ")}`,
          );
          // P8/P3 — en premium-only, un storyboard non conforme est un FAIL dur.
          if (premiumV3OnlyEnabled) {
            throw new Error(
              `premium_v3_only_storyboard_blockers: ${storyboardPassResult.blockers.join(" | ")}`,
            );
          }
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
          // P6 — en mode premium-only, une lacune de couverture visuelle
          // (créature / menace / prop / surveillance / décor clé non
          // couverts par un panel dédié) est un BLOCKER dur. Plus de
          // shadow warning. Le storyboard natif DOIT couvrir les
          // obligations du StoryArc pour partir en rendu.
          if (premiumV3OnlyEnabled) {
            throw new Error(
              `premium_v3_only_visual_coverage_gaps: ${coverageReport.gaps.length} entities uncovered [${gapSummary}]`,
            );
          }
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
            styleBible: buildStyleBibleFromUserProject({
              project: project as unknown as Record<string, unknown> | null,
              stylePacks: stylePacks as unknown as Array<Record<string, unknown>>,
            }),
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
            // COMMIT B — on persiste dès qu'on rend réellement des
            // images (renderFalEnabled). Le reader consommera ces
            // SceneImage sans passer par le legacy.
            persistToDb: renderFalEnabled,
          });
          console.log(
            `[pipeline:v3:render] total=${renderPassResult.summary.totalPanels} specs=${renderPassResult.specs.length} failed=${renderPassResult.summary.failedCount} panel_qa_ok=${renderPassResult.panelQa.okCount}/${renderPassResult.panelQa.okCount + renderPassResult.panelQa.failCount}`,
          );
          if (renderPassResult.summary.warnings.length > 0) {
            console.warn(
              `[pipeline:v3:render] warnings=${renderPassResult.summary.warnings.slice(0, 5).join(" | ")}`,
            );
          }
          // COMMIT A — critère de succès v3 durci.
          //
          // Un "silent success" (specs complètes mais `renderedCount=0` parce
          // que `generatePanelImage` n'était pas passé) ne doit PLUS valider
          // `v3RenderSucceeded`. Sinon le `skipLegacyImagePipeline` plus bas
          // finalise le chapitre avec 0 image réellement persistée.
          //
          // Critères durs :
          //   - aucune spec échouée
          //   - au moins 1 panel (sinon le storyboard est vide)
          //   - toutes les specs produites
          //   - ET le render a réellement rendu des images (pas de panels
          //     skippés parce que FAL était désactivé)
          const renderedCount = renderPassResult.summary.renderedCount;
          const skippedCount = renderPassResult.summary.skippedCount;
          v3RenderSucceeded =
            renderPassResult.summary.failedCount === 0 &&
            renderPassResult.specs.length === renderPassResult.summary.totalPanels &&
            renderPassResult.summary.totalPanels > 0 &&
            renderedCount > 0 &&
            skippedCount === 0;
          if (!v3RenderSucceeded) {
            console.warn(
              `[pipeline:v3:render] v3_succeeded=false rendered=${renderedCount} skipped=${skippedCount} failed=${renderPassResult.summary.failedCount} specs=${renderPassResult.specs.length}/${renderPassResult.summary.totalPanels} — legacy image-gen will still run (unless PREMIUM_ONLY=true which would then fail-hard)`,
            );
            if (premiumV3OnlyEnabled) {
              throw new Error(
                `premium_v3_only_render_incomplete: rendered=${renderedCount} skipped=${skippedCount} failed=${renderPassResult.summary.failedCount} specs=${renderPassResult.specs.length}/${renderPassResult.summary.totalPanels}`,
              );
            }
          }
        } catch (renderErr) {
          const renderMsg = renderErr instanceof Error ? renderErr.message : String(renderErr);
          console.error(
            `[pipeline:v3:render] shadow_render_failed chapterId=${chapterId} error=${renderMsg}`,
          );
          if (premiumV3OnlyEnabled) {
            // P3 — en mode premium-only, on n'a PAS de filet legacy. Fail.
            throw new Error(
              `premium_v3_only_render_failed: ${renderMsg}`,
            );
          }
        }
      } catch (v3Err) {
        const v3Msg = v3Err instanceof Error ? v3Err.message : String(v3Err);
        console.error(
          `[pipeline:v3] shadow_mode_failed chapterId=${chapterId} error=${v3Msg}`,
        );
        if (premiumV3OnlyEnabled) {
          throw new Error(`premium_v3_only_failed: ${v3Msg}`);
        }
      }
    }

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
