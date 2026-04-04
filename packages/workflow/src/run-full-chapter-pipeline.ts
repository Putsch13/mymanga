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

/**
 * Infère des détails d'environnement pour rendre l'image vivante :
 * foule, heure du jour, météo, ambiance sonore, NPC de fond.
 */
function inferEnvironment(location: string, mood: string, sceneCharCount: number, panelCharCount: number): string {
  const loc = location.toLowerCase();
  const parts: string[] = [];

  // Foule / monde selon le lieu
  if (loc.includes("tavern") || loc.includes("bar") || loc.includes("auberge") || loc.includes("inn")) {
    parts.push("busy tavern interior, patrons drinking in background, warm candlelight, wooden beams");
  } else if (loc.includes("marché") || loc.includes("market") || loc.includes("bazar") || loc.includes("plaza")) {
    parts.push("crowded marketplace, vendors and shoppers in background, colorful stalls");
  } else if (loc.includes("ville") || loc.includes("city") || loc.includes("rue") || loc.includes("street")) {
    parts.push("city street with pedestrians, buildings lining the road, urban atmosphere");
  } else if (loc.includes("château") || loc.includes("castle") || loc.includes("palais") || loc.includes("throne")) {
    parts.push("grand castle interior, stone walls, torches, guards in background");
  } else if (loc.includes("forêt") || loc.includes("forest") || loc.includes("bois") || loc.includes("jungle")) {
    parts.push("dense forest, dappled sunlight through canopy, nature sounds implied");
  } else if (loc.includes("combat") || loc.includes("arène") || loc.includes("arena") || loc.includes("battlefield")) {
    parts.push("battle arena, dust and debris, spectators or soldiers in background");
  } else if (loc.includes("école") || loc.includes("school") || loc.includes("académie") || loc.includes("academy")) {
    parts.push("school hallway or classroom, students in background, institutional setting");
  }

  // Heure du jour selon le mood
  if (mood === "horror" || mood === "tension") {
    parts.push("nighttime or twilight, dramatic shadows, low visibility");
  } else if (mood === "romance" || mood === "calm") {
    parts.push("golden hour or soft daylight, warm ambient lighting");
  } else if (mood === "action") {
    parts.push("dynamic lighting, motion particles, energy in the air");
  }

  // Interactions avec personnages non nommés si la scène en implique
  if (sceneCharCount > panelCharCount && panelCharCount <= 2) {
    parts.push("other characters visible in background, environmental storytelling");
  }

  return parts.join(", ");
}

