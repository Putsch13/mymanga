import type { RenderingMode } from "./rendering-modes";

export type CanonPackCompleteness = {
  requiredSlotsFilled: number;
  requiredSlotsTotal: number;
  isComplete: boolean;
};

export type SceneRegenerationContext = {
  hasSourceImage: boolean;
  preferredWorkflow: "inpaint" | "img2img" | "txt2img";
};

export type MultiCharacterSceneCheck = {
  characterCount: number;
  referenceImageCount: number;
  satisfiesTwoRefs: boolean;
};

/**
 * Règles de production cohérence (spec delta).
 */
export function canProducePanelFinal(canon: CanonPackCompleteness): {
  allowed: boolean;
  reason: string;
} {
  if (!canon.isComplete) {
    return {
      allowed: false,
      reason: "Character canon pack incomplet : aucune image PANEL_FINAL sans pack canon validé.",
    };
  }
  return { allowed: true, reason: "ok" };
}

export function requiresStylePackForSceneVariation(hasStylePack: boolean): {
  allowed: boolean;
  reason: string;
} {
  if (!hasStylePack) {
    return {
      allowed: false,
      reason: "Style pack requis pour les variations de scène majeures.",
    };
  }
  return { allowed: true, reason: "ok" };
}

export function multiCharacterReferenceRule(check: MultiCharacterSceneCheck): {
  allowed: boolean;
  reason: string;
} {
  if (check.characterCount >= 2 && check.referenceImageCount < 2) {
    return {
      allowed: false,
      reason: "Scène multi-personnages : au moins 2 références personnages requises.",
    };
  }
  return { allowed: true, reason: "ok" };
}

export function regenerationWorkflowPreference(ctx: SceneRegenerationContext): SceneRegenerationContext["preferredWorkflow"] {
  if (ctx.hasSourceImage) return "inpaint";
  return "txt2img";
}

export function isTxt2imgReservedForConcept(mode: RenderingMode): boolean {
  return (
    mode === "LOCATION_KEYFRAME" ||
    mode === "CHARACTER_SHEET" ||
    mode === "STYLE_TRANSFER_VARIATION"
  );
}

export function finalImageRequiresConsistencyScore(score: number | null, minScore: number): {
  pass: boolean;
  reason: string;
} {
  if (score === null || score === undefined) {
    return { pass: false, reason: "Score de cohérence manquant pour image finale." };
  }
  if (score < minScore) {
    return { pass: false, reason: `Score ${score} sous le seuil ${minScore} : retry ou workflow correction.` };
  }
  return { pass: true, reason: "ok" };
}
