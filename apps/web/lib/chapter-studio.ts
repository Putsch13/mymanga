import {
  aggregateChapterImageCounts,
  buildStructuredChapterRuntimeFields,
  buildChapterReadinessReport,
  buildProductionPlanFromOutline,
  buildStudioSnapshotFromLegacy,
  resolveEffectiveChapterCanonState as resolveEffectiveChapterCanonStateCore,
  resolveEffectiveCharacterCanon as resolveEffectiveCharacterCanonCore,
  resolveEffectiveLocationCanon as resolveEffectiveLocationCanonCore,
  resolveEffectiveProductionSource as resolveEffectiveProductionSourceCore,
  resolveEffectiveProjectCanon as resolveEffectiveProjectCanonCore,
  type ChapterStudioData,
  type ChapterStudioSnapshot,
  type CharacterCanon,
  type LocationCanon,
  type ProjectCanon,
  type StructuredChapterRuntimeFields,
  updateChapterStudioSnapshot,
} from "@manga-ai-studio/core";
import type { Prisma } from "@manga-ai-studio/db";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function readChapterStudioSnapshotFromOutline(input: {
  outline: unknown;
  chapterNumber?: number | null;
  chapterTitle?: string | null;
  chapterSummary?: string | null;
  cliffhanger?: string | null;
  userIntent?: string | null;
  studioStatus?: string | null;
  studioCurrentStep?: string | null;
  studioUpdatedAt?: Date | string | null;
  studioAutosaveVersion?: number | null;
  minimumImages?: number | null;
  generatedImages?: number | null;
  acceptedImages?: number | null;
  rejectedImages?: number | null;
  missingImages?: number | null;
  criticalPanelsCount?: number | null;
  criticalPanelsBlocked?: number | null;
  criticalPanelsMissingQa?: number | null;
  reviewBlockedReason?: string | null;
}): ChapterStudioSnapshot {
  const outlineRecord = asRecord(input.outline);
  const studio = asRecord(outlineRecord.studio);
  const hydrateStructuredFields = (snapshot: ChapterStudioSnapshot) => {
    const next = { ...snapshot };
    if (input.studioStatus && typeof input.studioStatus === "string") {
      next.status = input.studioStatus as ChapterStudioSnapshot["status"];
    }
    if (input.studioCurrentStep && typeof input.studioCurrentStep === "string") {
      next.currentStep = input.studioCurrentStep as ChapterStudioSnapshot["currentStep"];
    }
    if (input.studioUpdatedAt) {
      next.updatedAt = typeof input.studioUpdatedAt === "string" ? input.studioUpdatedAt : input.studioUpdatedAt.toISOString();
    }
    if (typeof input.studioAutosaveVersion === "number") {
      next.autosaveVersion = input.studioAutosaveVersion;
    }
    const currentReadiness = next.data.readinessReport ?? buildChapterReadinessReport(next);
    next.data = {
      ...next.data,
      readinessReport: {
        ...currentReadiness,
        imageCounts: aggregateChapterImageCounts({
          estimatedImages: currentReadiness.imageCounts.estimatedImages,
          targetImages: currentReadiness.imageCounts.targetImages,
          minimumImages: input.minimumImages ?? currentReadiness.imageCounts.minimumImages,
          generatedImages: input.generatedImages ?? currentReadiness.imageCounts.generatedImages,
          acceptedImages: input.acceptedImages ?? currentReadiness.imageCounts.acceptedImages,
          rejectedImages: input.rejectedImages ?? currentReadiness.imageCounts.rejectedImages,
        }),
      },
      qaReport: next.data.qaReport
        ? {
            ...next.data.qaReport,
            missingCriticalPanels: next.data.qaReport.missingCriticalPanels,
          }
        : next.data.qaReport,
    };
    return next;
  };

  if (Object.keys(studio).length > 0) {
    return hydrateStructuredFields(updateChapterStudioSnapshot(
      studio as ChapterStudioSnapshot,
      {},
      { transitionReason: "refresh_snapshot" },
    ));
  }

  const approvedOutline =
    outlineRecord.approvedOutline && typeof outlineRecord.approvedOutline === "object"
      ? (outlineRecord.approvedOutline as Prisma.JsonObject)
      : null;

  return hydrateStructuredFields(buildStudioSnapshotFromLegacy({
    approvedOutline: approvedOutline as never,
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle,
    chapterSummary: input.chapterSummary,
    cliffhanger: input.cliffhanger,
    userIntent: input.userIntent,
  }));
}

