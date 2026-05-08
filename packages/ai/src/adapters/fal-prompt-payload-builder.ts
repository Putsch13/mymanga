/**
 * FalPromptPayloadBuilder
 *
 * Transforme un `CanonicalImagePromptPacket` (ou un sous-ensemble de ses
 * champs) en `ProviderPayload` pour fal.ai.
 *
 * Règles :
 *   - `prompt` = `finalEnglishStructuredPrompt` (jamais le FR)
 *   - `negativePrompt` = packet.negativePromptEnglish
 *   - `refs` / `ipAdapterRefs` = construits depuis bindings + modelRoutingDecision
 *   - dimensions par défaut adaptées au ratio manga
 *   - validation finale par intent (refuse les payloads contradictoires)
 */

import type {
  ImageIntentType,
  CanonicalImagePromptPacket,
  ModelRoutingDecision,
  ProviderPayload,
  ProviderRef,
  LoraBinding,
} from "@manga-ai-studio/core";
import { isNonHeroDominantIntent } from "@manga-ai-studio/core";
import {
  auditFalPrompt,
  flattenStructuredPromptForFal,
} from "../prompts/fal-prompt-flattener";

export interface FalPromptPayloadInput {
  packet: CanonicalImagePromptPacket;
  characterRefAssets: Array<{ characterId: string; assetId: string; url: string; kind: "face" | "body" | "full" }>;
  styleRefAssets: Array<{ assetId: string; url: string }>;
  sceneRefAssets: Array<{ assetId: string; url: string }>;
  width?: number;
  height?: number;
  guidanceScale?: number;
  seed?: number | null;
  extra?: Record<string, unknown>;
  /** Format projet : pilote l'en-tête médium dans le prompt FAL. */
  format?: "manga" | "webtoon" | "simple";
}

export interface FalPromptPayloadResult {
  payload: ProviderPayload;
  modelRoutingDecision: ModelRoutingDecision;
  validation: PayloadValidationResult;
}

export interface PayloadValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Model routing
// ────────────────────────────────────────────────────────────────────────────

