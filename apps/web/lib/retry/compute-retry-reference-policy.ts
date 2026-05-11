/**
 * P5.2 — Pre-drift detection + retry reference policy resolution.
 *
 * Avant l'extraction, ces ~110 lignes vivaient dans la route `/retry`.
 * On les centralise ici pour pouvoir les tester et garder la route en
 * pure orchestration. Le contrat reste identique : on retourne le
 * resultat brut de `detectVisualDrift`, la décision de policy issue
 * de `resolveRetryReferencePolicy`, et la policy effective
 * (clamp `LIGHT` si environment/composition + drift recommande character_reroll).
 */
import { detectVisualDrift } from "@manga-ai-studio/ai";
import {
  resolveRetryReferencePolicy,
  type RetryMode,
  type RetryReferencePolicy,
} from "@/lib/images/retry-reference-policy";
import type { resolveChapterLookProfile } from "@manga-ai-studio/core";

type JsonRecord = Record<string, unknown>;

export type DriftCharacterEnriched = NonNullable<
  Parameters<typeof detectVisualDrift>[0]["characters"]
>[number];

export interface ComputeRetryReferencePolicyInput {
  retryMode: RetryMode | null;
  metadata: JsonRecord;
  prompt: string;
  driftCharactersEnriched: DriftCharacterEnriched[];
  panelLoras: unknown[];
  referenceImageUrls: string[];
  retryStableReferences: Array<{ sourceType: string }>;
  hasCanonRef: boolean;
  hasMandatoryProps: boolean;
  /**
   * Récupère le `chapterLookProfile` à partir d'un mode persisté en metadata.
   * Injecté pour éviter une dépendance directe sur `@manga-ai-studio/core`
   * (la route le résout déjà via un dynamic import).
   */
  resolveLookProfile: typeof resolveChapterLookProfile;
}

export interface ComputeRetryReferencePolicyOutput {
  preDriftResult: ReturnType<typeof detectVisualDrift> | null;
  retryReferenceDecision: ReturnType<typeof resolveRetryReferencePolicy>;
  effectiveReferencePolicy: RetryReferencePolicy;
  hasLookProfile: boolean;
  hasFingerprint: boolean;
  hasSceneAnchor: boolean;
  hasSceneReferences: boolean;
  hasStyleReferences: boolean;
  retryLookProfile: ReturnType<typeof resolveChapterLookProfile> | null;
  retryIntentCard: Parameters<typeof detectVisualDrift>[0]["intentCard"] | undefined;
  retrySceneAnchor: Parameters<typeof detectVisualDrift>[0]["sceneAnchor"] | undefined;
}

export function computeRetryReferencePolicy(
  input: ComputeRetryReferencePolicyInput,
): ComputeRetryReferencePolicyOutput {
  const {
    retryMode,
    metadata,
    prompt,
    driftCharactersEnriched,
    panelLoras,
    referenceImageUrls,
    retryStableReferences,
    hasCanonRef,
    hasMandatoryProps,
    resolveLookProfile,
  } = input;

  const hasSceneReferences = retryStableReferences.some(
    (ref) => ref.sourceType === "scene_keyframe" || ref.sourceType === "media_asset",
  );
  const hasStyleReferences = panelLoras.length > 0 || referenceImageUrls.length > 0;

  const hasLookProfile = typeof metadata.chapterLookProfileMode === "string";
  const hasFingerprint = driftCharactersEnriched.length > 0;
  const hasSceneAnchor = metadata.sceneAnchor != null && typeof metadata.sceneAnchor === "object";

  const lookProfileMode = typeof metadata.chapterLookProfileMode === "string"
    ? metadata.chapterLookProfileMode as Parameters<typeof resolveLookProfile>[0]
    : null;
  const retryLookProfile = lookProfileMode ? resolveLookProfile(lookProfileMode) : null;
  const retryIntentCard = metadata.intentCard as Parameters<typeof detectVisualDrift>[0]["intentCard"] | undefined;
  const retrySceneAnchor = metadata.sceneAnchor as Parameters<typeof detectVisualDrift>[0]["sceneAnchor"] | undefined;

  const preDriftResult = driftCharactersEnriched.length > 0
    ? detectVisualDrift({
        prompt,
        characters: driftCharactersEnriched,
        usedLoras: panelLoras.length > 0,
        usedRefs: referenceImageUrls.length > 0,
        panelCategory: typeof metadata.panelCategory === "string" ? metadata.panelCategory : null,
        beatEventType:
          (retryIntentCard as { beatEventType?: string } | undefined)?.beatEventType
          ?? (typeof metadata.beatEventType === "string" ? metadata.beatEventType : null),
        chapterLookProfile: retryLookProfile,
        sceneAnchor: retrySceneAnchor ?? null,
        intentCard: retryIntentCard ?? null,
      })
    : null;

  const retryReferenceDecision = resolveRetryReferencePolicy({
    retryMode,
    metadata,
    hasReusableCharacterLock: hasCanonRef,
    recommendedAction: preDriftResult?.recommendedAction ?? null,
    hasLookProfile,
    hasFingerprint,
    hasSceneAnchor,
    hasMandatoryProps,
    hasSceneReferences,
    hasStyleReferences,
  });

  // Si le drift pré-reroll recommande un character_reroll mais que le mode est environment,
  // on force au moins LIGHT pour préserver le personnage.
  const effectiveReferencePolicy: RetryReferencePolicy = (() => {
    const base = retryReferenceDecision.referencePolicy;
    if (
      preDriftResult?.recommendedAction === "character_reroll"
      && (retryMode === "environment" || retryMode === "composition")
      && base === "NONE"
      && hasCanonRef
    ) {
      return "LIGHT";
    }
    return base;
  })();

  return {
    preDriftResult,
    retryReferenceDecision,
    effectiveReferencePolicy,
    hasLookProfile,
    hasFingerprint,
    hasSceneAnchor,
    hasSceneReferences,
    hasStyleReferences,
    retryLookProfile,
    retryIntentCard,
    retrySceneAnchor,
  };
}
