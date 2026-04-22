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
import { readShotPlanEnumsFromJson } from "@manga-ai-studio/core";
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
import { extractCriticalPropsFromPanelContractMeta } from "@/lib/retry/extract-critical-props";
import { resolvePanelLoras } from "@/lib/retry/resolve-panel-loras";
import { buildRetryPrompts, resolveRerollKind, sanitizeUserPromptInput } from "@/lib/retry/build-retry-prompts";
import {
  persistRetryBlocked,
  persistRetryPersistFailed,
  persistRetryException,
  persistRetrySuccess,
} from "@/lib/retry/persist-retry-outcome";
import {
  resolveRetryPacketBase,
  resolveEffectiveRetryOverrides,
  buildPacketAwareRetryPrompt,
  retryBodySchema,
  type RetryBodyParsed,
} from "@/lib/retry/retry-packet-resolver";
import {
  resolveStableImageReferences,
  evaluatePromptLanguage,
} from "@manga-ai-studio/workflow";

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
  // P0.3 — validation Zod stricte. Un body mal formé retourne 422 au lieu d'un 500.
  const rawRetryBody = await readRetryBody(req);
  const parsedBody = retryBodySchema.safeParse(rawRetryBody);
  if (!parsedBody.success) {
    return validationError(
      "Body invalide: " + parsedBody.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", "),
    );
  }
  const retryBodyParsed: RetryBodyParsed = parsedBody.data;

  // AUDIT COMMIT 5 — sanitisation des user overrides. Le parsing Zod plafonne
  // déjà la longueur, mais on ajoute le nettoyage lexical (sauts de ligne,
  // ponctuations répétées, double espaces) pour éviter les injections
  // décoratives qui polluent le prompt final.
  const sanitizedUserPromptAdditions =
    retryBodyParsed.userPromptAdditions === undefined
      ? undefined
      : retryBodyParsed.userPromptAdditions === null
        ? null
        : sanitizeUserPromptInput(retryBodyParsed.userPromptAdditions, 400) || null;
  const sanitizedUserPromptExclusions =
    retryBodyParsed.userPromptExclusions === undefined
      ? undefined
      : retryBodyParsed.userPromptExclusions === null
        ? null
        : sanitizeUserPromptInput(retryBodyParsed.userPromptExclusions, 200) || null;

  // AUDIT COMMIT 5 — guard strict : aucun retry possible sans canonicalPacket
  // exploitable. Avant, on retombait implicitement sur `sceneImage.prompt`
  // legacy, ce qui reproduisait la pollution du premier rendu.
  const rawCanonicalPacket = (metadata as Record<string, unknown>).canonicalPacket;
  const hasUsableCanonicalPacket =
    rawCanonicalPacket != null
    && typeof rawCanonicalPacket === "object"
    && "finalEnglishStructuredPrompt" in rawCanonicalPacket
    && typeof (rawCanonicalPacket as { finalEnglishStructuredPrompt?: unknown }).finalEnglishStructuredPrompt === "string"
    && ((rawCanonicalPacket as { finalEnglishStructuredPrompt: string }).finalEnglishStructuredPrompt).trim().length > 0;
  if (!hasUsableCanonicalPacket) {
    console.error(
      `[retry] missing_canonical_packet sceneImageId=${sceneImageId} ` +
      `chapterId=${img.scene.chapter.id} — retry refusé pour éviter un fallback legacy sale.`,
    );
    return NextResponse.json(
      {
        error: "Ce panel n'a pas de canonicalPacket exploitable pour un retry fiable.",
        code: "MISSING_CANONICAL_PACKET",
      },
      { status: 422 },
    );
  }

  // Back-compat avec l'ancien RetryBody : on construit un objet au shape legacy
  // pour les consumers qui dépendent encore des chaînes/undefined.
  const retryBody: RetryBody = {
    mode: retryBodyParsed.mode as RetryMode | undefined,
    targetCharacterId: retryBodyParsed.targetCharacterId,
    userPromptAdditions:
      sanitizedUserPromptAdditions === null
        ? undefined
        : sanitizedUserPromptAdditions ?? undefined,
    userPromptExclusions:
      sanitizedUserPromptExclusions === null
        ? undefined
        : sanitizedUserPromptExclusions ?? undefined,
    forceOverrides: (retryBodyParsed.forceOverrides ?? undefined) as RetryBody["forceOverrides"],
  };
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

  // P2.3 + P5.1 : délégué au helper `resolvePanelLoras` — ordre focus → supporting,
  // plafond via env RETRY_MAX_PANEL_LORAS, logging conservé identique.
  const { panelLoras, castOrderedNames } = await resolvePanelLoras({
    prisma,
    projectId,
    characters,
    panelCastData,
    resolveCharacterFromName,
    panelId: img.id,
  });

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

  // P0.3 — Déterminer si des refs scène ou style sont disponibles
  // pour ne pas partir en NONE sur les rerolls environment/composition.
  const hasSceneReferences = retryStableReferences.some(
    (ref) => ref.sourceType === "scene_keyframe" || ref.sourceType === "media_asset"
  );
  const hasStyleReferences = panelLoras.length > 0 || referenceImageUrls.length > 0;

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

  // P1.4 : détection props critiques déléguée à un helper testable qui
  // normalise le JSON metadata. `hasMandatoryProps` pilote directement la
  // reference policy et les retries ne doivent jamais relâcher un prop
  // `mustBeVisible`.
  const panelContractMeta = metadata.panelContract as Record<string, unknown> | undefined;
  const criticalPropsExtraction = extractCriticalPropsFromPanelContractMeta(panelContractMeta);
  const hasMandatoryProps = criticalPropsExtraction.hasMandatoryProps;

  const retryReferenceDecision = resolveRetryReferencePolicy({
    retryMode,
    metadata,
    hasReusableCharacterLock: hasCanonRef,
    recommendedAction: preDriftResult?.recommendedAction ?? null,
    hasLookProfile,
    hasFingerprint,
    hasSceneAnchor,
    hasMandatoryProps,
    // P0.3 — Ne jamais partir en NONE sur les rerolls environment/composition
    // si des refs scène ou style sont disponibles.
    hasSceneReferences,
    hasStyleReferences,
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

  // P5.1 : composition positive/negative + user overrides centralisés
  // dans `buildRetryPrompts`. Contract inchangé : specialized > legacy > user.
  const { positiveAugment, negativeAugment, userPositive, userNegative } = buildRetryPrompts({
    retryMode,
    retryReferenceDecision,
    characterHints,
    locationMarkersLine,
    userPromptAdditions: retryBody.userPromptAdditions,
    userPromptExclusions: retryBody.userPromptExclusions,
  });

  const referencePolicy = effectiveReferencePolicy;
  const rerollKind = resolveRerollKind(retryMode);

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

  // BUG-13 + P0.3 : persister le userOverride avec fusion tri-état stricte.
  // Règle : undefined = preserve, null = clear, string = set.
  // L'ancien code faisait `userPositive || previousUserOverride || null`,
  // ce qui rendait impossible le clear d'un override persisté.
  const previousUserOverride = (metadata.userOverride as Record<string, unknown> | undefined) ?? null;
  const effectiveOverrides = resolveEffectiveRetryOverrides({
    previous: previousUserOverride
      ? {
          userPromptAdditions:
            typeof previousUserOverride.userPromptAdditions === "string"
              ? (previousUserOverride.userPromptAdditions as string)
              : null,
          userPromptExclusions:
            typeof previousUserOverride.userPromptExclusions === "string"
              ? (previousUserOverride.userPromptExclusions as string)
              : null,
          forceOverrides:
            (previousUserOverride.forceOverrides as Record<string, unknown> | undefined) ?? {},
        }
      : null,
    body: {
      // AUDIT COMMIT 5 — on utilise les valeurs sanitisées. Un champ absent
      // du body = undefined = preserve ; null = clear ; string = set.
      userPromptAdditions:
        sanitizedUserPromptAdditions !== undefined
          ? sanitizedUserPromptAdditions
          : userPositive
            ? userPositive
            : undefined,
      userPromptExclusions:
        sanitizedUserPromptExclusions !== undefined
          ? sanitizedUserPromptExclusions
          : userNegative
            ? userNegative
            : undefined,
      forceOverrides: retryBodyParsed.forceOverrides as Record<string, unknown> | null | undefined,
    },
  });
  const nextUserOverride = effectiveOverrides.persisted;

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
    // P1.2 (sprint 5) — Lecture + normalisation stricte des enums JSON.
    // Le fallback `panelContractMeta → shotPlanMeta.planned → shotPlanMeta`
    // est traité ici pour que chaque couche passe par les normaliseurs et
    // qu'aucune valeur non-canonique n'atteigne le routing.
    const contractEnums = readShotPlanEnumsFromJson(panelContractMeta, "retry-route/panelContract");
    const plannedMeta = (shotPlanMeta.planned as Record<string, unknown> | undefined) ?? {};
    const plannedEnums = readShotPlanEnumsFromJson(plannedMeta, "retry-route/shotPlan.planned");
    const shotPlanEnums = readShotPlanEnumsFromJson(shotPlanMeta, "retry-route/shotPlan");
    const retrySubjectFocus: string | null =
      (forceOverrides.subjectFocus as string | null | undefined)
      ?? contractEnums.subjectFocus
      ?? plannedEnums.subjectFocus
      ?? null;
    const retryShotType: string | null =
      (forceOverrides.shotType as string | null | undefined)
      ?? contractEnums.shotType
      ?? shotPlanEnums.shotType
      ?? plannedEnums.shotType
      ?? null;
    const retryCameraAngle: string | null =
      (forceOverrides.cameraAngle as string | null | undefined)
      ?? contractEnums.cameraAngle
      ?? shotPlanEnums.cameraAngle
      ?? plannedEnums.cameraAngle
      ?? null;
    const retryCutawayType: string | null =
      contractEnums.cutawayType
      ?? plannedEnums.cutawayType
      ?? shotPlanEnums.cutawayType
      ?? null;
    const retryPurpose = (panelContractMeta.purpose as string | null | undefined) ?? null;
    // P0.3 — packet-aware retry. Si un canonicalPacket existe dans metadata,
    // on repart de son prompt EN structuré + du negative canonique, et on
    // compose les augments par-dessus. Sinon fallback legacy `img.prompt`.
    const retryPacketBase = resolveRetryPacketBase({
      metadataCanonicalPacket: metadata.canonicalPacket ?? null,
      sceneImagePrompt: img.prompt,
      sceneImageNegativePrompt: img.negativePrompt ?? null,
    });
    const retryAttemptIndex =
      typeof metadata.retryAttemptIndex === "number" ? (metadata.retryAttemptIndex as number) : 0;
    const packetAwarePrompt = retryPacketBase.packet
      ? buildPacketAwareRetryPrompt({
          packet: retryPacketBase.packet,
          retryMode,
          attemptIndex: retryAttemptIndex,
          positiveAugment,
          negativeAugment,
          userPromptAdditions: effectiveOverrides.effectiveUserPromptAdditions,
          userPromptExclusions: effectiveOverrides.effectiveUserPromptExclusions,
        })
      : null;

    // AUDIT COMMIT 5 — si le plan de reroll packet-aware refuse l'exécution
    // (ex. MAX_RETRIES atteint), on bloque sans jamais envoyer au provider.
    if (packetAwarePrompt && packetAwarePrompt.allowed === false) {
      console.warn(
        `[retry] packet_reroll_blocked sceneImageId=${sceneImageId} reason=${packetAwarePrompt.reason} ` +
        `attempt=${retryAttemptIndex}`,
      );
      await persistRetryBlocked({
        prisma,
        panelId: img.id,
        baseMetadata: metadata,
        reason: packetAwarePrompt.reason,
        generationLog: null,
        retryReferenceDecision,
        retryReferenceTrace: retryReferenceResolution.trace,
        availableReferenceUrls: referenceImageUrls.length,
        availableLoras: panelLoras.length,
      });
      return validationError(packetAwarePrompt.reason);
    }

    // AUDIT COMMIT 5 — plus de fallback legacy : le packet canonique est
    // désormais obligatoire (guard tout en haut de la route). Le prompt final
    // vient toujours de `packetAwarePrompt`.
    const effectivePositivePrompt = packetAwarePrompt
      ? packetAwarePrompt.positivePrompt
      : [retryPacketBase.basePrompt, positiveAugment].filter(Boolean).join(", ");
    const effectiveNegativePrompt = packetAwarePrompt
      ? packetAwarePrompt.negativePrompt
      : [retryPacketBase.baseNegativePrompt || undefined, negativeAugment].filter(Boolean).join(", ");

    // AUDIT COMMIT 10 — log structuré unique pour observabilité retry.
    console.log(
      `[retry] source=${retryPacketBase.source} mode=${retryMode ?? "default"} ` +
      `packetVersion=${retryPacketBase.packetVersion ?? "none"} ` +
      `userAdditions=${userPositive.length} userExclusions=${userNegative.length} ` +
      `locationMarkers=${locationMarkersLine.length} ` +
      `referencePolicy=${effectiveReferencePolicy}`,
    );

    const heroPresentRetry = castOrderedNames.some((n) => {
      const c = resolveCharacterFromName(n)?.character;
      // fallback : si tier indisponible, on considère hero=true seulement si focus=hero
      return c != null;
    }) && (retrySubjectFocus === "hero" || !retrySubjectFocus);

    // P1.1 — garde linguistique runtime pour le retry : blocage strict si
    // plusieurs tokens FR subsistent, warning en trace sinon. Evite l'envoi
    // d'un prompt hybride FR/EN au provider.
    const retryLanguageCheck = evaluatePromptLanguage({
      positivePrompt: effectivePositivePrompt,
      negativePrompt: effectiveNegativePrompt,
    });
    const retryLanguageWarnings: string[] = [];
    if (retryLanguageCheck.outcome === "block") {
      console.error(
        `[retry] residual_french_blocked sceneImageId=${sceneImageId} tokens=${retryLanguageCheck.positiveTokens.join("|")}`,
      );
      return validationError(
        "Le prompt final contient du français résiduel, envoi provider refusé.",
        {
          positiveTokens: retryLanguageCheck.positiveTokens,
          negativeTokens: retryLanguageCheck.negativeTokens,
          strictMode:
            process.env.MANGA_PROMPT_LANGUAGE_GUARD_STRICT === "true"
            || process.env.MANGA_PROMPT_LANGUAGE_GUARD_STRICT === "1",
        },
      );
    }
    if (retryLanguageCheck.outcome === "warn") {
      retryLanguageWarnings.push(
        `residual_french_tokens(retry):${retryLanguageCheck.positiveTokens.join("|")}${retryLanguageCheck.negativeTokens.length > 0 ? ` neg:${retryLanguageCheck.negativeTokens.join("|")}` : ""}`,
      );
      console.warn(
        `[retry] residual_french_warn sceneImageId=${sceneImageId} tokens=${retryLanguageCheck.positiveTokens.join("|")}`,
      );
    }

    const out = await runRoutedImageGeneration(
      {
        mode: "PANEL_DRAFT",
        contentIntensityLayer: intensityLayer,
        adultEngine,
        isNewCharacter: false,
        hasCanonReferences: hasCanonRef,
        characterCountInScene: characters.length > 0 ? characters.length : 1,
        heroPresent: heroPresentRetry,
        // P1.2 (sprint 5) — heroFocus ne peut plus être vrai si un cutaway
        // non-héros est explicitement demandé (environment, prop, aftermath,
        // reaction, crowd...). fal-scene-strategy bloquera aussi le
        // CHARACTER_LOCK final via `cutawayForcesNonHero`.
        heroFocus:
          retrySubjectFocus === "hero"
          && (retryShotType === "closeup" || retryShotType === "extreme_closeup")
          && (retryCutawayType === null
            || retryCutawayType === "none"
            || retryCutawayType === "enemy"
            || retryCutawayType === "enemy_reveal"),
        shotType: (retryShotType as "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder" | undefined) ?? undefined,
        cameraAngle: retryCameraAngle ?? undefined,
        purpose: retryPurpose ?? undefined,
        subjectFocus: retrySubjectFocus as "hero" | "npc" | "important_npc" | "enemy" | "antagonist" | "environment" | "group" | "prop" | "reaction" | "aftermath" | null | undefined,
        cutawayType: retryCutawayType,
        needsInpaint: false,
        needsPoseVariation: false,
        preferPhotorealCover: false,
        explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
        goreStylizedMature: false,
      },
      {
        mode: "PANEL_DRAFT",
        positivePrompt: effectivePositivePrompt,
        negativePrompt: effectiveNegativePrompt,
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
      await persistRetryBlocked({
        prisma,
        panelId: img.id,
        baseMetadata: metadata,
        reason: out.reason,
        generationLog: out.log,
        retryReferenceDecision,
        retryReferenceTrace: retryReferenceResolution.trace,
        availableReferenceUrls: referenceImageUrls.length,
        availableLoras: panelLoras.length,
      });
      return validationError(out.reason);
    }

    const persisted = await persistGeneratedImageIfNeeded({
      imageUrl: out.result.imageUrl,
      objectPath: `projects/${project.id}/chapters/${img.scene.chapter.id}/panels/${img.id}-retry-${Date.now()}`,
    });

    if (!persisted.ok) {
      await persistRetryPersistFailed({
        prisma,
        panelId: img.id,
        baseMetadata: metadata,
        error: persisted.error,
        generationLog: out.log,
        retryReferenceDecision,
        retryReferenceTrace: retryReferenceResolution.trace,
        availableReferenceUrls: referenceImageUrls.length,
        availableLoras: panelLoras.length,
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
        // P0.4 — on envoie le prompt final réellement exécuté, pas `img.prompt` legacy
        prompt: effectivePositivePrompt,
        negativePrompt: effectiveNegativePrompt,
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

    await persistRetrySuccess({
      prisma,
      panelId: img.id,
      baseMetadata: metadata,
      previousImageUrl: typeof img.imageUrl === "string" && img.imageUrl.length > 0 ? img.imageUrl : null,
      persistedUrl: persisted.url,
      providerInfo: {
        provider: out.result.provider,
        model: out.result.model,
        seed: out.result.seed ?? null,
      },
      persistedFlag: persisted.persisted,
      routingDecision: (out.routing as unknown) as Prisma.InputJsonValue,
      validation: {
        requiredReroll: validation.requiredReroll,
        qaWasRequired: validation.qaWasRequired,
        qaWasExecuted: validation.qaWasExecuted,
        qaFailureReason: validation.qaFailureReason,
        qaBypassReason: validation.qaBypassReason,
        score: validationScore,
        panelCriticality: validation.panelCriticality,
        qualityScores: validation.qualityScores,
        propertyChecks: validation.propertyChecks,
        issues: validation.issues,
      },
      shouldBlockForReview,
      retryMode,
      retryUsedLoras: panelLoras.length,
      retryUsedRefs: referenceImageUrls.length,
      rerollKind,
      retryReferenceDecision,
      retryReferenceTrace: retryReferenceResolution.trace,
      effectiveReferencePolicy,
      preDriftResult: preDriftResult
        ? {
            score: preDriftResult.score,
            severity: preDriftResult.severity,
            recommendedAction: preDriftResult.recommendedAction,
            continuityRisk: preDriftResult.continuityRisk,
            reasons: preDriftResult.reasons,
            styleDriftScore: preDriftResult.styleDriftScore,
            characterDriftScore: preDriftResult.characterDriftScore,
            beatAlignmentScore: preDriftResult.beatAlignmentScore,
            sceneContinuityScore: preDriftResult.sceneContinuityScore,
            chapterLookMismatch: preDriftResult.chapterLookMismatch,
          }
        : null,
      generationLog: out.log,
      // P0.4 — prompt debug réel (source of truth pour la review UI)
      // AUDIT COMMIT 5 — on enrichit avec les infos d'audit pour rendre chaque
      // retry complètement traçable : source canonique, mode, politique de
      // références et longueurs des overrides / marqueurs injectés.
      promptDebug: {
        finalPrompt: effectivePositivePrompt,
        finalNegativePrompt: effectiveNegativePrompt,
        promptSource: retryPacketBase.source,
        retryPromptSource: retryPacketBase.source,
        usedPacket: retryPacketBase.source === "canonical",
        packetVersion: retryPacketBase.packetVersion,
        provider: out.result.provider,
        model: out.result.model,
        referencePolicy: effectiveReferencePolicy,
        appliedReferencePolicy: effectiveReferencePolicy,
        width: premiumSize.width,
        height: premiumSize.height,
        refsCount: referenceImageUrls.length,
        lorasCount: panelLoras.length,
        seed: out.result.seed ?? null,
        requestedAt: new Date().toISOString(),
        origin: "retry",
        retryMode,
        retryAttemptIndex: retryAttemptIndex + 1,
        warnings: retryLanguageWarnings,
        usedLocationMarkersLength: locationMarkersLine.length,
        usedUserPositiveLength: userPositive.length,
        usedUserNegativeLength: userNegative.length,
      },
      // P0.3 — user override tri-état (null clear autorisé)
      nextUserOverride: nextUserOverride as Record<string, unknown> | null,
      // P0.3 — packet canonique aligné avec l'envoi réel
      updatedCanonicalPacket: retryPacketBase.packet
        ? ({
            ...(retryPacketBase.packet as unknown as Record<string, unknown>),
            providerPayload: {
              ...((retryPacketBase.packet as unknown as { providerPayload: Record<string, unknown> }).providerPayload ?? {}),
              prompt: effectivePositivePrompt,
              negativePrompt: effectiveNegativePrompt,
              width: premiumSize.width,
              height: premiumSize.height,
              seed: out.result.seed ?? null,
            },
            modelRoutingDecision: {
              ...((retryPacketBase.packet as unknown as { modelRoutingDecision: Record<string, unknown> }).modelRoutingDecision ?? {}),
              modelId: out.result.model,
              referencePolicy: effectiveReferencePolicy,
              reason: "retry_executed",
            },
          } as Record<string, unknown>)
        : null,
      // P0.3 — trace du plan de reroll packet-aware
      packetRerollPlanEntry: packetAwarePrompt
        ? {
            attempt: retryAttemptIndex,
            reason: packetAwarePrompt.reason,
            allowed: packetAwarePrompt.allowed,
            retryMode,
            extraPromptHints: packetAwarePrompt.extraPromptHints,
            extraNegativeTokens: packetAwarePrompt.extraNegativeTokens,
            forcedReferencePolicy: packetAwarePrompt.referencePolicyOverride,
            origin: "retry",
            at: new Date().toISOString(),
          }
        : null,
      nextRetryAttemptIndex: retryAttemptIndex + 1,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "retry_failed";
    await persistRetryException({
      prisma,
      panelId: img.id,
      baseMetadata: metadata,
      errorMessage: msg,
      retryReferenceDecision,
      retryReferenceTrace: retryReferenceResolution.trace,
      availableReferenceUrls: referenceImageUrls.length,
      availableLoras: panelLoras.length,
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
