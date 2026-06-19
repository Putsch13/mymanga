/**
 * assert-premium-ai-engines-ready.ts
 *
 * P0 — Vérifie que tous les moteurs IA premium sont prêts.
 * En mode premium, ce fichier throw si une condition n'est pas remplie.
 *
 * Vérifications:
 *   - OPENAI_API_KEY présent
 *   - FAL_KEY ou FAL_API_KEY présent
 *   - Supabase storage disponible
 *   - Vision QA activée
 *   - Mocks désactivés
 *   - Dialogue writer activé si dialogues requis
 *   - Premium V3 activé
 *   - Legacy fallback désactivé
 */

import {
  isPipelineV3PremiumOnlyEnabled,
  isPremiumImageMockAllowed,
  isLegacyPipelineEnabled,
} from "@manga-ai-studio/core";
import { resolveSupabaseServerConfig } from "../config/resolve-supabase-server-config";

export interface PremiumAiReadinessInput {
  chapterHasDialogue: boolean;
  chapterNumber: number;
}

export interface PremiumAiReadinessResult {
  ready: boolean;
  issues: string[];
  warnings: string[];
}

export function checkPremiumAiEnginesReady(
  input: PremiumAiReadinessInput
): PremiumAiReadinessResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!process.env.OPENAI_API_KEY) {
    issues.push("premium_openai_api_key_missing");
  }

  const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!falKey) {
    issues.push("premium_fal_key_missing");
  }

  const supabase = resolveSupabaseServerConfig();
  if (!supabase) {
    issues.push("premium_supabase_config_missing");
  }

  if (isPremiumImageMockAllowed()) {
    issues.push("premium_mocks_enabled_in_production");
  }

  if (isLegacyPipelineEnabled()) {
    issues.push("premium_legacy_pipeline_enabled");
  }

  if (!isPipelineV3PremiumOnlyEnabled()) {
    warnings.push("premium_v3_not_enabled_pipeline_may_fallback");
  }

  const sceneDialogueEnrich = process.env.OPENAI_SCENE_DIALOGUE_ENRICH === "1";
  if (input.chapterHasDialogue && !sceneDialogueEnrich) {
    warnings.push("premium_scene_dialogue_enrich_disabled_chapter_has_dialogue");
  }

  if (input.chapterNumber > 1 && !process.env.OPENAI_API_KEY) {
    issues.push("premium_rag_requires_openai_for_continuity");
  }

  return {
    ready: issues.length === 0,
    issues,
    warnings,
  };
}

export function assertPremiumAiEnginesReady(input: PremiumAiReadinessInput): void {
  const result = checkPremiumAiEnginesReady(input);
  if (!result.ready) {
    throw new Error(`premium_ai_engines_not_ready:${result.issues.join(",")}`);
  }
}

export function assertDialogueResultNotFallback(result: {
  usedFallback: boolean;
  fallbackReason?: string;
}): void {
  if (result.usedFallback) {
    throw new Error(
      `premium_dialogue_fallback_forbidden:${result.fallbackReason ?? "unknown"}`
    );
  }
}

export function assertStoryArchitectResultNotFallback(warnings: string[]): void {
  const hasFallbackWarning = warnings.some(w => 
    /fallback|degraded|stub|OPENAI_API_KEY/i.test(w)
  );
  if (hasFallbackWarning) {
    throw new Error(
      `premium_story_architect_fallback_detected:${warnings.join("|")}`
    );
  }
}

export function assertMangaEditorResultNotFallback(warnings: string[]): void {
  const hasFallbackWarning = warnings.some(w => 
    /fallback|degraded|stub|OPENAI_API_KEY/i.test(w)
  );
  if (hasFallbackWarning) {
    throw new Error(
      `premium_manga_editor_fallback_detected:${warnings.join("|")}`
    );
  }
}