function buildRoutingContext(
  intensityLayer: string,
  panel: StoryboardPanel,
  hasCanonRef: boolean,
): RoutingContext {
  return {
    mode: "PANEL_DRAFT",
    contentIntensityLayer: intensityLayer,
    isNewCharacter: false,
    hasCanonReferences: hasCanonRef,
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
    prisma.character.findMany({
      where: { projectId: job.projectId },
      include: { canonPack: true },
    }).then(async (chars) => {
      // Récupérer les canonical image URLs en raw SQL (subquery sur SceneImage)
      let canonUrls: Record<string, string> = {};
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{ characterId: string; canonicalImageUrl: string | null }>>(
          `SELECT c.id AS "characterId",
                  (SELECT si."imageUrl" FROM "SceneImage" si
                   JOIN "ChapterScene" cs ON si."sceneId" = cs.id
                   JOIN "Chapter" ch ON cs."chapterId" = ch.id
                   WHERE ch."projectId" = c."projectId"
                     AND si."imageUrl" IS NOT NULL
                     AND si.status = 'completed'
                   ORDER BY si."createdAt" DESC
                   LIMIT 1) AS "canonicalImageUrl"
           FROM "Character" c
           WHERE c."projectId" = $1`,
          job.projectId,
        );
        for (const r of rows) {
          if (r.canonicalImageUrl) canonUrls[r.characterId] = r.canonicalImageUrl;
        }
      } catch (e) {
        console.error("[pipeline] canonical URL query failed, continuing without:", e instanceof Error ? e.message : e);
      }
      return chars.map((c) => {
        const raw = c as unknown as Record<string, unknown>;
        const bodyState = raw.bodyState && typeof raw.bodyState === "object" ? raw.bodyState as Record<string, unknown> : {};
        const wardrobeProfile = raw.wardrobeProfile && typeof raw.wardrobeProfile === "object" ? raw.wardrobeProfile as Record<string, unknown> : {};
        const visualProfile = raw.visualProfile && typeof raw.visualProfile === "object" ? raw.visualProfile as Record<string, unknown> : {};

        // Construire une description corporelle compacte depuis bodyState
        const bodyParts: string[] = [];
        if (bodyState.height) bodyParts.push(String(bodyState.height));
        if (bodyState.build) bodyParts.push(String(bodyState.build));
        if (bodyState.scars) bodyParts.push(`scars: ${String(bodyState.scars)}`);
        if (bodyState.prosthetics) bodyParts.push(`prosthetic: ${String(bodyState.prosthetics)}`);
        if (bodyState.tattoos) bodyParts.push(`tattoo: ${String(bodyState.tattoos)}`);
        if (bodyState.injuries) bodyParts.push(`injury: ${String(bodyState.injuries)}`);
        if (bodyState.modifications) bodyParts.push(String(bodyState.modifications));
        const bodyDetails = bodyParts.join(", ") || null;

        // Construire une description vestimentaire compacte
        const wardrobeParts: string[] = [];
        if (wardrobeProfile.defaultOutfit) wardrobeParts.push(String(wardrobeProfile.defaultOutfit));
        if (wardrobeProfile.accessories) wardrobeParts.push(String(wardrobeProfile.accessories));
        if (wardrobeProfile.armor) wardrobeParts.push(String(wardrobeProfile.armor));
        if (wardrobeProfile.weapons) wardrobeParts.push(String(wardrobeProfile.weapons));
        const wardrobeDetails = wardrobeParts.join(", ") || null;

        return {
          id: c.id,
          name: c.name,
          gender: typeof raw.gender === "string" ? raw.gender : null,
          appearance: typeof raw.appearance === "string" ? raw.appearance : null,
          hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
          eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
          outfitDefault: typeof raw.outfitDefault === "string" ? raw.outfitDefault : null,
          canonicalImageUrl: canonUrls[c.id] ?? null,
          canonSignatureText: c.canonPack?.visualSignatureText ?? null,
          forbiddenVisualDrift: c.canonPack?.forbiddenVisualDrift ?? null,
          bodyDetails,
          wardrobeDetails,
          visualProfile,
        };
      });
    }),
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
    // buildProjectContext retourne un objet structurellement compatible avec ProjectContextForChapter.
    // Le cast est nécessaire car les types Prisma (Json, Decimal…) diffèrent des types pipeline.
    // À terme : exporter ProjectContextForChapter depuis packages/memory et aligner les deux.
    const context = contextRaw as ProjectContextForChapter;

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
                      gender: c.gender,
                      appearance: c.appearance,
                      hairColor: c.hairColor,
                      eyeColor: c.eyeColor,
                      outfitDefault: c.outfitDefault,
                      canonicalImageUrl: c.canonicalImageUrl ?? null,
                      forbiddenDrift: Array.isArray(c.forbiddenVisualDrift)
                        ? (c.forbiddenVisualDrift as string[]).filter((item) => typeof item === "string")
                        : null,
                      bodyDetails: c.bodyDetails,
                      wardrobeDetails: c.wardrobeDetails,
                      visualSignatureText:
                        c.canonSignatureText ??
                        ([
                          c.gender === "male" ? "male" : c.gender === "female" ? "female" : null,
                          c.appearance,
                          c.hairColor ? `${c.hairColor} hair` : null,
                          c.eyeColor ? `${c.eyeColor} eyes` : null,
                          c.outfitDefault,
                        ].filter(Boolean).join(", ") || null),
                    })),
              location: scene.location,
              action: panel.narration ?? panel.caption,
              camera: panel.camera,
              mood: panel.mood,
              contentIntensityLayer: intensityLayer,
              dialogueHint: panel.dialogue ? `${panel.dialogue.speaker}: ${panel.dialogue.text}` : undefined,
              sceneContext: `${scene.summary} (${scene.purpose ?? ""})`.slice(0, 250),
              environmentHint: inferEnvironment(scene.location, panel.mood, scene.characters.length, panel.characters.length),
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

            // Collecter les refs canoniques des personnages de ce panel
            const panelCanonRefs = panel.characters
              .map((name) => rawCharacters.find((c) => c.name === name)?.canonicalImageUrl)
              .filter((url): url is string => Boolean(url));

            const created = await tx.sceneImage.create({
              data: {
                sceneId: createdScene.id,
                panelNumber: panel.panelNumber,
                renderingMode: "PANEL_DRAFT",
                prompt: composedPositive,
                negativePrompt: composedNegative,
                status: "planned",
                width: 512,
                height: 768,
                referenceImageIds: panelCanonRefs as unknown as Prisma.InputJsonValue,
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
      { timeout: 60_000, maxWait: 15_000 },
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

    // Construire un index canonicalImageUrl par nom de personnage pour les refs IP-Adapter
    const canonRefByName = new Map<string, string>();
    for (const c of rawCharacters) {
      if (c.canonicalImageUrl) canonRefByName.set(c.name, c.canonicalImageUrl);
    }

    async function processOneImage(item: PlannedImage): Promise<"ok" | "fail"> {
      const panelCharacterNames: string[] = item.panel.characters ?? [];
      // Prendre la première ref canonique disponible parmi les personnages du panel
      const canonRef = panelCharacterNames.map((n) => canonRefByName.get(n)).find(Boolean) ?? null;
      const hasCanonRef = Boolean(canonRef);

      try {
        const routingCtx = buildRoutingContext(intensityLayer, item.panel, hasCanonRef);
        const result = await runRoutedImageGeneration(routingCtx, {
          mode: "PANEL_DRAFT",
          positivePrompt: item.panel.prompt,
          negativePrompt: item.panel.negativePrompt,
          // 512×768 : -50% coût image, qualité suffisante pour panels manga mobile
          width: 512,
          height: 768,
          referenceImageUrls: canonRef ? [canonRef] : undefined,
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
            return "fail";
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
                canonRefUsed: canonRef ?? null,
              } as unknown) as Prisma.InputJsonValue,
            },
          });
          return "ok";
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
          return "fail";
        }
      } catch (imgError) {
        const msg = imgError instanceof Error ? imgError.message : "image_error";
        console.error(`[pipeline] image failed sceneImageId=${item.sceneImageId} error=${msg}`);
        await prisma.sceneImage.update({
          where: { id: item.sceneImageId },
          data: {
            status: "failed",
            metadata: ({ ...item.baseMetadata, error: msg } as unknown) as Prisma.InputJsonValue,
          },
        });
        return "fail";
      }
    }

    // Génération en batches parallèles de 5 (équilibre vitesse / rate-limit FAL)
    const BATCH_SIZE = 5;
    for (let batchStart = 0; batchStart < plannedImages.length; batchStart += BATCH_SIZE) {
      const batch = plannedImages.slice(batchStart, batchStart + BATCH_SIZE);
      const results = await Promise.all(batch.map(processOneImage));
      for (const r of results) {
        if (r === "ok") generatedCount++;
        else failedCount++;
      }
      await setJobProgress(
        jobId,
        {
          key: "generate_images",
          label: `Génération images (${generatedCount}/${plannedImages.length})`,
          detail: failedCount > 0 ? `${failedCount} échec(s)` : undefined,
        },
        "running",
      );
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
    const stack = error instanceof Error ? error.stack?.slice(0, 500) : undefined;
    console.error(`[pipeline] FAILED jobId=${jobId} error=${message}`, stack ?? "");
    try {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: { message, stack },
        },
      });
    } catch (dbErr) {
      console.error(`[pipeline] Cannot update job status:`, dbErr instanceof Error ? dbErr.message : dbErr);
    }
    return { ok: false as const, error: message };
  }
}