export function mergeChapterStudioIntoOutline(input: {
  outline: unknown;
  snapshot: ChapterStudioSnapshot;
  includeLegacyBridge?: boolean;
}) {
  const outlineRecord = asRecord(input.outline);
  const next = {
    ...outlineRecord,
    studio: {
      ...input.snapshot,
      data: {
        ...input.snapshot.data,
        readinessReport: {
          ...(input.snapshot.data.readinessReport ?? buildChapterReadinessReport(input.snapshot)),
          imageCounts: aggregateChapterImageCounts(
            input.snapshot.data.readinessReport?.imageCounts
            ?? buildChapterReadinessReport(input.snapshot).imageCounts,
          ),
        },
      },
    },
  } as Record<string, unknown>;

  if (input.includeLegacyBridge && input.snapshot.data.productionOutline) {
    const approved = buildStudioSnapshotFromLegacy({
      approvedOutline: null,
    });
    void approved;
  }

  return next as Prisma.InputJsonValue;
}

export function resolveEffectiveProjectCanon(input: {
  snapshot: ChapterStudioSnapshot;
  fallbackProjectCanon?: ProjectCanon | null;
}) {
  return resolveEffectiveProjectCanonCore({
    studioProjectCanon: input.snapshot.data.projectCanon ?? null,
    fallbackProjectCanon: input.fallbackProjectCanon ?? null,
  });
}

export function buildProjectCanonFromProject(project: {
  visualStyle?: string | null;
  tone?: string | null;
  settings?: {
    violenceLevel?: number | null;
    romanceLevel?: number | null;
  } | null;
  bible?: {
    summary?: string | null;
    themes?: unknown;
    worldRules?: unknown;
    lockedCanon?: unknown;
  } | null;
  stylePack?: {
    renderFamily?: string | null;
    lineWeight?: string | null;
    shadingMode?: string | null;
    contrastProfile?: string | null;
    anatomyBias?: string | null;
    backgroundDensity?: string | null;
    cameraLanguage?: string | null;
    negativeConstraints?: unknown;
  } | null;
}): ProjectCanon {
  return {
    artStyleCanon: [
      safeString(project.visualStyle),
      safeString(project.stylePack?.renderFamily),
      safeString(project.stylePack?.lineWeight),
      safeString(project.stylePack?.shadingMode),
      safeString(project.stylePack?.contrastProfile),
      safeString(project.stylePack?.cameraLanguage),
    ].filter((value): value is string => Boolean(value)),
    worldRules: [
      ...asStringArray(project.bible?.worldRules),
      ...asStringArray(project.bible?.lockedCanon),
    ],
    toneRules: [safeString(project.tone)].filter((value): value is string => Boolean(value)),
    violenceLevel: project.settings?.violenceLevel ?? null,
    romanceLevel: project.settings?.romanceLevel ?? null,
    supernaturalRules: [],
    panelingPreferences: [safeString(project.stylePack?.backgroundDensity)].filter((value): value is string => Boolean(value)),
    blackAndWhitePolicy: "manga_monochrome",
    inkingPolicy: safeString(project.stylePack?.anatomyBias),
    negativeStyleRules: asStringArray(project.stylePack?.negativeConstraints),
  };
}