function selectModelForIntent(
  intent: ImageIntentType,
  hasCharacterRefs: boolean,
): { modelId: string; referencePolicy: "STRONG" | "LIGHT" | "NONE"; reason: string } {
  if (isNonHeroDominantIntent(intent) && !hasCharacterRefs) {
    return {
      modelId: "fal-ai/flux-pro",
      referencePolicy: "NONE",
      reason: "non-hero-dominant intent, no character refs needed",
    };
  }
  if (
    intent === "environment_establishing" ||
    intent === "environment_transition" ||
    intent === "prop_insert" ||
    intent === "symbolic_insert" ||
    intent === "aftermath"
  ) {
    return {
      modelId: "fal-ai/flux-pro",
      referencePolicy: "LIGHT",
      reason: "environment/prop dominant — style lock only",
    };
  }
  if (
    intent === "hero_focus" ||
    intent === "hero_emotion" ||
    intent === "hero_reaction" ||
    intent === "hero_action"
  ) {
    return {
      modelId: "fal-ai/flux-pro-redux",
      referencePolicy: hasCharacterRefs ? "STRONG" : "LIGHT",
      reason: "hero-centric panel",
    };
  }
  if (
    intent === "hero_duo" ||
    intent === "hero_secondary_character" ||
    intent === "dialogue_two_shot"
  ) {
    return {
      modelId: "fal-ai/flux-pro-redux",
      referencePolicy: hasCharacterRefs ? "STRONG" : "LIGHT",
      reason: "duo panel — two readable characters",
    };
  }
  if (
    intent === "guard_group_focus" ||
    intent === "soldier_patrol" ||
    intent === "crowd_presence" ||
    intent === "group_conflict" ||
    intent === "group_presence" ||
    intent === "threat_group_focus"
  ) {
    return {
      modelId: "fal-ai/flux-pro",
      referencePolicy: "LIGHT",
      reason: "group panel — style over character lock",
    };
  }
  return {
    modelId: "fal-ai/flux-pro-redux",
    referencePolicy: hasCharacterRefs ? "LIGHT" : "NONE",
    reason: "default path",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Refs selection
// ────────────────────────────────────────────────────────────────────────────

function buildCharacterRefs(
  packet: CanonicalImagePromptPacket,
  available: FalPromptPayloadInput["characterRefAssets"],
): { refs: ProviderRef[]; ipAdapterRefs: ProviderRef[]; usedRefIds: string[]; usedIpAdapterIds: string[] } {
  const refs: ProviderRef[] = [];
  const ipAdapterRefs: ProviderRef[] = [];
  const usedRefIds: string[] = [];
  const usedIpAdapterIds: string[] = [];

  for (const char of packet.characterContext) {
    if (char.presenceMode === "absent") continue;
    const faces = available.filter((a) => a.characterId === char.characterId && a.kind === "face");
    const bodies = available.filter((a) => a.characterId === char.characterId && a.kind !== "face");
    const weight = char.visualWeight;

    for (const ref of faces) {
      ipAdapterRefs.push({ assetId: ref.assetId, url: ref.url, kind: "character", weight });
      usedIpAdapterIds.push(ref.assetId);
    }
    for (const ref of bodies) {
      refs.push({ assetId: ref.assetId, url: ref.url, kind: "character", weight });
      usedRefIds.push(ref.assetId);
    }
  }

  return { refs, ipAdapterRefs, usedRefIds, usedIpAdapterIds };
}

function buildStyleAndSceneRefs(
  packet: CanonicalImagePromptPacket,
  styleAssets: FalPromptPayloadInput["styleRefAssets"],
  sceneAssets: FalPromptPayloadInput["sceneRefAssets"],
): ProviderRef[] {
  const out: ProviderRef[] = [];
  for (const s of styleAssets) {
    out.push({ assetId: s.assetId, url: s.url, kind: "style", weight: 0.5 });
  }
  for (const s of sceneAssets) {
    out.push({ assetId: s.assetId, url: s.url, kind: "scene", weight: 0.4 });
  }
  // Non utilisé directement ici, mais utile pour packet.providerPayload.refs
  void packet;
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Dimensions
// ────────────────────────────────────────────────────────────────────────────

function defaultDimensionsForIntent(intent: ImageIntentType): { width: number; height: number } {
  // Manga portrait 3:4 par défaut, paysage pour establishing/aftermath
  if (
    intent === "environment_establishing" ||
    intent === "environment_transition" ||
    intent === "aftermath" ||
    intent === "crowd_presence" ||
    intent === "group_presence" ||
    intent === "group_conflict"
  ) {
    return { width: 1024, height: 768 };
  }
  if (
    intent === "hero_emotion" ||
    intent === "reaction_cutaway" ||
    intent === "hero_reaction"
  ) {
    return { width: 896, height: 1152 };
  }
  return { width: 896, height: 1152 };
}

// ────────────────────────────────────────────────────────────────────────────
// Validation finale
// ────────────────────────────────────────────────────────────────────────────

export function validatePayloadForIntent(
  packet: CanonicalImagePromptPacket,
  payload: ProviderPayload,
): PayloadValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const intent = packet.imageIntentType;
  const promptLower = payload.prompt.toLowerCase();

  // Rule 1: environment_establishing → interdire framing portrait
  if (intent === "environment_establishing" || intent === "environment_transition") {
    if (/\bportrait\b/.test(promptLower) || /close-?up/.test(promptLower)) {
      errors.push(`PORTRAIT_FRAMING_ON_ENVIRONMENT: prompt contains close-up/portrait tokens`);
    }
  }

  // Rule 2: prop_insert → interdire hero framing
  if (intent === "prop_insert" || intent === "symbolic_insert") {
    if (/hero (portrait|centered|full body)/.test(promptLower)) {
      errors.push(`HERO_FRAMING_ON_PROP: prompt contains hero framing tokens`);
    }
  }

  // Rule 3: shared_spotlight-like intents → exiger ≥2 sujets lisibles
  if (
    intent === "hero_duo" ||
    intent === "hero_secondary_character" ||
    intent === "dialogue_two_shot"
  ) {
    const readable = packet.subjectBalance.requiredReadableFaces;
    if (readable.length < 2) {
      errors.push(`SHARED_SPOTLIGHT_MISSING_SECOND_SUBJECT: requiredReadableFaces=${readable.length}`);
    }
  }

  // Rule 4: guard_group_focus → exiger groupContext présent
  if (
    intent === "guard_group_focus" ||
    intent === "soldier_patrol" ||
    intent === "threat_group_focus" ||
    intent === "crowd_presence"
  ) {
    if (!packet.groupContext) {
      errors.push(`GROUP_INTENT_MISSING_GROUP_CONTEXT: intent=${intent} but no groupContext`);
    }
  }

  // Rule 5: dialogue_two_shot → exiger au moins 2 personnages présents
  if (intent === "dialogue_two_shot") {
    const present = packet.characterContext.filter((c) => c.presenceMode !== "absent");
    if (present.length < 2) {
      errors.push(`DIALOGUE_TWO_SHOT_MISSING_SECOND_CHARACTER: present=${present.length}`);
    }
  }

  // Rule 6: content rating teen → interdire tokens incompatibles
  if (packet.contentRating === "teen" || packet.contentRating === "all_ages") {
    const forbiddenTokens = ["nude", "nudity", "explicit", "sexual", "gore", "dismembered"];
    for (const tok of forbiddenTokens) {
      if (promptLower.includes(tok)) {
        errors.push(`RATING_INCOMPATIBLE_TOKEN: "${tok}" not allowed under rating=${packet.contentRating}`);
      }
    }
  }

  // Rule 7: explicit_adult → routing adéquat requis
  if (packet.contentRating === "explicit_adult") {
    if (!packet.modelRoutingDecision.modelId.includes("adult") && !packet.modelRoutingDecision.modelId.includes("pro")) {
      warnings.push(`EXPLICIT_ADULT_ROUTING_UNCERTAIN: model=${packet.modelRoutingDecision.modelId}`);
    }
  }

  // Rule 8 (Sprint A — durcie) : le token `manga` DOIT apparaître dans les 50
  // premiers caractères. Un prompt diffusion où le style arrive à la fin est
  // noyé par les autres tokens ; FLUX privilégie largement la tête du prompt.
  if (!promptLower.includes("manga")) {
    errors.push(`MISSING_MANGA_MEDIUM_TOKEN: final prompt does not reference manga medium`);
  } else {
    const mangaIdx = promptLower.indexOf("manga");
    if (mangaIdx > 50) {
      errors.push(
        `MANGA_TOKEN_TOO_LATE: 'manga' appears at char ${mangaIdx}, max 50 for head-of-prompt weighting`,
      );
    }
  }

  // Rule 9 (Sprint A) : pas de marqueurs `[TAG]` résiduels (ceux-ci servent
  // au debug structuré et au LLM narratif, pas à la diffusion).
  if (/\[[A-Z_]+\]/.test(payload.prompt)) {
    errors.push(`TAG_MARKERS_PRESENT: structured [TAG] markers leaked into diffusion prompt`);
  }

  // Rule 10 (Sprint A) : pas de métadonnées de classification dans le prompt
  // diffusion (elles polluent le signal et ne guident pas l'image).
  if (/content rating:|audience\s+(teen|mature|all_ages|explicit)/i.test(payload.prompt)) {
    warnings.push(`CLASSIFICATION_IN_PROMPT: rating metadata present in diffusion prompt`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main builder
// ────────────────────────────────────────────────────────────────────────────

export function buildFalPromptPayload(input: FalPromptPayloadInput): FalPromptPayloadResult {
  const { packet } = input;

  const hasCharRefs = input.characterRefAssets.length > 0;
  const routing = selectModelForIntent(packet.imageIntentType, hasCharRefs);

  const { refs: charRefs, ipAdapterRefs, usedRefIds, usedIpAdapterIds } = buildCharacterRefs(
    packet,
    input.characterRefAssets,
  );
  const auxRefs = buildStyleAndSceneRefs(packet, input.styleRefAssets, input.sceneRefAssets);

  // Politique appliquée sur les refs : NONE purge tout, LIGHT garde style/scene seulement
  let finalRefs: ProviderRef[] = [];
  let finalIpAdapterRefs: ProviderRef[] = [];
  if (routing.referencePolicy === "STRONG") {
    finalRefs = [...charRefs, ...auxRefs];
    finalIpAdapterRefs = ipAdapterRefs;
  } else if (routing.referencePolicy === "LIGHT") {
    finalRefs = auxRefs;
    finalIpAdapterRefs = [];
  } else {
    finalRefs = [];
    finalIpAdapterRefs = [];
  }

  const dims = {
    width: input.width ?? defaultDimensionsForIntent(packet.imageIntentType).width,
    height: input.height ?? defaultDimensionsForIntent(packet.imageIntentType).height,
  };

  const modelRoutingDecision: ModelRoutingDecision = {
    modelId: routing.modelId,
    referencePolicy: routing.referencePolicy,
    usedRefAssetIds: routing.referencePolicy === "STRONG" ? usedRefIds : [],
    usedIpAdapterRefAssetIds: routing.referencePolicy === "STRONG" ? usedIpAdapterIds : [],
    reason: routing.reason,
  };

  const loraExtra = buildLoraExtraPayload(packet.loraBindings);

  // Sprint A — On ne passe PLUS le prompt structuré brut (avec `[TAG]` et
  // sauts de ligne) au provider. Il reste dans le packet pour debug/logs,
  // mais la diffusion reçoit un prompt dense manga-first.
  const flattenedPrompt = flattenStructuredPromptForFal(
    packet.finalEnglishStructuredPrompt,
    { maxLength: 1200, format: input.format ?? "manga" },
  );
  const promptAuditIssues = auditFalPrompt(flattenedPrompt);

  const payload: ProviderPayload = {
    prompt: flattenedPrompt,
    negativePrompt: packet.negativePromptEnglish,
    width: dims.width,
    height: dims.height,
    refs: finalRefs,
    ipAdapterRefs: finalIpAdapterRefs,
    guidanceScale: input.guidanceScale ?? 4.5,
    seed: input.seed ?? null,
    extra: {
      ...(input.extra ?? {}),
      ...loraExtra,
      modelId: routing.modelId,
      referencePolicy: routing.referencePolicy,
      promptAuditIssues: promptAuditIssues.length > 0 ? promptAuditIssues : undefined,
      structuredPromptForDebug: packet.finalEnglishStructuredPrompt,
    },
  };

  const packetWithDecision: CanonicalImagePromptPacket = {
    ...packet,
    modelRoutingDecision,
    providerPayload: payload,
  };

  const validation = validatePayloadForIntent(packetWithDecision, payload);

  return { payload, modelRoutingDecision, validation };
}

function buildLoraExtraPayload(loras: LoraBinding[]): Record<string, unknown> {
  if (loras.length === 0) return {};
  return {
    loras: loras.map((l) => ({
      id: l.loraId,
      name: l.loraName,
      scope: l.scope,
      weight: l.weight,
    })),
  };
}
