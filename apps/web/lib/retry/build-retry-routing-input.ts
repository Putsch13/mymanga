/**
 * P5.2 — Reconstruction du `RoutingContext` + `GenerateInput` pour un retry.
 *
 * Avant l'extraction, ces ~120 lignes vivaient dans la route. La logique :
 *  - lit le `panelContract` + `shotPlan` persistés en metadata
 *  - normalise les enums via `readShotPlanEnumsFromJson` (P1.2 sprint 5)
 *  - applique les `forceOverrides` du body (BUG-13)
 *  - retourne le `RoutingContext` final + le payload de génération
 *
 * Pure : pas d'I/O. Idempotent.
 */
import { readShotPlanEnumsFromJson } from "@manga-ai-studio/core";
import type { resolvePremiumImageSize } from "@manga-ai-studio/ai";
import type { RetryMode, RetryReferencePolicy } from "@/lib/images/retry-reference-policy";

type JsonRecord = Record<string, unknown>;

type ShotType = "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
type SubjectFocus =
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

export interface RetryForceOverrides {
  shotType?: ShotType;
  subjectFocus?: SubjectFocus;
  cameraAngle?: string;
  forcedCharacterNames?: string[];
}

export interface BuildRetryRoutingInputArgs {
  metadata: JsonRecord;
  forceOverrides: RetryForceOverrides;
  retryMode: RetryMode | null;
  intensityLayer: string;
  adultEngine: string;
  charactersCountInScene: number;
  hasCanonRef: boolean;
  effectivePositivePrompt: string;
  effectiveNegativePrompt: string;
  premiumSize: ReturnType<typeof resolvePremiumImageSize>;
  panelLoras: unknown[];
  referenceImageUrls: string[];
  effectiveReferencePolicy: RetryReferencePolicy;
  rerollKind: string | null | undefined;
  retryReferenceDecision: unknown;
  /**
   * `heroPresent` calculé en amont par la route (dépend du resolver). On le
   * passe explicitement plutôt que dépendre de la résolution ici.
   */
  heroPresent: boolean;
}

export interface RetryRoutingDescriptor {
  retrySubjectFocus: string | null;
  retryShotType: string | null;
  retryCameraAngle: string | null;
  retryCutawayType: string | null;
  retryPurpose: string | null;
  /** L'objet `RoutingContext` à passer à `runRoutedImageGeneration` (premier arg). */
  routingContext: Record<string, unknown>;
  /** L'objet `GenerateInput` à passer à `runRoutedImageGeneration` (deuxième arg). */
  generateInput: Record<string, unknown>;
}

export function buildRetryRoutingInput(
  args: BuildRetryRoutingInputArgs,
): RetryRoutingDescriptor {
  const {
    metadata,
    forceOverrides,
    // `retryMode` reste dans `BuildRetryRoutingInputArgs` pour le futur
    // routing par mode (cf. FIX-14) — pas encore lu aujourd'hui.
    intensityLayer,
    adultEngine,
    charactersCountInScene,
    hasCanonRef,
    effectivePositivePrompt,
    effectiveNegativePrompt,
    premiumSize,
    panelLoras,
    referenceImageUrls,
    effectiveReferencePolicy,
    rerollKind,
    retryReferenceDecision,
    heroPresent,
  } = args;

  const panelContractMeta = (metadata.panelContract as JsonRecord | undefined) ?? {};
  const shotPlanMeta = ((metadata.panelDebugTrace as JsonRecord | undefined)?.shotPlan ?? {}) as JsonRecord;

  const contractEnums = readShotPlanEnumsFromJson(panelContractMeta, "retry-route/panelContract");
  const plannedMeta = (shotPlanMeta.planned as JsonRecord | undefined) ?? {};
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

  const heroFocus =
    retrySubjectFocus === "hero"
    && (retryShotType === "closeup" || retryShotType === "extreme_closeup")
    && (retryCutawayType === null
      || retryCutawayType === "none"
      || retryCutawayType === "enemy"
      || retryCutawayType === "enemy_reveal");

  const routingContext: Record<string, unknown> = {
    mode: "PANEL_DRAFT",
    contentIntensityLayer: intensityLayer,
    adultEngine,
    isNewCharacter: false,
    hasCanonReferences: hasCanonRef,
    characterCountInScene: charactersCountInScene > 0 ? charactersCountInScene : 1,
    heroPresent,
    heroFocus,
    shotType: (retryShotType as ShotType | undefined) ?? undefined,
    cameraAngle: retryCameraAngle ?? undefined,
    purpose: retryPurpose ?? undefined,
    subjectFocus: retrySubjectFocus as SubjectFocus | null | undefined,
    cutawayType: retryCutawayType,
    needsInpaint: false,
    needsPoseVariation: false,
    preferPhotorealCover: false,
    explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
    goreStylizedMature: false,
  };

  const generateInput: Record<string, unknown> = {
    mode: "PANEL_DRAFT",
    positivePrompt: effectivePositivePrompt,
    negativePrompt: effectiveNegativePrompt,
    width: premiumSize.width,
    height: premiumSize.height,
    loras: effectiveReferencePolicy === "NONE"
      ? undefined
      : (panelLoras.length > 0 ? panelLoras : undefined),
    referenceImageUrls: effectiveReferencePolicy === "NONE"
      ? undefined
      : (referenceImageUrls.length > 0 ? referenceImageUrls : undefined),
    providerParams: {
      contentIntensityLayer: intensityLayer,
      mode: "PANEL_DRAFT",
      referencePolicy: effectiveReferencePolicy,
      scenePass: "reroll",
      rerollKind,
      retryReferenceDecision,
    },
  };

  return {
    retrySubjectFocus,
    retryShotType,
    retryCameraAngle,
    retryCutawayType,
    retryPurpose,
    routingContext,
    generateInput,
  };
}
