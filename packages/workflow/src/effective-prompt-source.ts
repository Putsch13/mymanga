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
 * Mode strict (Phase 1 — "narrative truth")
 * -----------------------------------------
 * Le flag `MANGA_DISABLE_LEGACY_PANEL_PROMPTS=true` bloque le fallback
 * legacy. Quand il est actif et que le packet canonique est manquant ou
 * invalide, la résolution renvoie une source marquée `blocked`. L'appelant
 * doit alors soit ne pas émettre d'image, soit déclencher un rebuild du
 * packet — jamais envoyer le legacy prompt au provider.
 *
 * En dev ou pendant la migration, laisser le flag absent conserve le
 * comportement legacy + warning (comportement historique).
 *
 * Ce helper est la source de vérité unique : `validatePreflightPanel`,
 * `generateAttempt`, les rerolls, la reinforcement pass et les snapshots
 * metadata doivent tous passer par ici.
 */

import type { CanonicalImagePromptPacket } from "@manga-ai-studio/core";

export type PromptSourceKind = "canonical" | "legacy" | "blocked";

export interface EffectivePromptSource {
  prompt: string;
  negativePrompt: string;
  source: PromptSourceKind;
  usedPacket: boolean;
  packetVersion: string | null;
  warnings: string[];
  /**
   * True if the effective source is in a non-generation state (i.e. strict
   * mode blocked a legacy fallback). Callers MUST NOT send `prompt` to a
   * provider when this is true.
   */
  blocked?: boolean;
  /** Machine-readable block reason when `blocked` is true. */
  blockReason?:
    | "canonical_packet_missing"
    | "canonical_packet_invalid"
    | "canonical_prompt_empty";
}

export interface ResolveEffectivePromptSourceInput {
  canonicalPacket: CanonicalImagePromptPacket | null;
  canonicalPacketValidation: { valid: boolean; errors: string[]; warnings: string[] } | null;
  legacyPrompt: string;
  legacyNegativePrompt: string;
  /**
   * Override for strict mode. When `undefined`, the resolver reads the env
   * flag `MANGA_DISABLE_LEGACY_PANEL_PROMPTS`. Tests pass an explicit value.
   */
  strictCanonicalMode?: boolean;
}

function resolveStrictMode(override: boolean | undefined): boolean {
  if (typeof override === "boolean") return override;
  const env = process.env.MANGA_DISABLE_LEGACY_PANEL_PROMPTS;
  return env === "true" || env === "1";
}

export function resolveEffectivePanelPromptSource(
  input: ResolveEffectivePromptSourceInput,
): EffectivePromptSource {
  const { canonicalPacket, canonicalPacketValidation, legacyPrompt, legacyNegativePrompt } = input;

  const strict = resolveStrictMode(input.strictCanonicalMode);

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

  let blockReason: EffectivePromptSource["blockReason"] | undefined;
  if (!canonicalPacket) {
    blockReason = "canonical_packet_missing";
  } else if (!canonicalPromptOk) {
    warnings.push("canonical_packet_missing_final_english_prompt");
    blockReason = "canonical_prompt_empty";
  } else if (!validationOk) {
    warnings.push(
      `canonical_packet_preflight_invalid:${(canonicalPacketValidation?.errors ?? []).slice(0, 3).join("|")}`,
    );
    blockReason = "canonical_packet_invalid";
  }

  if (strict) {
    warnings.push("legacy_prompt_fallback_blocked_strict_mode");
    // In strict mode we still return the legacy text in the `prompt` field so
    // that debug UIs can show what *would* have been sent, but `blocked`
    // tells the provider layer to refuse the send.
    return {
      prompt: legacyPrompt,
      negativePrompt: legacyNegativePrompt,
      source: "blocked",
      usedPacket: false,
      packetVersion: canonicalPacket?.packetVersion ?? null,
      warnings,
      blocked: true,
      blockReason: blockReason ?? "canonical_packet_missing",
    };
  }

  if (canonicalPacket) {
    warnings.push("legacy_prompt_fallback_used");
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
  /** Phase 0 — mirror of `EffectivePromptSource.blocked` for audit UIs. */
  blocked?: boolean;
  blockReason?: EffectivePromptSource["blockReason"];
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
    blocked: input.effective.blocked,
    blockReason: input.effective.blockReason,
  };
}
