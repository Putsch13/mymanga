import {
  type CanonLockStrength,
  type ChapterImageCount,
  chapterImageCountSchema,
  type ChapterReadinessReport,
  type ChapterStudioSnapshot,
  type CharacterCanon,
  type CharacterImportanceTier,
  type LocationCanon,
  type ProductionOutline,
  type ProjectCanon,
} from "./types";

export type PanelCriticalityLevel = "NON_CRITICAL" | "CRITICAL";

export type PanelCriticalityReason =
  | "hero_focal"
  | "hero_closeup"
  | "hero_full_body"
  | "major_emotional_scene"
  | "major_reveal"
  | "important_multi_character_scene"
  | "important_supporting_character"
  | "page_finale"
  | "high_criticality_beat";

export type CharacterTierPolicy = {
  tier: CharacterImportanceTier;
  minimumLock: CanonLockStrength;
  minimumReferencePolicy: "NONE" | "LIGHT" | "STRONG";
  fingerprintRequired: boolean;
  promptBudget: "low" | "medium" | "high";
  qaExpectation: "none" | "light" | "strict";
  recurringMemoryUsed: boolean;
};

export const CHARACTER_TIER_POLICIES: Record<CharacterImportanceTier, CharacterTierPolicy> = {
  MAIN_HERO: {
    tier: "MAIN_HERO",
    minimumLock: "HARD_LOCK",
    minimumReferencePolicy: "STRONG",
    fingerprintRequired: true,
    promptBudget: "high",
    qaExpectation: "strict",
    recurringMemoryUsed: true,
  },
  SECONDARY_CORE: {
    tier: "SECONDARY_CORE",
    minimumLock: "STRONG",
    minimumReferencePolicy: "STRONG",
    fingerprintRequired: true,
    promptBudget: "high",
    qaExpectation: "strict",
    recurringMemoryUsed: true,
  },
  IMPORTANT_SUPPORTING_CHARACTER: {
    tier: "IMPORTANT_SUPPORTING_CHARACTER",
    minimumLock: "STRONG",
    minimumReferencePolicy: "LIGHT",
    fingerprintRequired: true,
    promptBudget: "medium",
    qaExpectation: "strict",
    recurringMemoryUsed: true,
  },
  RECURRING_NPC: {
    tier: "RECURRING_NPC",
    minimumLock: "MEDIUM",
    minimumReferencePolicy: "LIGHT",
    fingerprintRequired: false,
    promptBudget: "medium",
    qaExpectation: "light",
    recurringMemoryUsed: true,
  },
  BACKGROUND_EXTRA: {
    tier: "BACKGROUND_EXTRA",
    minimumLock: "NONE",
    minimumReferencePolicy: "NONE",
    fingerprintRequired: false,
    promptBudget: "low",
    qaExpectation: "none",
    recurringMemoryUsed: false,
  },
};

export type PanelCriticalityInput = {
  shotType?: string | null;
  purpose?: string | null;
  panelCategory?: string | null;
  pageNumber?: number | null;
  panelNumber?: number | null;
  pagePanelCount?: number | null;
  requiredCharacters?: string[];
  focusCharacters?: string[];
  characterTiers?: CharacterImportanceTier[];
  heroCharacterId?: string | null;
  characterIds?: string[];
  visualPriority?: string | null;
};

export type PanelCriticalityDecision = {
  level: PanelCriticalityLevel;
  reasons: PanelCriticalityReason[];
  qaWasRequired: boolean;
};

export type ChapterImageCountInput = {
  estimatedImages?: number | null;
  targetImages?: number | null;
  minimumImages?: number | null;
  generatedImages?: number | null;
  acceptedImages?: number | null;
  rejectedImages?: number | null;
};

export type ChapterRuntimeStatus =
  | "DRAFT"
  | "READY_FOR_GENERATION"
  | "GENERATING"
  | "GENERATION_PARTIAL"
  | "QA_REVIEW"
  | "NEEDS_FIXES"
  | "COMPLETED"
  | "PUBLISHED";

