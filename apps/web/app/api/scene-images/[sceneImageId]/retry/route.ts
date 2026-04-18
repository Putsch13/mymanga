import { NextResponse } from "next/server";
import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import {
  runRoutedImageGeneration,
  resolveAdultEngine,
  validateGeneratedPanel,
  resolvePremiumImageSize,
  detectVisualDrift,
} from "@manga-ai-studio/ai";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, canBypassMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { notFound, unauthorized, validationError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { persistGeneratedImageIfNeeded } from "@/lib/images/persist-generated-image";
import { assertStableImageUrl } from "@/lib/images/assert-stable-image-url";
import { resolveRetryReferencePolicy, type RetryMode } from "@/lib/images/retry-reference-policy";
import { collectRetryStableReferences } from "@/lib/images/retry-stable-references";
import { buildCharacterRetryHints as buildCharacterRetryHintsShared } from "@/lib/retry/build-character-retry-hints";
import { readRetryBody as readRetryBodyShared } from "@/lib/retry/read-retry-body";
import { createProjectCharacterResolver } from "@/lib/retry/resolve-project-characters";
import { buildLocationMarkersLine } from "@/lib/retry/build-location-markers";
import { resolveStableImageReferences } from "@manga-ai-studio/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sceneImageId: string }> };

/**
 * Body JSON accepté par le endpoint /retry (BUG-13 + BUG-14).
 *
 * Back-compat : tous les champs sont optionnels ; l'ancien format `?mode=X&targetCharacterId=Y`
 * en query string reste supporté (fallback si le body est vide ou invalide).
 */
interface RetryBody {
  mode?: RetryMode;
  targetCharacterId?: string;
  /** Texte libre ajouté au prompt positif final (max 400 chars). */
  userPromptAdditions?: string;
  /** Texte libre ajouté au prompt négatif (max 200 chars). */
  userPromptExclusions?: string;
  /** Overrides de contrat appliqués au RoutingContext de ce reroll. Persistés dans metadata.userOverride. */
  forceOverrides?: {
    shotType?: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
    subjectFocus?:
      | "hero"
      | "npc"
      | "important_npc"
      | "enemy"
      | "antagonist"
      | "environment"
      | "group"
      | "prop"
      | "reaction"
      | "aftermath";
    cameraAngle?: string;
    forcedCharacterNames?: string[];
  };
}

// P5.1 : la lecture du body est désormais dans `lib/retry/read-retry-body.ts`.
// On garde un wrapper typé local pour préserver la signature de la route.
async function readRetryBody(req: Request): Promise<RetryBody> {
  return readRetryBodyShared<RetryBody>(req);
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  // G02: rate limit retries
  const rl = await checkRateLimit(user.id, "continue");
  if (!rl.ok) {
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }
  const stack = getGenerationStackStatus();
  if (!stack.canGenerateImages) {
    return validationError("La stack image n'est pas prete pour relancer cette case.", stack);
  }
  const { sceneImageId } = await ctx.params;

  const img = await prisma.sceneImage.findFirst({
    where: { id: sceneImageId, scene: { chapter: { project: { userId: user.id } } } },
    include: { scene: { include: { chapter: { include: { project: true } } } } },
  });
  if (!img) return notFound();

  const project = img.scene.chapter.project;
  const projectId = project.id;
  const intensityLayer = (project.intensityLayer as string | null) ?? "TEEN";
  const adultEngine = resolveAdultEngine({
    primaryGenre: project.primaryGenre,
    subGenres: Array.isArray(project.subGenres) ? project.subGenres as string[] : [],
    visualStyle: project.visualStyle,
    userIntent: img.prompt ?? undefined,
  });
  const projectForGate = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: { user: { include: { preferences: true } } },
  });
  if (!projectForGate) return notFound();
  if (projectRequiresAgeGate(projectForGate.contentRating, projectForGate.intensityLayer) && !canAccessMatureContent(projectForGate.user, projectForGate.user.preferences)) {
    return validationError(getAgeGateMessage(projectForGate.contentRating));
  }
  if (canBypassMatureContent(projectForGate.user.email)) {
    console.warn(`[adult-bypass] ${projectForGate.user.email} bypassed mature gate on /api/scene-images/${sceneImageId}/retry (NODE_ENV=${process.env.NODE_ENV})`);
  }

  if (!img.prompt) {
    return validationError("Ce panel n'a pas de prompt à régénérer.");
  }

  const metadata = ((img.metadata ?? {}) as unknown) as Record<string, unknown>;

  // BUG-14 : on supporte désormais POST avec body JSON { mode, overrides, … } en plus
  // du query string ?mode=X. Les deux cohabitent pendant la transition ; si le body
  // fournit une valeur, elle l'emporte sur la query string.
  const retryBody = await readRetryBody(req);
  const urlParams = new URL(req.url).searchParams;
  const retryMode = (retryBody.mode ?? (urlParams.get("mode") as RetryMode | null)) ?? null;
  const premiumSize = resolvePremiumImageSize("PANEL_DRAFT", {
    width: img.width,
    height: img.height,
  });
  const characters = Array.isArray(metadata.characters) ? (metadata.characters as string[]) : [];
  const savedReferenceIds = Array.isArray(img.referenceImageIds) ? (img.referenceImageIds as string[]) : [];

  const panelCastData = (img.panelCast ?? metadata.panelCast) as {
    focus?: { characterId: string; name: string } | null;
    supporting?: Array<{ characterId: string; name: string }>;
  } | null;

  // Reconstruire les LoRAs actifs du projet pour ce panel
  const loraAttachments = await prisma.loraAttachment.findMany({
    where: { projectId, enabled: true },
    include: { lora: true },
  });
  const loraByCharId = new Map<string, { url: string; triggerWord: string; scale: number }>();
  for (const att of loraAttachments) {
    const meta = att.lora.weightsMeta as Record<string, unknown>;
    const loraUrl = typeof meta.loraUrl === "string" ? meta.loraUrl : null;
    const triggerWord = typeof meta.triggerWord === "string" ? meta.triggerWord : att.lora.name;
    if (loraUrl && att.characterId && att.lora.status === "active") {
      loraByCharId.set(att.characterId, { url: loraUrl, triggerWord, scale: att.weight });
    }
  }
  // P1.3 : on enrichit le SELECT pour alimenter buildCharacterRetryHints avec
  // tout le physique dur (bodyState, wardrobeProfile, outfitDefault, scars…),
  // pas juste le characterFingerprint. Sinon les rerolls perso perdent en
  // fidélité corporelle à chaque passe.
  const projectChars = await prisma.character.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      characterFingerprint: true,
      appearance: true,
      hairColor: true,
      eyeColor: true,
      outfitDefault: true,
      visualProfile: true,
      bodyState: true,
      wardrobeProfile: true,
      stableVisualDNA: true,
    },
  });

  // P0.5 : `characterIds` injecté par narrative-pass (P1.4) dans metadata.
  // Sur les panels legacy, l'array peut être absent → on dégrade vers panelCast/name.
  const metadataCharacterIds = Array.isArray((metadata as Record<string, unknown>).characterIds)
    ? ((metadata as Record<string, unknown>).characterIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  // P5.1 : indexation + resolver factorisés dans `lib/retry/resolve-project-characters.ts`.
  // Policy inchangée : ID d'abord (focus → supporting → metadata), nom en dernier recours.
  const {
    projectCharsById,
    resolveCharacterFromName,
  } = createProjectCharacterResolver({
    projectChars,
    panelCastData,
    metadataCharacterIds,
  });

  // P2.3 : l'ordre `focus → supporting[]` garantit qu'en cas de cap, les
  // LoRA critiques (hero focus, antagonist principal) sont pris avant les
  // supports secondaires. Le plafond reste configurable via env
  // `RETRY_MAX_PANEL_LORAS` (default 2 : limite fal IP-Adapter actuelle).
  const maxPanelLoras = Math.max(
    1,
    Number.parseInt(process.env.RETRY_MAX_PANEL_LORAS ?? "", 10) || 2,
  );
  const castOrderedNames = panelCastData
    ? [panelCastData.focus?.name, ...(panelCastData.supporting ?? []).map((m) => m.name)].filter((n): n is string => Boolean(n))
    : characters;
  const loraSourceNames = castOrderedNames.length > 0 ? castOrderedNames : characters;
  const panelLoras = loraSourceNames
    .map((name) => {
      const res = resolveCharacterFromName(name);
      if (!res) {
        console.warn(`[retry:resolution] name="${name}" resolved_by=miss panel=${img.id}`);
        return undefined;
      }
      console.info(`[retry:resolution] name="${name}" resolved_by=${res.resolvedBy} id=${res.character.id}`);
      return loraByCharId.get(res.character.id);
    })
    .filter((l): l is { url: string; triggerWord: string; scale: number } => Boolean(l))
    .slice(0, maxPanelLoras);

  // P0.5 : IDs résolus des personnages présents dans ce panel (pour les filtres
  // qui prenaient `characters.includes(pc.name)` → on bascule vers ID).
  const resolvedPanelCharacterIds = new Set<string>();
  for (const name of characters) {
    const res = resolveCharacterFromName(name);
    if (res) resolvedPanelCharacterIds.add(res.character.id);
  }
  for (const id of metadataCharacterIds) {
    if (projectCharsById.has(id)) resolvedPanelCharacterIds.add(id);
  }
  if (panelCastData?.focus?.characterId) {
    resolvedPanelCharacterIds.add(panelCastData.focus.characterId);
  }
  for (const s of panelCastData?.supporting ?? []) {
    if (s?.characterId) resolvedPanelCharacterIds.add(s.characterId);
  }

  const retryStableReferences = collectRetryStableReferences({
    metadata,
    savedReferenceIds,
  });
  const retryReferenceResolution = await resolveStableImageReferences(retryStableReferences, {
    logPrefix: "[retry:refs]",
  });
  const referenceImageUrls = retryReferenceResolution.urls;

  const hasCanonRef = referenceImageUrls.length > 0 || panelLoras.length > 0;

  // Analyse de drift pré-reroll pour informer la politique de référence
  // P0.5 : on filtre par ID résolu plutôt que par nom brut.
  const driftCharacters = projectChars
    .filter((pc) => resolvedPanelCharacterIds.has(pc.id))
    .map((pc) => {
      const fp = (pc.characterFingerprint as Record<string, unknown> | null) ?? {};
      return {
        name: pc.name,
        gender: typeof fp.gender === "string" ? fp.gender : null,
        hairColor: typeof fp.hairColor === "string" ? fp.hairColor : null,
        eyeColor: typeof fp.eyeColor === "string" ? fp.eyeColor : null,
        bodyDetails: typeof fp.bodyDetails === "string" ? fp.bodyDetails : null,
        appearance: typeof fp.appearance === "string" ? fp.appearance : null,
        canonicalReferenceAvailable: hasCanonRef,
      };
    });

  // Lire les flags premium depuis la metadata persistée
  const hasLookProfile = typeof metadata.chapterLookProfileMode === "string";
  const hasFingerprint = driftCharacters.some((c) => {
    const res = resolveCharacterFromName(c.name);
    const char = res?.character;
    return char?.characterFingerprint && typeof char.characterFingerprint === "object" && Object.keys(char.characterFingerprint).length > 0;
  });
  const hasSceneAnchor = metadata.sceneAnchor != null && typeof metadata.sceneAnchor === "object";

  // Enrichir les characters avec hardTraits/softTraits depuis le fingerprint
  const driftCharactersEnriched = driftCharacters.map((dc) => {
    const char = resolveCharacterFromName(dc.name)?.character;
    const fp = char?.characterFingerprint && typeof char.characterFingerprint === "object"
      ? char.characterFingerprint as Record<string, unknown>
      : null;
    return {
      ...dc,
      hardTraits: Array.isArray(fp?.hardTraits)
        ? (fp!.hardTraits as string[]).filter((t): t is string => typeof t === "string")
        : null,
      softTraits: Array.isArray(fp?.softTraits)
        ? (fp!.softTraits as string[]).filter((t): t is string => typeof t === "string")
        : null,
    };
  });

  // Résoudre le chapterLookProfile depuis la metadata
  const { resolveChapterLookProfile } = await import("@manga-ai-studio/core");
  const lookProfileMode = typeof metadata.chapterLookProfileMode === "string"
    ? metadata.chapterLookProfileMode as Parameters<typeof resolveChapterLookProfile>[0]
    : null;
  const retryLookProfile = lookProfileMode ? resolveChapterLookProfile(lookProfileMode) : null;
  const retryIntentCard = metadata.intentCard as Parameters<typeof detectVisualDrift>[0]["intentCard"] | undefined;
  const retrySceneAnchor = metadata.sceneAnchor as Parameters<typeof detectVisualDrift>[0]["sceneAnchor"] | undefined;

  const preDriftResult = driftCharactersEnriched.length > 0
    ? detectVisualDrift({
        prompt: img.prompt ?? "",
        characters: driftCharactersEnriched,
        usedLoras: panelLoras.length > 0,
        usedRefs: referenceImageUrls.length > 0,
        panelCategory: typeof metadata.panelCategory === "string" ? metadata.panelCategory : null,
        beatEventType: (retryIntentCard as { beatEventType?: string } | undefined)?.beatEventType
          ?? (typeof metadata.beatEventType === "string" ? metadata.beatEventType : null),
        chapterLookProfile: retryLookProfile,
        sceneAnchor: retrySceneAnchor ?? null,
        intentCard: retryIntentCard ?? null,
      })
    : null;

  // Détecter si le panel a des props obligatoires (ne jamais les relâcher)
  const panelContractMeta = metadata.panelContract as Record<string, unknown> | undefined;
  const requiredPropsTyped = Array.isArray(panelContractMeta?.requiredPropsTyped)
    ? panelContractMeta.requiredPropsTyped as Array<{ mustBeVisible: boolean }>
    : [];
  const hasMandatoryProps = requiredPropsTyped.some((p) => p.mustBeVisible);

  const retryReferenceDecision = resolveRetryReferencePolicy({
    retryMode,
    metadata,
    hasReusableCharacterLock: hasCanonRef,
    recommendedAction: preDriftResult?.recommendedAction ?? null,
    hasLookProfile,
    hasFingerprint,
    hasSceneAnchor,
    hasMandatoryProps,
  });

  // Si le drift pré-reroll recommande un character_reroll mais que le mode est environment,
  // on force au moins LIGHT pour préserver le personnage
  const effectiveReferencePolicy = (() => {
    const base = retryReferenceDecision.referencePolicy;
    if (
      preDriftResult?.recommendedAction === "character_reroll" &&
      (retryMode === "environment" || retryMode === "composition") &&
      base === "NONE" &&
      hasCanonRef
    ) {
      return "LIGHT" as const;
    }
    return base;
  })();

  const chapterId = img.scene.chapter.id;
  const chapterOutlineRecord = ((img.scene.chapter as unknown as Record<string, unknown>).outline ?? {}) as Record<string, unknown>;
  const approvedOutlineRecord = (chapterOutlineRecord.approvedOutline ?? {}) as Record<string, unknown>;
  const approvedOutlineVersion = typeof approvedOutlineRecord.version === "number"
    ? approvedOutlineRecord.version
    : typeof approvedOutlineRecord.version === "string"
      ? approvedOutlineRecord.version
      : null;
  const studioData = ((chapterOutlineRecord.studio ?? {}) as Record<string, unknown>).data as Record<string, unknown> | undefined;
  const productionOutlineBeats = Array.isArray(studioData?.productionOutline && (studioData.productionOutline as Record<string, unknown>).beats)
    ? ((studioData!.productionOutline as Record<string, unknown>).beats as unknown[]).length
    : null;
  const productionPlanPages = Array.isArray(studioData?.productionPlan && (studioData.productionPlan as Record<string, unknown>).pages)
    ? ((studioData!.productionPlan as Record<string, unknown>).pages as unknown[]).length
    : null;
  const panelBlueprintCount = Array.isArray(studioData?.productionPlan && (studioData.productionPlan as Record<string, unknown>).panelBlueprints)
    ? ((studioData!.productionPlan as Record<string, unknown>).panelBlueprints as unknown[]).length
    : null;
  const premiumReadinessScore = typeof (studioData?.productionPlan as Record<string, unknown> | undefined)?.premiumReadinessScore === "number"
    ? (studioData!.productionPlan as Record<string, unknown>).premiumReadinessScore
    : null;

  // Build character-specific retry hints from panelCast + fingerprints
  const targetCharacterId = retryBody.targetCharacterId ?? urlParams.get("targetCharacterId");

  function buildCharacterRetryHints(): { positive: string; negative: string } {
    // P0.5 : résolution strictement par ID (target user OU focus), fallback
    // par nom uniquement en dernier recours.
    const target = targetCharacterId
      ? projectCharsById.get(targetCharacterId)
      : panelCastData?.focus?.characterId
        ? projectCharsById.get(panelCastData.focus.characterId)
        : (() => {
            for (const id of metadataCharacterIds) {
              const c = projectCharsById.get(id);
              if (c) return c;
            }
            for (const name of characters) {
              const c = resolveCharacterFromName(name)?.character;
              if (c) return c;
            }
            return undefined;
          })();

    // P1.3 : délégué au helper partagé qui protège aussi bodyState /
    // wardrobeProfile / outfitDefault / forbiddenVisualDrift, pas juste
    // hair+eye+appearance.
    return buildCharacterRetryHintsShared(target ?? null);
  }

  const characterHints = retryMode === "character" ? buildCharacterRetryHints() : null;

  // P4.2 : pour les retry "environment" ou "composition", on demande les marqueurs
  // décor au helper partagé (`lib/retry/build-location-markers.ts`). Un reroll
  // environnement doit conserver l'identité visuelle du lieu ; pas seulement
  // "strong background".
  const locationMarkersLine = (retryMode === "environment" || retryMode === "composition")
    ? await buildLocationMarkersLine({ prisma, locationId: img.scene.locationId })
    : "";

  const legacyPositiveAugment = retryMode === "environment"
    ? ["readable environment, strong background, visible architecture, clear foreground midground background", locationMarkersLine].filter(Boolean).join(", ")
    : retryMode === "character"
      ? characterHints!.positive
      : retryMode === "interaction"
        ? "clear body language, readable interaction, characters connected to environment"
        : retryMode === "style"
          ? "consistent manga style, clean line art, coherent shading"
          : retryMode === "composition"
            ? ["balanced manga composition, spatial clarity, dynamic framing", locationMarkersLine].filter(Boolean).join(", ")
            : "";
  const legacyNegativeAugment = retryMode === "environment"
    ? "empty background, studio backdrop, flat grey backdrop, blurry environment"
    : retryMode === "character"
      ? characterHints!.negative
      : retryMode === "interaction"
        ? "weak social interaction, disconnected characters"
        : retryMode === "style"
          ? "style drift, muddy rendering, off-model manga style"
          : retryMode === "composition"
            ? "floating character, poor framing, weak staging"
            : "";

  // Premium specialized hints override legacy hints when available
  const basePositiveAugment = retryReferenceDecision.positivePromptHint
    ? retryReferenceDecision.positivePromptHint
    : legacyPositiveAugment;
  const baseNegativeAugment = retryReferenceDecision.negativePromptHint
    ? retryReferenceDecision.negativePromptHint
    : legacyNegativeAugment;

  // BUG-13 : injection du texte libre utilisateur (tronqué pour éviter les abus).
  // Ex. body.userPromptAdditions = "l'ennemi tient le pendentif, regarde à gauche"
  //     body.userPromptExclusions = "pas de sang, pas de foule"
  const userPositive = typeof retryBody.userPromptAdditions === "string"
    ? retryBody.userPromptAdditions.slice(0, 400).trim()
    : "";
  const userNegative = typeof retryBody.userPromptExclusions === "string"
    ? retryBody.userPromptExclusions.slice(0, 200).trim()
    : "";
  const positiveAugment = [basePositiveAugment, userPositive].filter(Boolean).join(", ");
  const negativeAugment = [baseNegativeAugment, userNegative].filter(Boolean).join(", ");

  const referencePolicy = effectiveReferencePolicy;
  const rerollKind =
    retryMode === "environment"
      ? "REROLL_ENVIRONMENT"
      : retryMode === "character"
        ? "REROLL_CHARACTER_FIDELITY"
        : retryMode === "interaction"
          ? "REROLL_INTERACTION"
          : retryMode === "style"
            ? "REROLL_STYLE"
            : retryMode === "composition"
              ? "REROLL_COMPOSITION"
              // Premium modes
              : retryMode === "prop"
                ? "REROLL_PROP"
                : retryMode === "speaker"
                  ? "REROLL_SPEAKER_ANCHOR"
                  : retryMode === "enemy_presence"
                    ? "REROLL_ENEMY_PRESENCE"
                    : retryMode === "subject_focus"
                      ? "REROLL_SUBJECT_FOCUS"
                      : retryMode === "cutaway"
                        ? "REROLL_CUTAWAY"
                        : retryMode === "npc_population"
                          ? "REROLL_NPC_POPULATION"
                          : undefined;

  console.info(
    `[retry] chapterId=${chapterId} approvedOutlineVersion=${approvedOutlineVersion ?? "n/a"} ` +
    `productionOutlineBeatCount=${productionOutlineBeats ?? "n/a"} productionPlanPageCount=${productionPlanPages ?? "n/a"} ` +
    `panelBlueprintCount=${panelBlueprintCount ?? "n/a"} premiumReadinessScore=${premiumReadinessScore ?? "n/a"} ` +
    `panel=${img.id} mode=${retryMode ?? "default"} rerollKind=${rerollKind ?? "n/a"} ` +
    `refPolicy=${effectiveReferencePolicy} (base=${retryReferenceDecision.referencePolicy}) ` +
    `importantCharacter=${retryReferenceDecision.importantCharacterPresent} reason=${retryReferenceDecision.reason} ` +
    `refs=${referenceImageUrls.length}/${retryStableReferences.length} loras=${panelLoras.length} ` +
    `driftAction=${preDriftResult?.recommendedAction ?? "n/a"} driftScore=${preDriftResult?.score ?? "n/a"} ` +
    `positivePromptHint=${retryReferenceDecision.positivePromptHint ? "yes" : "no"} ` +
    `negativePromptHint=${retryReferenceDecision.negativePromptHint ? "yes" : "no"}`
  );

  // BUG-13 : persister le userOverride dans metadata pour que les rerolls futurs
  // (auto ou manuels) conservent l'intention utilisateur même si le pipeline se relance.
  const hasUserOverride =
    Boolean(userPositive) ||
    Boolean(userNegative) ||
    Object.keys(retryBody.forceOverrides ?? {}).length > 0;
  const previousUserOverride = (metadata.userOverride as Record<string, unknown> | undefined) ?? null;
  const nextUserOverride = hasUserOverride
    ? {
        ...(previousUserOverride ?? {}),
        userPromptAdditions: userPositive || previousUserOverride?.userPromptAdditions || null,
        userPromptExclusions: userNegative || previousUserOverride?.userPromptExclusions || null,
        forceOverrides: {
          ...((previousUserOverride?.forceOverrides as Record<string, unknown> | undefined) ?? {}),
          ...(retryBody.forceOverrides ?? {}),
        },
        updatedAt: new Date().toISOString(),
      }
    : previousUserOverride;

  await prisma.sceneImage.update({
    where: { id: img.id },
    data: {
      status: "pending",
      metadata: ({
        ...metadata,
        retryRequestedAt: new Date().toISOString(),
        ...(nextUserOverride ? { userOverride: nextUserOverride } : {}),
      } as unknown) as Prisma.InputJsonValue,
    },
  });

  try {
    // Reconstruire un RoutingContext fidèle depuis la metadata persistée :
    // subjectFocus, shotType, cameraAngle, heroPresent, panelCategoryHints (via panelDebugTrace).
    // Sans ça, le retry routait "à l'aveugle" et perdait tout le ciblage NPC/env/prop.
    const panelContractMeta = (metadata.panelContract as Record<string, unknown> | undefined) ?? {};
    const shotPlanMeta = ((metadata.panelDebugTrace as Record<string, unknown> | undefined)?.shotPlan ?? {}) as Record<string, unknown>;
    // BUG-13 : forceOverrides du body supersèdent les valeurs reconstruites du contract.
    // L'utilisateur peut ainsi dire "régénère cette case mais en wide + environment".
    const forceOverrides = retryBody.forceOverrides ?? {};
    const retrySubjectFocus =
      forceOverrides.subjectFocus
      ?? (panelContractMeta.subjectFocus as string | null | undefined)
      ?? (shotPlanMeta.planned as Record<string, unknown> | undefined)?.subjectFocus as string | null | undefined
      ?? null;
    const retryShotType =
      forceOverrides.shotType
      ?? (panelContractMeta.shotType as string | null | undefined)
      ?? (shotPlanMeta.shotType as string | null | undefined)
      ?? null;
    const retryCameraAngle =
      forceOverrides.cameraAngle
      ?? (panelContractMeta.cameraAngle as string | null | undefined)
      ?? (shotPlanMeta.cameraAngle as string | null | undefined)
      ?? null;
    const retryPurpose = (panelContractMeta.purpose as string | null | undefined) ?? null;
    const heroPresentRetry = castOrderedNames.some((n) => {
      const c = resolveCharacterFromName(n)?.character;
      // fallback : si tier indisponible, on considère hero=true seulement si focus=hero
      return c != null;
    }) && (retrySubjectFocus === "hero" || !retrySubjectFocus);

    const out = await runRoutedImageGeneration(
      {
        mode: "PANEL_DRAFT",
        contentIntensityLayer: intensityLayer,
        adultEngine,
        isNewCharacter: false,
        hasCanonReferences: hasCanonRef,
        characterCountInScene: characters.length > 0 ? characters.length : 1,
        heroPresent: heroPresentRetry,
        heroFocus: retrySubjectFocus === "hero" && (retryShotType === "closeup" || retryShotType === "extreme_closeup"),
        shotType: (retryShotType as "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder" | undefined) ?? undefined,
        cameraAngle: retryCameraAngle ?? undefined,
        purpose: retryPurpose ?? undefined,
        subjectFocus: retrySubjectFocus as "hero" | "npc" | "important_npc" | "enemy" | "antagonist" | "environment" | "group" | "prop" | "reaction" | "aftermath" | null | undefined,
        needsInpaint: false,
        needsPoseVariation: false,
        preferPhotorealCover: false,
        explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
        goreStylizedMature: false,
      },
      {
        mode: "PANEL_DRAFT",
        positivePrompt: [img.prompt, positiveAugment].filter(Boolean).join(", "),
        negativePrompt: [img.negativePrompt ?? undefined, negativeAugment].filter(Boolean).join(", "),
        width: premiumSize.width,
        height: premiumSize.height,
        loras: referencePolicy === "NONE" ? undefined : (panelLoras.length > 0 ? panelLoras : undefined),
        referenceImageUrls: referencePolicy === "NONE" ? undefined : (referenceImageUrls.length > 0 ? referenceImageUrls : undefined),
        providerParams: {
          contentIntensityLayer: intensityLayer,
          mode: "PANEL_DRAFT",
          referencePolicy,
          scenePass: "reroll",
          rerollKind,
          retryReferenceDecision,
        },
      },
    );

    if (!out.ok) {
      await prisma.sceneImage.update({
        where: { id: img.id },
        data: {
          status: "blocked",
          metadata: ({
            ...metadata,
            blockedReason: out.reason,
            generationLog: out.log,
            retryReferenceDecision: {
              ...retryReferenceDecision,
              availableReferenceUrls: referenceImageUrls.length,
              availableLoras: panelLoras.length,
            },
            retryReferenceTrace: retryReferenceResolution.trace,
          } as unknown) as Prisma.InputJsonValue,
        },
      });
      return validationError(out.reason);
    }

    const persisted = await persistGeneratedImageIfNeeded({
      imageUrl: out.result.imageUrl,
      objectPath: `projects/${project.id}/chapters/${img.scene.chapter.id}/panels/${img.id}-retry-${Date.now()}`,
    });

    if (!persisted.ok) {
      await prisma.sceneImage.update({
        where: { id: img.id },
        data: {
          status: "failed",
          metadata: ({
            ...metadata,
            error: persisted.error,
            generationLog: out.log,
            retryReferenceDecision: {
              ...retryReferenceDecision,
              availableReferenceUrls: referenceImageUrls.length,
              availableLoras: panelLoras.length,
            },
            retryReferenceTrace: retryReferenceResolution.trace,
          } as unknown) as Prisma.InputJsonValue,
        },
      });
      return NextResponse.json({ ok: false, error: persisted.error }, { status: 502 });
    }

    // P0.3 : refuser d'écrire en DB une URL qui ne serait pas stable (token signé
    // ou host provider temporaire). Exception : `persisted.persisted === false`
    // indique que l'URL source était déjà stable (ex: mode "temporary" désactivé,
    // réutilisation Supabase).
    assertStableImageUrl(persisted.url, "scene-images:retry:persisted.url");

    // ── Validation post-génération avec CharacterFingerprint (Bloc 2) ─────────
    const charactersWithFingerprints = characters
      .map((charName) => {
        const char = resolveCharacterFromName(charName)?.character;
        if (!char) return null;

        const fingerprintRaw = char.characterFingerprint;
        if (!fingerprintRaw || typeof fingerprintRaw !== "object" || Object.keys(fingerprintRaw).length === 0) {
          return null;
        }

        return {
          characterId: char.id,
          characterName: char.name,
          fingerprint: fingerprintRaw as never,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const validation = await validateGeneratedPanel({
      panelId: img.id,
      imageUrl: persisted.url,
      requiredCharacters: charactersWithFingerprints,
      metadata: {
        prompt: img.prompt,
        negativePrompt: img.negativePrompt ?? undefined,
        model: out.result.model,
        sceneBlueprint: metadata.sceneBlueprint as never,
        panelContract: metadata.panelContract as never,
        stylePack: metadata.stylePack as never,
        panelQa: {
          heroCharacterId: typeof metadata.heroCharacterId === "string" ? metadata.heroCharacterId : null,
          pageNumber: typeof metadata.pageNumber === "number" ? metadata.pageNumber : null,
          panelNumber: typeof metadata.panelNumber === "number" ? metadata.panelNumber : img.panelNumber,
          pagePanelCount: typeof metadata.pagePanelCount === "number" ? metadata.pagePanelCount : null,
          panelCategory: typeof metadata.panelCategory === "string" ? metadata.panelCategory : null,
          visualPriority: typeof metadata.visualPriority === "string" ? metadata.visualPriority : null,
          characterRoles: Array.isArray(metadata.panelCharacterRoles)
            ? (metadata.panelCharacterRoles as Array<string | null>)
            : [],
          characterIds: Array.isArray(metadata.characterIds) ? (metadata.characterIds as string[]) : [],
          explicitCriticality:
            metadata.panelCriticality && typeof metadata.panelCriticality === "object"
              ? (metadata.panelCriticality as { level: "NON_CRITICAL" | "CRITICAL"; reasons: string[] })
              : null,
        },
      },
    });
    const validationScore = validation.score;

    if (validation.requiredReroll) {
      console.warn(
        `[retry] Validation failed for panel ${img.id}: score=${validation.score.toFixed(2)}, issues=${validation.issues.length}. Manual review required.`
      );
      // On évite une boucle infinie sur retry manuel, mais on expose désormais
      // les sous-scores pour diagnostiquer décor / interaction / style.
    }

    const shouldBlockForReview = validation.requiredReroll || (validation.qaWasRequired && !validation.qaWasExecuted);

    await prisma.sceneImage.update({
      where: { id: img.id },
      data: {
        status: shouldBlockForReview ? "blocked" : "completed",
        imageUrl: persisted.url,
        provider: out.result.provider,
        model: out.result.model,
        consistencyScore: validation.qualityScores?.releaseScore ?? validationScore,
        routingDecision: (out.routing as unknown) as Prisma.InputJsonValue,
        metadata: ({
          ...metadata,
          previousImageUrl:
            typeof img.imageUrl === "string" && img.imageUrl.length > 0
              ? img.imageUrl
              : typeof metadata.previousImageUrl === "string"
                ? metadata.previousImageUrl
                : null,
          rerollHistory: [
            ...((Array.isArray(metadata.rerollHistory) ? metadata.rerollHistory : []) as unknown[]),
            {
              at: new Date().toISOString(),
              previousImageUrl: typeof img.imageUrl === "string" ? img.imageUrl : null,
              nextImageUrl: persisted.url,
              mode: retryMode,
            },
          ].slice(-5),
          generationLog: out.log,
          seed: out.result.seed ?? null,
          persisted: persisted.persisted,
          retryUsedLoras: panelLoras.length,
          retryUsedRefs: referenceImageUrls.length,
          rerollKind,
          positivePromptHint: retryReferenceDecision.positivePromptHint ?? null,
          negativePromptHint: retryReferenceDecision.negativePromptHint ?? null,
          retryReferenceDecision: {
            ...retryReferenceDecision,
            availableReferenceUrls: referenceImageUrls.length,
            availableLoras: panelLoras.length,
            appliedReferencePolicy: referencePolicy,
            driftOverrideApplied: effectiveReferencePolicy !== retryReferenceDecision.referencePolicy,
          },
          retryReferenceTrace: retryReferenceResolution.trace,
          preDriftAnalysis: preDriftResult
            ? {
                score: preDriftResult.score,
                severity: preDriftResult.severity,
                recommendedAction: preDriftResult.recommendedAction,
                continuityRisk: preDriftResult.continuityRisk,
                reasons: preDriftResult.reasons.slice(0, 4),
                // Phase 8 : sous-scores drift 2.0
                styleDriftScore: preDriftResult.styleDriftScore,
                characterDriftScore: preDriftResult.characterDriftScore,
                beatAlignmentScore: preDriftResult.beatAlignmentScore,
                sceneContinuityScore: preDriftResult.sceneContinuityScore,
                chapterLookMismatch: preDriftResult.chapterLookMismatch,
              }
            : null,
          validationScore,
          validationDetails: {
            panelCriticality: validation.panelCriticality,
            qualityScores: validation.qualityScores,
            propertyChecks: validation.propertyChecks,
            issues: validation.issues,
            requiredReroll: validation.requiredReroll,
            qaWasRequired: validation.qaWasRequired,
            qaWasExecuted: validation.qaWasExecuted,
            qaFailureReason: validation.qaFailureReason,
            qaBypassReason: validation.qaBypassReason,
          },
          panelCriticality: validation.panelCriticality,
          qaWasRequired: validation.qaWasRequired,
          qaWasExecuted: validation.qaWasExecuted,
          qaFailureReason: validation.qaFailureReason,
          qaBypassReason: validation.qaBypassReason,
          criticalQaBlocked: shouldBlockForReview,
        } as unknown) as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "retry_failed";
    await prisma.sceneImage.update({
      where: { id: img.id },
      data: {
        status: "failed",
        metadata: ({
          ...metadata,
          error: msg,
          retryReferenceDecision: {
            ...retryReferenceDecision,
            availableReferenceUrls: referenceImageUrls.length,
            availableLoras: panelLoras.length,
          },
          retryReferenceTrace: retryReferenceResolution.trace,
        } as unknown) as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
