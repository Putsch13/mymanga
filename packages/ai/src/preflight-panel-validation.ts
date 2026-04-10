export interface PreflightPanelValidationInput {
  panelId: string;
  positivePrompt: string;
  negativePrompt?: string;
  shotType?: string | null;
  purpose?: string | null;
  mustShow?: string[];
  backgroundExtras?: string[];
  hasSceneKeyframe: boolean;
  hasCharacterLock: boolean;
  characterCount: number;
}

export interface PreflightPanelValidationResult {
  ok: boolean;
  reasons: string[];
  warnings: string[];
}

export function validatePreflightPanel(input: PreflightPanelValidationInput): PreflightPanelValidationResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const promptLength = input.positivePrompt.length;
  const wideOrNarrative = input.shotType === "wide" || input.purpose === "establishing" || input.characterCount >= 2;

  if (promptLength > 1800) {
    warnings.push("prompt_too_long");
  }
  if (wideOrNarrative && !input.hasSceneKeyframe) {
    reasons.push("missing_scene_keyframe");
  }
  if (wideOrNarrative && (input.mustShow?.length ?? 0) === 0 && (input.backgroundExtras?.length ?? 0) === 0) {
    reasons.push("missing_environment_signals");
  }
  if (!wideOrNarrative && input.characterCount > 0 && !input.hasCharacterLock) {
    warnings.push("character_lock_not_available");
  }
  if (!input.positivePrompt.trim()) {
    reasons.push("empty_positive_prompt");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    warnings,
  };
}