export function buildCharacterCanonFromCharacter(character: {
  id: string;
  name: string;
  roleType?: string | null;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  visualProfile?: unknown;
  wardrobeProfile?: unknown;
  stableVisualDNA?: unknown;
  canonLocked?: boolean;
  visualRefs?: Array<{ mediaAsset?: { publicUrl?: string | null } | null; imageUrl?: string | null }> | null;
  canonPack?: { completenessScore?: number | null } | null;
  // P1.2 : champs supplémentaires pour unifier avec le canon runtime.
  characterFingerprint?: unknown;
  bodyState?: unknown;
  continuityProfile?: unknown;
  visualLocks?: Array<{ isActive?: boolean | null; triggerWord?: string | null; loraAsset?: { publicUrl?: string | null } | null; canonicalRefUrls?: unknown; defaultOutfit?: string | null; altOutfits?: unknown }> | null;
}): CharacterCanon {
  const visualProfile = asRecord(character.visualProfile);
  const wardrobeProfile = asRecord(character.wardrobeProfile);
  const stableVisualDNA = asRecord(character.stableVisualDNA);
  const characterFingerprint = asRecord(character.characterFingerprint);
  const bodyState = asRecord(character.bodyState);

  // P1.2 : on agrège les visualRefs stockés sur le Character ET sur son
  // active CharacterVisualLock, priorité au lock (canonical source of truth).
  const activeLock = (character.visualLocks ?? []).find((l) => l?.isActive === true) ?? null;
  const lockRefUrls = Array.isArray(activeLock?.canonicalRefUrls)
    ? (activeLock?.canonicalRefUrls as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  const referenceAssets = [
    ...lockRefUrls,
    ...((character.visualRefs ?? [])
      .map((ref) => ref.mediaAsset?.publicUrl ?? ref.imageUrl ?? null)
      .filter((value): value is string => Boolean(value))),
  ];
  // Dédupliquer (preserve order).
  const seenRefs = new Set<string>();
  const dedupedReferenceAssets = referenceAssets.filter((u) => {
    if (seenRefs.has(u)) return false;
    seenRefs.add(u);
    return true;
  });

  const importanceTier =
    /hero|protagon/i.test(character.roleType ?? "")
      ? "MAIN_HERO"
      : /antagon|main|core/i.test(character.roleType ?? "")
        ? "SECONDARY_CORE"
        : /support|ally|secondary/i.test(character.roleType ?? "")
          ? "IMPORTANT_SUPPORTING_CHARACTER"
          : "RECURRING_NPC";

  return {
    characterId: character.id,
    role: character.roleType ?? null,
    canonicalName: character.name,
    importanceTier,
    lockStrength: importanceTier === "MAIN_HERO" ? "HARD_LOCK" : character.canonLocked ? "STRONG" : "MEDIUM",
    visualIdentity: [
      safeString(character.appearance),
      safeString(visualProfile.faceShape),
      safeString(visualProfile.silhouetteType),
    ].filter((value): value is string => Boolean(value)),
    silhouette: safeString(visualProfile.silhouetteType),
    faceTraits: [
      safeString(visualProfile.faceShape),
      safeString(visualProfile.faceStructure),
    ].filter((value): value is string => Boolean(value)),
    eyeTraits: [safeString(character.eyeColor), safeString(visualProfile.eyeShape)].filter((value): value is string => Boolean(value)),
    hairTraits: [safeString(character.hairColor), safeString(visualProfile.hairStyle)].filter((value): value is string => Boolean(value)),
    skinTone: safeString(visualProfile.skinTone),
    bodyType: safeString(visualProfile.bodyType),
    apparentAge: safeString(visualProfile.ageVariant),
    accessories: [
      ...asStringArray(visualProfile.accessories),
      ...asStringArray(stableVisualDNA.fixedAccessories),
    ],
    signatureMarks: [
      ...asStringArray(stableVisualDNA.scars),
      ...asStringArray(stableVisualDNA.tattoos),
    ],
    defaultOutfitId: character.outfitDefault ?? null,
    defaultOutfitSet: [{
      outfitId: `${character.id}:default`,
      characterId: character.id,
      label: character.outfitDefault ?? "Default",
      top: safeString(wardrobeProfile.top),
      bottom: safeString(wardrobeProfile.bottom),
      shoes: safeString(wardrobeProfile.shoes),
      accessories: asStringArray(wardrobeProfile.accessories),
      stateTags: ["default"],
      seasonContext: safeString(wardrobeProfile.season),
      colorMemory: asStringArray(wardrobeProfile.colorMemory),
      shapeMemory: asStringArray(wardrobeProfile.shapeMemory),
      continuityPriority: character.canonLocked ? 90 : 65,
    }],
    emotionalRange: asStringArray(visualProfile.emotionalRange),
    forbiddenDrift: asStringArray(stableVisualDNA.forbiddenVisualDrift),
    mustKeep: [
      safeString(character.hairColor) ? `${character.hairColor} hair` : null,
      safeString(character.eyeColor) ? `${character.eyeColor} eyes` : null,
      safeString(character.outfitDefault),
    ].filter((value): value is string => Boolean(value)),
    optionalVariation: asStringArray(wardrobeProfile.altOutfits),
    referenceAssets: dedupedReferenceAssets,
    // P1.2 : on représente le binding LoRA sous forme de strings composites
    // ("trigger|url") — conforme au schéma z.array(z.string()).
    loraBindings: activeLock?.triggerWord
      ? [`${activeLock.triggerWord}|${activeLock.loraAsset?.publicUrl ?? ""}`]
      : [],
    // P1.2 : fingerprint agrégé (characterFingerprint prioritaire, fallback DNA).
    fingerprint: Object.keys(characterFingerprint).length > 0
      ? { ...stableVisualDNA, ...characterFingerprint, bodyState }
      : stableVisualDNA,
    // Propagation du canonPack pour permettre au readiness report de détecter
    // les personnages MAIN/CORE sans canonPack solide (source majeure de drift).
    hasCanonPack: Boolean(character.canonPack),
    canonPackCompleteness:
      typeof character.canonPack?.completenessScore === "number"
        ? character.canonPack.completenessScore
        : null,
  };
}

export function resolveEffectiveCharacterCanon(input: {
  snapshot: ChapterStudioSnapshot;
  characterId: string;
  fallbackCharacterCanon?: CharacterCanon | null;
}) {
  return resolveEffectiveCharacterCanonCore({
    studioCharacterCanons: input.snapshot.data.characterCanons,
    characterId: input.characterId,
    fallbackCharacterCanon: input.fallbackCharacterCanon ?? null,
  });
}

export function buildLocationCanonFromLocation(location: {
  id: string;
  name: string;
  type?: string | null;
  description?: string | null;
  metadata?: unknown;
}): LocationCanon {
  const metadata = asRecord(location.metadata);
  return {
    locationId: location.id,
    label: location.name,
    visualMarkers: [
      safeString(location.description),
      ...asStringArray(metadata.visualMarkers),
    ].filter((value): value is string => Boolean(value)),
    architecture: asStringArray(metadata.architecture),
    density: safeString(metadata.density ?? location.type),
    atmosphere: asStringArray(metadata.atmosphere),
    timeOfDayVariants: asStringArray(metadata.timeOfDayVariants),
    weatherVariants: asStringArray(metadata.weatherVariants),
    mustKeep: asStringArray(metadata.mustKeep),
    forbiddenDrift: asStringArray(metadata.forbiddenDrift),
  };
}

export function resolveEffectiveLocationCanon(input: {
  snapshot: ChapterStudioSnapshot;
  locationIdOrLabel?: string | null;
  fallbackLocationCanon?: LocationCanon | null;
}) {
  return resolveEffectiveLocationCanonCore({
    studioLocationCanons: input.snapshot.data.locationCanons,
    locationIdOrLabel: input.locationIdOrLabel,
    fallbackLocationCanon: input.fallbackLocationCanon ?? null,
  });
}

export function resolveEffectiveChapterCanonState(snapshot: ChapterStudioSnapshot) {
  return resolveEffectiveChapterCanonStateCore(snapshot);
}

export function resolveEffectiveProductionSource(snapshot: ChapterStudioSnapshot) {
  return resolveEffectiveProductionSourceCore(snapshot);
}

export function patchChapterStudioSnapshot(
  outline: unknown,
  patch: Partial<ChapterStudioData>,
  input?: {
    chapterNumber?: number | null;
    chapterTitle?: string | null;
    chapterSummary?: string | null;
    cliffhanger?: string | null;
    userIntent?: string | null;
    currentStep?: ChapterStudioSnapshot["currentStep"];
    transitionReason?: string;
  },
) {
  const snapshot = readChapterStudioSnapshotFromOutline({
    outline,
    chapterNumber: input?.chapterNumber,
    chapterTitle: input?.chapterTitle,
    chapterSummary: input?.chapterSummary,
    cliffhanger: input?.cliffhanger,
    userIntent: input?.userIntent,
  });

  const nextData = { ...patch };
  if (!nextData.productionPlan && nextData.productionOutline) {
    nextData.productionPlan = buildProductionPlanFromOutline(nextData.productionOutline, {
      lockedCharacters: nextData.characterSelection?.lockedCharacterIds ?? snapshot.data.characterSelection?.lockedCharacterIds ?? [],
    });
  }

  return updateChapterStudioSnapshot(snapshot, nextData, {
    currentStep: input?.currentStep,
    transitionReason: input?.transitionReason,
  });
}

export function buildChapterStudioListItem(input: {
  id: string;
  chapterNumber: number;
  title: string | null;
  status: string;
  summary: string | null;
  cliffhanger: string | null;
  outline: unknown;
  studioStatus?: string | null;
  studioCurrentStep?: string | null;
  studioUpdatedAt?: Date | string | null;
  studioAutosaveVersion?: number | null;
  minimumImages?: number | null;
  generatedImages?: number | null;
  acceptedImages?: number | null;
  rejectedImages?: number | null;
  missingImages?: number | null;
  criticalPanelsCount?: number | null;
  criticalPanelsBlocked?: number | null;
  criticalPanelsMissingQa?: number | null;
  reviewBlockedReason?: string | null;
}) {
  const snapshot = readChapterStudioSnapshotFromOutline({
    outline: input.outline,
    chapterNumber: input.chapterNumber,
    chapterTitle: input.title,
    chapterSummary: input.summary,
    cliffhanger: input.cliffhanger,
    studioStatus: input.studioStatus,
    studioCurrentStep: input.studioCurrentStep,
    studioUpdatedAt: input.studioUpdatedAt,
    studioAutosaveVersion: input.studioAutosaveVersion,
    minimumImages: input.minimumImages,
    generatedImages: input.generatedImages,
    acceptedImages: input.acceptedImages,
    rejectedImages: input.rejectedImages,
    missingImages: input.missingImages,
    criticalPanelsCount: input.criticalPanelsCount,
    criticalPanelsBlocked: input.criticalPanelsBlocked,
    criticalPanelsMissingQa: input.criticalPanelsMissingQa,
    reviewBlockedReason: input.reviewBlockedReason,
  });

  return {
    id: input.id,
    chapterNumber: input.chapterNumber,
    title: input.title,
    status: input.status,
    studioStatus: snapshot.status,
    readinessReport: snapshot.data.readinessReport ?? buildChapterReadinessReport(snapshot),
    currentStep: snapshot.currentStep,
    summary: input.summary,
    cliffhanger: input.cliffhanger,
  };
}

export function buildChapterStructuredRuntimeFields(input: {
  snapshot: ChapterStudioSnapshot;
  counts?: Partial<StructuredChapterRuntimeFields>;
  minimumImages?: number | null;
  generatedImages?: number | null;
  acceptedImages?: number | null;
  rejectedImages?: number | null;
  missingImages?: number | null;
  criticalPanelsCount?: number | null;
  criticalPanelsBlocked?: number | null;
  criticalPanelsMissingQa?: number | null;
  reviewBlockedReason?: string | null;
}): StructuredChapterRuntimeFields {
  return buildStructuredChapterRuntimeFields({
    snapshot: input.snapshot,
    counts: {
      minimumImages: input.minimumImages ?? input.counts?.minimumImages,
      generatedImages: input.generatedImages ?? input.counts?.generatedImages,
      acceptedImages: input.acceptedImages ?? input.counts?.acceptedImages,
      rejectedImages: input.rejectedImages ?? input.counts?.rejectedImages,
      missingImages: input.missingImages ?? input.counts?.missingImages,
    },
    criticalPanelsCount: input.criticalPanelsCount ?? input.counts?.criticalPanelsCount,
    criticalPanelsBlocked: input.criticalPanelsBlocked ?? input.counts?.criticalPanelsBlocked,
    criticalPanelsMissingQa: input.criticalPanelsMissingQa ?? input.counts?.criticalPanelsMissingQa,
    reviewBlockedReason: input.reviewBlockedReason ?? input.counts?.reviewBlockedReason ?? null,
  });
}

export function buildChapterStructuredRuntimePrismaFields(input: {
  snapshot: ChapterStudioSnapshot;
  counts?: Partial<StructuredChapterRuntimeFields>;
  minimumImages?: number | null;
  generatedImages?: number | null;
  acceptedImages?: number | null;
  rejectedImages?: number | null;
  missingImages?: number | null;
  criticalPanelsCount?: number | null;
  criticalPanelsBlocked?: number | null;
  criticalPanelsMissingQa?: number | null;
  reviewBlockedReason?: string | null;
}): Prisma.ChapterUpdateInput {
  const fields = buildChapterStructuredRuntimeFields(input);
  return {
    studioStatus: fields.studioStatus,
    studioCurrentStep: fields.studioCurrentStep,
    studioUpdatedAt: fields.studioUpdatedAt ? new Date(fields.studioUpdatedAt) : null,
    studioAutosaveVersion: fields.studioAutosaveVersion,
    minimumImages: fields.minimumImages,
    generatedImages: fields.generatedImages,
    acceptedImages: fields.acceptedImages,
    rejectedImages: fields.rejectedImages,
    missingImages: fields.missingImages,
    criticalPanelsCount: fields.criticalPanelsCount,
    criticalPanelsBlocked: fields.criticalPanelsBlocked,
    criticalPanelsMissingQa: fields.criticalPanelsMissingQa,
    reviewBlockedReason: fields.reviewBlockedReason,
  };
}

export function buildChapterStructuredRuntimeCreateFields(input: {
  snapshot: ChapterStudioSnapshot;
  counts?: Partial<StructuredChapterRuntimeFields>;
  minimumImages?: number | null;
  generatedImages?: number | null;
  acceptedImages?: number | null;
  rejectedImages?: number | null;
  missingImages?: number | null;
  criticalPanelsCount?: number | null;
  criticalPanelsBlocked?: number | null;
  criticalPanelsMissingQa?: number | null;
  reviewBlockedReason?: string | null;
}) {
  const fields = buildChapterStructuredRuntimeFields(input);
  return {
    studioStatus: fields.studioStatus,
    studioCurrentStep: fields.studioCurrentStep,
    studioUpdatedAt: fields.studioUpdatedAt ? new Date(fields.studioUpdatedAt) : null,
    studioAutosaveVersion: fields.studioAutosaveVersion,
    minimumImages: fields.minimumImages,
    generatedImages: fields.generatedImages,
    acceptedImages: fields.acceptedImages,
    rejectedImages: fields.rejectedImages,
    missingImages: fields.missingImages,
    criticalPanelsCount: fields.criticalPanelsCount,
    criticalPanelsBlocked: fields.criticalPanelsBlocked,
    criticalPanelsMissingQa: fields.criticalPanelsMissingQa,
    reviewBlockedReason: fields.reviewBlockedReason,
  };
}

/**
 * Normalise un snapshot studio pour garantir la cohérence premium.
 * - Préserve les champs enrichis premium au lieu d'écraser par buildStudioSnapshotFromLegacy
 * - Recalcule readinessReport si les compteurs runtime ont changé
 */
export function normalizePremiumStudioSnapshot(
  snapshot: ChapterStudioSnapshot,
  outlineRecord?: Record<string, unknown>,
): ChapterStudioSnapshot {
  const data = snapshot.data;

  const hasPremiumOutline =
    data.productionOutline &&
    data.productionOutline.source !== "legacy_adapted" &&
    Array.isArray(data.productionOutline.beats) &&
    data.productionOutline.beats.length > 0;

  const hasPremiumPlan =
    data.productionPlan &&
    typeof data.productionPlan.minimumImages === "number" &&
    data.productionPlan.minimumImages > 0;

  if (!hasPremiumOutline && !hasPremiumPlan && outlineRecord) {
    const storedOutline = outlineRecord.productionOutline;
    const storedPlan = outlineRecord.productionPlan;
    if (storedOutline || storedPlan) {
      return {
        ...snapshot,
        data: {
          ...data,
          productionOutline: (storedOutline as ChapterStudioSnapshot["data"]["productionOutline"]) ?? data.productionOutline,
          productionPlan: (storedPlan as ChapterStudioSnapshot["data"]["productionPlan"]) ?? data.productionPlan,
        },
      };
    }
  }

  const currentReadiness = data.readinessReport ?? buildChapterReadinessReport(snapshot);
  return {
    ...snapshot,
    data: {
      ...data,
      readinessReport: currentReadiness,
    },
  };
}