export type StructuredChapterRuntimeFields = {
  studioStatus: ChapterStudioSnapshot["status"];
  studioCurrentStep: ChapterStudioSnapshot["currentStep"];
  studioUpdatedAt: string | null;
  studioAutosaveVersion: number;
  minimumImages: number;
  generatedImages: number;
  acceptedImages: number;
  rejectedImages: number;
  missingImages: number;
  criticalPanelsCount: number;
  criticalPanelsBlocked: number;
  criticalPanelsMissingQa: number;
  reviewBlockedReason: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function uniq<T>(values: T[]) {
  return [...new Set(values)];
}

export function resolveCharacterImportanceTier(input: {
  explicitTier?: CharacterImportanceTier | null;
  roleType?: string | null;
  recurrencePolicy?: string | null;
  appearanceCount?: number | null;
  speaking?: boolean;
}): CharacterImportanceTier {
  if (input.explicitTier) return input.explicitTier;
  const role = (input.roleType ?? "").toLowerCase();
  if (/hero|protagon|main_hero|héros|heros/.test(role)) return "MAIN_HERO";
  if (/antagon|villain|main|core/.test(role)) return "SECONDARY_CORE";
  if (/support|ally|mentor|secondary|important/.test(role)) return "IMPORTANT_SUPPORTING_CHARACTER";
  if ((input.recurrencePolicy ?? "") === "recurring" || (input.appearanceCount ?? 0) >= 2 || input.speaking) {
    return "RECURRING_NPC";
  }
  return "BACKGROUND_EXTRA";
}

export function getCharacterTierPolicy(tier: CharacterImportanceTier): CharacterTierPolicy {
  return CHARACTER_TIER_POLICIES[tier];
}

export function classifyPanelCriticality(input: PanelCriticalityInput): PanelCriticalityDecision {
  const reasons: PanelCriticalityReason[] = [];
  const shotType = input.shotType ?? "";
  const purpose = input.purpose ?? "";
  const panelCategory = input.panelCategory ?? "";
  const tiers = input.characterTiers ?? [];
  const hasHero = tiers.includes("MAIN_HERO");
  const hasImportantSupporting = tiers.includes("IMPORTANT_SUPPORTING_CHARACTER") || tiers.includes("SECONDARY_CORE");
  const characterCount = input.characterIds?.length ?? input.requiredCharacters?.length ?? 0;

  if (panelCategory === "CHARACTER_LOCK") reasons.push("hero_focal");
  if (hasHero && (shotType === "closeup" || shotType === "extreme_closeup")) reasons.push("hero_closeup");
  if (hasHero && shotType === "medium" && purpose === "action") reasons.push("hero_full_body");
  if (purpose === "reveal") reasons.push("major_reveal");
  if (purpose === "reaction" || purpose === "aftermath") reasons.push("major_emotional_scene");
  if (characterCount >= 2 && (hasHero || hasImportantSupporting)) reasons.push("important_multi_character_scene");
  if (hasImportantSupporting) reasons.push("important_supporting_character");
  if (
    input.pagePanelCount != null
    && input.panelNumber != null
    && input.pagePanelCount > 0
    && input.panelNumber >= input.pagePanelCount
  ) {
    reasons.push("page_finale");
  }
  if ((input.visualPriority ?? "") === "critical") reasons.push("high_criticality_beat");

  const normalizedReasons = uniq(reasons);
  return {
    level: normalizedReasons.length > 0 ? "CRITICAL" : "NON_CRITICAL",
    reasons: normalizedReasons,
    qaWasRequired: normalizedReasons.length > 0,
  };
}

export function aggregateChapterImageCounts(input?: ChapterImageCountInput | null): ChapterImageCount {
  const normalized = chapterImageCountSchema.parse({
    estimatedImages: input?.estimatedImages ?? 0,
    targetImages: input?.targetImages ?? input?.estimatedImages ?? 0,
    minimumImages: input?.minimumImages ?? 75,
    generatedImages: input?.generatedImages ?? 0,
    acceptedImages: input?.acceptedImages ?? 0,
    rejectedImages: input?.rejectedImages ?? 0,
    missingImages: 0,
  });

  return {
    ...normalized,
    missingImages: Math.max(0, normalized.minimumImages - normalized.acceptedImages),
  };
}

export function resolveChapterRuntimeStatus(input: {
  counts: ChapterImageCount;
  hasCriticalQaMissing: boolean;
  hasRejectedPanels: boolean;
  hasGeneratedPanels: boolean;
  hasQaResults: boolean;
  publishRequested?: boolean;
}): ChapterRuntimeStatus {
  if (!input.hasGeneratedPanels) return "READY_FOR_GENERATION";
  if (input.counts.acceptedImages < input.counts.minimumImages) return "GENERATION_PARTIAL";
  if (input.hasCriticalQaMissing) return "NEEDS_FIXES";
  if (input.hasRejectedPanels) return "QA_REVIEW";
  if (!input.hasQaResults) return "QA_REVIEW";
  if (input.publishRequested) return "PUBLISHED";
  return "COMPLETED";
}

export function resolveEffectiveProjectCanon(input: {
  studioProjectCanon?: ProjectCanon | null;
  fallbackProjectCanon?: Partial<ProjectCanon> | null;
}) {
  const studio = input.studioProjectCanon;
  const fallback = input.fallbackProjectCanon ?? {};
  return {
    canon: {
      artStyleCanon: studio?.artStyleCanon?.length ? studio.artStyleCanon : fallback.artStyleCanon ?? [],
      worldRules: studio?.worldRules?.length ? studio.worldRules : fallback.worldRules ?? [],
      toneRules: studio?.toneRules?.length ? studio.toneRules : fallback.toneRules ?? [],
      violenceLevel: studio?.violenceLevel ?? fallback.violenceLevel ?? null,
      romanceLevel: studio?.romanceLevel ?? fallback.romanceLevel ?? null,
      supernaturalRules: studio?.supernaturalRules?.length ? studio.supernaturalRules : fallback.supernaturalRules ?? [],
      panelingPreferences: studio?.panelingPreferences?.length ? studio.panelingPreferences : fallback.panelingPreferences ?? [],
      blackAndWhitePolicy: studio?.blackAndWhitePolicy ?? fallback.blackAndWhitePolicy ?? null,
      inkingPolicy: studio?.inkingPolicy ?? fallback.inkingPolicy ?? null,
      negativeStyleRules: studio?.negativeStyleRules?.length ? studio.negativeStyleRules : fallback.negativeStyleRules ?? [],
    } satisfies ProjectCanon,
    source: studio ? "studio" : "legacy",
    legacyBridgeUsed: !studio,
  };
}

export function resolveEffectiveCharacterCanon(input: {
  studioCharacterCanons?: CharacterCanon[] | null;
  characterId: string;
  fallbackCharacterCanon?: Partial<CharacterCanon> | null;
}) {
  const studio = (input.studioCharacterCanons ?? []).find((canon) => canon.characterId === input.characterId) ?? null;
  const fallback = input.fallbackCharacterCanon ?? {};
  const tier = resolveCharacterImportanceTier({
    explicitTier: studio?.importanceTier ?? fallback.importanceTier ?? null,
    roleType: studio?.role ?? fallback.role ?? null,
  });
  return {
    canon: {
      characterId: studio?.characterId ?? input.characterId,
      canonicalName: studio?.canonicalName ?? fallback.canonicalName ?? input.characterId,
      role: studio?.role ?? fallback.role ?? null,
      importanceTier: tier,
      lockStrength: studio?.lockStrength ?? fallback.lockStrength ?? getCharacterTierPolicy(tier).minimumLock,
      visualIdentity: studio?.visualIdentity?.length ? studio.visualIdentity : fallback.visualIdentity ?? [],
      silhouette: studio?.silhouette ?? fallback.silhouette ?? null,
      faceTraits: studio?.faceTraits?.length ? studio.faceTraits : fallback.faceTraits ?? [],
      eyeTraits: studio?.eyeTraits?.length ? studio.eyeTraits : fallback.eyeTraits ?? [],
      hairTraits: studio?.hairTraits?.length ? studio.hairTraits : fallback.hairTraits ?? [],
      skinTone: studio?.skinTone ?? fallback.skinTone ?? null,
      bodyType: studio?.bodyType ?? fallback.bodyType ?? null,
      apparentAge: studio?.apparentAge ?? fallback.apparentAge ?? null,
      accessories: studio?.accessories?.length ? studio.accessories : fallback.accessories ?? [],
      signatureMarks: studio?.signatureMarks?.length ? studio.signatureMarks : fallback.signatureMarks ?? [],
      defaultOutfitId: studio?.defaultOutfitId ?? fallback.defaultOutfitId ?? null,
      defaultOutfitSet: studio?.defaultOutfitSet?.length ? studio.defaultOutfitSet : fallback.defaultOutfitSet ?? [],
      emotionalRange: studio?.emotionalRange?.length ? studio.emotionalRange : fallback.emotionalRange ?? [],
      forbiddenDrift: studio?.forbiddenDrift?.length ? studio.forbiddenDrift : fallback.forbiddenDrift ?? [],
      mustKeep: studio?.mustKeep?.length ? studio.mustKeep : fallback.mustKeep ?? [],
      optionalVariation: studio?.optionalVariation?.length ? studio.optionalVariation : fallback.optionalVariation ?? [],
      referenceAssets: studio?.referenceAssets?.length ? studio.referenceAssets : fallback.referenceAssets ?? [],
      loraBindings: studio?.loraBindings?.length ? studio.loraBindings : fallback.loraBindings ?? [],
      fingerprint: studio?.fingerprint ?? fallback.fingerprint ?? {},
    } satisfies CharacterCanon,
    source: studio ? "studio" : "legacy",
    legacyBridgeUsed: !studio,
  };
}

export function resolveEffectiveLocationCanon(input: {
  studioLocationCanons?: LocationCanon[] | null;
  locationIdOrLabel?: string | null;
  fallbackLocationCanon?: Partial<LocationCanon> | null;
}) {
  const studio = (input.studioLocationCanons ?? []).find((canon) =>
    canon.locationId === input.locationIdOrLabel || canon.label === input.locationIdOrLabel,
  ) ?? null;
  const fallback = input.fallbackLocationCanon ?? {};
  return {
    canon: {
      locationId: studio?.locationId ?? fallback.locationId ?? input.locationIdOrLabel ?? "unknown_location",
      label: studio?.label ?? fallback.label ?? input.locationIdOrLabel ?? "unknown_location",
      visualMarkers: studio?.visualMarkers?.length ? studio.visualMarkers : fallback.visualMarkers ?? [],
      architecture: studio?.architecture?.length ? studio.architecture : fallback.architecture ?? [],
      density: studio?.density ?? fallback.density ?? null,
      atmosphere: studio?.atmosphere?.length ? studio.atmosphere : fallback.atmosphere ?? [],
      timeOfDayVariants: studio?.timeOfDayVariants?.length ? studio.timeOfDayVariants : fallback.timeOfDayVariants ?? [],
      weatherVariants: studio?.weatherVariants?.length ? studio.weatherVariants : fallback.weatherVariants ?? [],
      mustKeep: studio?.mustKeep?.length ? studio.mustKeep : fallback.mustKeep ?? [],
      forbiddenDrift: studio?.forbiddenDrift?.length ? studio.forbiddenDrift : fallback.forbiddenDrift ?? [],
    } satisfies LocationCanon,
    source: studio ? "studio" : "legacy",
    legacyBridgeUsed: !studio,
  };
}

export function resolveEffectiveChapterCanonState(snapshot: ChapterStudioSnapshot) {
  return {
    chapterCanon: snapshot.data.chapterCanon ?? null,
    source: snapshot.data.chapterCanon ? "studio" : "legacy",
    legacyBridgeUsed: !snapshot.data.chapterCanon,
  };
}

export function resolveEffectiveProductionSource(snapshot: ChapterStudioSnapshot) {
  if (snapshot.data.productionOutline) {
    return {
      outline: snapshot.data.productionOutline as ProductionOutline,
      source: snapshot.data.productionOutline.source === "legacy_adapted" ? "legacy_bridge" : "studio",
      fallbackUsed: snapshot.data.productionOutline.source === "legacy_adapted",
      legacyBridgeUsed: snapshot.data.productionOutline.source === "legacy_adapted",
    };
  }
  return {
    outline: null,
    source: "missing",
    fallbackUsed: true,
    legacyBridgeUsed: true,
  } as const;
}

export function evaluateChapterReadinessState(input: {
  readinessReport: ChapterReadinessReport;
  hasCriticalQaMissing: boolean;
  hasRejectedPanels: boolean;
  hasQaResults: boolean;
}) {
  const counts = aggregateChapterImageCounts(input.readinessReport.imageCounts);
  return resolveChapterRuntimeStatus({
    counts,
    hasCriticalQaMissing: input.hasCriticalQaMissing,
    hasRejectedPanels: input.hasRejectedPanels,
    hasGeneratedPanels: counts.generatedImages > 0,
    hasQaResults: input.hasQaResults,
  });
}

export function buildStructuredChapterRuntimeFields(input: {
  snapshot: ChapterStudioSnapshot;
  counts?: Partial<ChapterImageCount> | null;
  criticalPanelsCount?: number | null;
  criticalPanelsBlocked?: number | null;
  criticalPanelsMissingQa?: number | null;
  reviewBlockedReason?: string | null;
}): StructuredChapterRuntimeFields {
  const counts = aggregateChapterImageCounts(input.counts);
  const criticalPanelsCount = Math.max(0, input.criticalPanelsCount ?? 0);
  const criticalPanelsBlocked = Math.max(0, input.criticalPanelsBlocked ?? 0);
  const criticalPanelsMissingQa = Math.max(0, input.criticalPanelsMissingQa ?? 0);
  const coercedStatus =
    counts.acceptedImages < counts.minimumImages
      ? "GENERATION_PARTIAL"
      : criticalPanelsBlocked > 0 || criticalPanelsMissingQa > 0
        ? "NEEDS_FIXES"
        : input.snapshot.status;

  let reviewBlockedReason = input.reviewBlockedReason ?? null;
  if (!reviewBlockedReason) {
    if (counts.acceptedImages < counts.minimumImages) {
      reviewBlockedReason = "missing_images";
    } else if (criticalPanelsMissingQa > 0) {
      reviewBlockedReason = "critical_qa_missing";
    } else if (criticalPanelsBlocked > 0) {
      reviewBlockedReason = "critical_panels_blocked";
    }
  }

  return {
    studioStatus: coercedStatus,
    studioCurrentStep: input.snapshot.currentStep,
    studioUpdatedAt: input.snapshot.updatedAt ?? null,
    studioAutosaveVersion: Math.max(1, input.snapshot.autosaveVersion ?? 1),
    minimumImages: counts.minimumImages,
    generatedImages: Math.max(counts.generatedImages, counts.acceptedImages),
    acceptedImages: Math.min(counts.acceptedImages, Math.max(counts.generatedImages, counts.acceptedImages)),
    rejectedImages: counts.rejectedImages,
    missingImages: Math.max(0, counts.minimumImages - counts.acceptedImages),
    criticalPanelsCount,
    criticalPanelsBlocked,
    criticalPanelsMissingQa,
    reviewBlockedReason,
  };
}

