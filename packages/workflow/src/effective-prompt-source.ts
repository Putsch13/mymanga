/**
 * EffectivePromptSource — résolveur unique du prompt réellement envoyé au
 * provider.
 *
 * Règle cible :
 *   - si un `CanonicalImagePromptPacket` est présent ET que son preflight
 *     validation est valide → on utilise les prompts canoniques
 *     (`finalEnglishStructuredPrompt` + `negativePromptEnglish`).
 *   - sinon → fallback legacy (`item.panel.prompt` / `item.panel.negativePrompt`).
 *
 * Ce helper est la source de vérité unique : `validatePreflightPanel`,
 * `generateAttempt`, les rerolls, la reinforcement pass et les snapshots
 * metadata doivent tous passer par ici.
 */

import type { CanonicalImagePromptPacket } from "@manga-ai-studio/core";

export type PromptSourceKind = "canonical" | "legacy";

export interface EffectivePromptSource {
  prompt: string;
  negativePrompt: string;
  source: PromptSourceKind;
  usedPacket: boolean;
  packetVersion: string | null;
  warnings: string[];
}

export interface ResolveEffectivePromptSourceInput {
  canonicalPacket: CanonicalImagePromptPacket | null;
  canonicalPacketValidation: { valid: boolean; errors: string[]; warnings: string[] } | null;
  legacyPrompt: string;
  legacyNegativePrompt: string;
}

export function resolveEffectivePanelPromptSource(
  input: ResolveEffectivePromptSourceInput,
): EffectivePromptSource {
  const { canonicalPacket, canonicalPacketValidation, legacyPrompt, legacyNegativePrompt } = input;

  const warnings: string[] = [];
  const canonicalPromptOk = Boolean(
    canonicalPacket &&
      typeof canonicalPacket.finalEnglishStructuredPrompt === "string" &&
      canonicalPacket.finalEnglishStructuredPrompt.trim().length > 0,
  );
  const validationOk = canonicalPacketValidation ? canonicalPacketValidation.valid : true;

  if (canonicalPacket && canonicalPromptOk && validationOk) {
    const prompt = canonicalPacket.finalEnglishStructuredPrompt;
    const negativePrompt =
      canonicalPacket.negativePromptEnglish && canonicalPacket.negativePromptEnglish.trim().length > 0
        ? canonicalPacket.negativePromptEnglish
        : legacyNegativePrompt;
    if (!canonicalPacket.negativePromptEnglish) {
      warnings.push("canonical_negative_prompt_missing_fell_back_to_legacy");
    }
    return {
      prompt,
      negativePrompt,
      source: "canonical",
      usedPacket: true,
      packetVersion: canonicalPacket.packetVersion ?? null,
      warnings,
    };
  }

  if (canonicalPacket && !canonicalPromptOk) {
    warnings.push("canonical_packet_missing_final_english_prompt");
  }
  if (canonicalPacket && !validationOk) {
    warnings.push(
      `canonical_packet_preflight_invalid:${(canonicalPacketValidation?.errors ?? []).slice(0, 3).join("|")}`,
    );
  }

  return {
    prompt: legacyPrompt,
    negativePrompt: legacyNegativePrompt,
    source: "legacy",
    usedPacket: false,
    packetVersion: canonicalPacket?.packetVersion ?? null,
    warnings,
  };
}

/**
 * Construit la structure `promptDebug` persistée dans `SceneImage.metadata`.
 * Source de vérité pour la review UI et pour les retries packet-aware.
 */
export interface PromptDebugSnapshot {
  finalPrompt: string;
  finalNegativePrompt: string;
  promptSource: PromptSourceKind;
  usedPacket: boolean;
  packetVersion: string | null;
  provider: string | null;
  model: string | null;
  referencePolicy: "NONE" | "LIGHT" | "STRONG" | null;
  width: number | null;
  height: number | null;
  refsCount: number;
  lorasCount: number;
  seed: number | null;
  requestedAt: string;
  warnings: string[];
}

export interface BuildPromptDebugSnapshotInput {
  effective: EffectivePromptSource;
  provider: string | null;
  model: string | null;
  referencePolicy: "NONE" | "LIGHT" | "STRONG" | null;
  width: number | null;
  height: number | null;
  refsCount: number;
  lorasCount: number;
  seed: number | null;
  extraWarnings?: string[];
}

export function buildPromptDebugSnapshot(
  input: BuildPromptDebugSnapshotInput,
): PromptDebugSnapshot {
  return {
    finalPrompt: input.effective.prompt,
    finalNegativePrompt: input.effective.negativePrompt,
    promptSource: input.effective.source,
    usedPacket: input.effective.usedPacket,
    packetVersion: input.effective.packetVersion,
    provider: input.provider,
    model: input.model,
    referencePolicy: input.referencePolicy,
    width: input.width,
    height: input.height,
    refsCount: input.refsCount,
    lorasCount: input.lorasCount,
    seed: input.seed,
    requestedAt: new Date().toISOString(),
    warnings: [...input.effective.warnings, ...(input.extraWarnings ?? [])],
  };
}
