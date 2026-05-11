import type {
  DominantSubjectType,
  PanelIntentType,
  ReferencePolicyIntent,
  RequiredReferenceSet,
} from "./types";

export function resolveReferencePolicy(
  intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
): ReferencePolicyIntent {
  if (dominantSubject === "hero" || intentType === "hero_portrait" || intentType === "hero_action") {
    return "STRONG";
  }
  if (dominantSubject === "duo" || dominantSubject === "group") {
    return "LIGHT";
  }
  if (dominantSubject === "environment" || dominantSubject === "prop" || dominantSubject === "aftermath") {
    return "NONE";
  }
  return "LIGHT";
}

export function buildRequiredReferenceSet(
  intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
): RequiredReferenceSet {
  const base: RequiredReferenceSet = {
    characterRefs: false,
    sceneRefs: false,
    styleRefs: true,
    environmentRefs: false,
  };

  if (
    dominantSubject === "hero"
    || dominantSubject === "duo"
    || dominantSubject === "enemy"
    || dominantSubject === "ally"
  ) {
    base.characterRefs = true;
  }
  if (dominantSubject === "environment" || dominantSubject === "aftermath") {
    base.environmentRefs = true;
    base.sceneRefs = true;
  }
  if (intentType === "environment_establishing" || intentType === "environment_transition") {
    base.sceneRefs = true;
    base.environmentRefs = true;
  }

  return base;
}
