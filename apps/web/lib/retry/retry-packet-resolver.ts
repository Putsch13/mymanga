/**
 * RetryPacketResolver — packet-aware retry.
 *
 * Quand un panel a été généré via le compilateur visuel canonique, son
 * `metadata.canonicalPacket` contient le prompt final anglais structuré,
 * le negative prompt canonique et le payload provider. Le retry doit
 * repartir de cette base, pas d'un `sceneImage.prompt` legacy.
 *
 * Ce module :
 *  - lit le packet depuis `metadata.canonicalPacket`
 *  - calcule un plan de reroll packet-aware (via `planRerollForPacket`)
 *  - fusionne les overrides persistés avec les overrides du body courant
 *    selon la règle : `undefined` = preserve, `null` = clear, string = set
 */
import type {
  CanonicalImagePromptPacket,
  ImageIntentType,
} from "@manga-ai-studio/core";
import { planRerollForPacket, type RerollReason } from "@manga-ai-studio/ai";

export interface RetryPacketBase {
  packet: CanonicalImagePromptPacket | null;
  /** Prompt de départ pour le retry : packet canonique uniquement. */
  basePrompt: string;
  baseNegativePrompt: string;
  source: "canonical" | "missing_canonical_packet";
  /** Version du packet (pour promptDebug). */
  packetVersion: string | null;
}

export interface ResolveRetryPacketBaseInput {
  metadataCanonicalPacket: unknown;
  /**
   * AUDIT COMMIT 3 — ces champs ne sont plus utilisés comme source de retry,
   * mais on les garde dans l'input pour ne pas casser les consumers existants
   * et pour permettre un éventuel log de debug. Ils ne peuvent JAMAIS servir
   * de fallback pour le retry canonique.
   */
  sceneImagePrompt?: string | null;
  sceneImageNegativePrompt?: string | null;
}

/**
 * AUDIT COMMIT 3 — Retry packet resolver strictement canonique.
 *
 * Avant : si `metadata.canonicalPacket` était absent/invalide, on reparait
 * silencieusement depuis `sceneImage.prompt` (legacy). Résultat : les retries
 * reproduisaient les erreurs du premier rendu en recyclant des prompts pollués.
 *
 * Maintenant : si le packet canonique est absent ou invalide, on renvoie un
 * état `missing_canonical_packet` exploitable par la route retry pour refuser
 * la régénération avec un message explicite. Aucun fallback legacy.
 */
export function resolveRetryPacketBase(
  input: ResolveRetryPacketBaseInput,
): RetryPacketBase {
  const raw = input.metadataCanonicalPacket;
  const packet = (raw && typeof raw === "object" && "finalEnglishStructuredPrompt" in raw
    ? (raw as CanonicalImagePromptPacket)
    : null);
  if (packet && typeof packet.finalEnglishStructuredPrompt === "string" && packet.finalEnglishStructuredPrompt.trim().length > 0) {
    return {
      packet,
      basePrompt: packet.finalEnglishStructuredPrompt,
      baseNegativePrompt:
        typeof packet.negativePromptEnglish === "string" && packet.negativePromptEnglish.trim().length > 0
          ? packet.negativePromptEnglish
          : "",
      source: "canonical",
      packetVersion: packet.packetVersion ?? null,
    };
  }
  return {
    packet: null,
    basePrompt: "",
    baseNegativePrompt: "",
    source: "missing_canonical_packet",
    packetVersion: null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Override merging — règle tri-état : undefined=preserve, null=clear, string=set
// ────────────────────────────────────────────────────────────────────────────

/** Valeur mergeable : `undefined` preserve, `null` clear, sinon set. */
export type MergeableValue<T> = T | null | undefined;

/** Applique la règle undefined=preserve / null=clear / string=set. */
export function mergeOverrideField<T>(previous: T | null | undefined, incoming: MergeableValue<T>): T | null {
  if (incoming === undefined) {
    return previous ?? null;
  }
  if (incoming === null) {
    return null;
  }
  return incoming;
}

export interface RetryOverridesPersistShape {
  userPromptAdditions: string | null;
  userPromptExclusions: string | null;
  forceOverrides: Record<string, unknown>;
  updatedAt: string;
}

export interface ResolveEffectiveRetryOverridesInput {
  previous: Partial<RetryOverridesPersistShape> | null | undefined;
  body: {
    userPromptAdditions?: string | null;
    userPromptExclusions?: string | null;
    forceOverrides?: Record<string, unknown> | null;
  };
}

export interface ResolveEffectiveRetryOverridesResult {
  persisted: RetryOverridesPersistShape | null;
  hasOverride: boolean;
  effectiveUserPromptAdditions: string | null;
  effectiveUserPromptExclusions: string | null;
  effectiveForceOverrides: Record<string, unknown>;
}

/**
 * Fusionne les overrides persistés avec ceux du body courant en respectant
 * la règle tri-état. Exemple :
 *  - previous = { userPromptAdditions: "hello", exclusions: "bad" }
 *  - body = { userPromptAdditions: null, exclusions: undefined }
 *  - result = { additions: null (cleared), exclusions: "bad" (preserved) }
 */
export function resolveEffectiveRetryOverrides(
  input: ResolveEffectiveRetryOverridesInput,
): ResolveEffectiveRetryOverridesResult {
  const prev = input.previous ?? null;
  const body = input.body ?? {};

  const mergedAdditions = mergeOverrideField<string>(
    prev?.userPromptAdditions ?? null,
    body.userPromptAdditions,
  );
  const mergedExclusions = mergeOverrideField<string>(
    prev?.userPromptExclusions ?? null,
    body.userPromptExclusions,
  );

  let mergedForce: Record<string, unknown> = { ...(prev?.forceOverrides ?? {}) };
  if (body.forceOverrides === null) {
    mergedForce = {};
  } else if (body.forceOverrides && typeof body.forceOverrides === "object") {
    for (const [k, v] of Object.entries(body.forceOverrides)) {
      if (v === undefined) continue;
      if (v === null) {
        delete mergedForce[k];
      } else {
        mergedForce[k] = v;
      }
    }
  }

  const hasOverride =
    mergedAdditions !== null ||
    mergedExclusions !== null ||
    Object.keys(mergedForce).length > 0;

  const persisted: RetryOverridesPersistShape | null = hasOverride
    ? {
        userPromptAdditions: mergedAdditions,
        userPromptExclusions: mergedExclusions,
        forceOverrides: mergedForce,
        updatedAt: new Date().toISOString(),
      }
    : null;

  return {
    persisted,
    hasOverride,
    effectiveUserPromptAdditions: mergedAdditions,
    effectiveUserPromptExclusions: mergedExclusions,
    effectiveForceOverrides: mergedForce,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Packet-aware reroll plan for retry
// ────────────────────────────────────────────────────────────────────────────

export function mapRetryModeToRerollReason(
  retryMode: string | null | undefined,
): RerollReason {
  switch (retryMode) {
    case "character":
      return "drift_character";
    case "environment":
      return "drift_environment";
    case "style":
      return "drift_style";
    case "composition":
      return "wrong_framing";
    case "interaction":
      return "wrong_dominant_subject";
    case "policy":
      return "policy_violation";
    default:
      return "user_request";
  }
}

export interface BuildPacketAwareRetryPromptInput {
  packet: CanonicalImagePromptPacket;
  retryMode: string | null | undefined;
  attemptIndex: number;
  positiveAugment: string;
  negativeAugment: string;
  userPromptAdditions: string | null;
  userPromptExclusions: string | null;
}

export interface BuildPacketAwareRetryPromptResult {
  positivePrompt: string;
  negativePrompt: string;
  referencePolicyOverride: "STRONG" | "LIGHT" | "NONE" | null;
  extraNegativeTokens: string[];
  extraPromptHints: string[];
  allowed: boolean;
  reason: string;
  intent: ImageIntentType;
}

/**
 * AUDIT COMMIT 11 — normalizePromptParts
 *
 * Avant : on faisait `positiveParts.join(", ")` sans dédup ni garde de
 * longueur. Ça laissait passer des doublons ("manga style, manga style"),
 * des entrées vides, des doubles espaces et des prompts qui dépassaient
 * largement la fenêtre utile du modèle.
 *
 * Cette fonction normalise un tableau de fragments de prompt :
 *   - trim de chaque entrée
 *   - compression des espaces internes
 *   - suppression des entrées vides
 *   - dédup exacte (case-insensitive, après normalisation)
 *   - plafond `maxLength` dur
 */
export function normalizePromptParts(
  parts: ReadonlyArray<string | null | undefined>,
  options: { maxLength?: number } = {},
): string {
  const maxLength = typeof options.maxLength === "number" && options.maxLength > 0
    ? options.maxLength
    : 1800;

  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const raw of parts) {
    if (typeof raw !== "string") continue;
    const compressed = raw.replace(/\s+/g, " ").trim();
    if (compressed.length === 0) continue;
    const key = compressed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(compressed);
  }

  const joined = cleaned.join(", ");
  if (joined.length <= maxLength) return joined;

  const hard = joined.slice(0, maxLength);
  const lastComma = hard.lastIndexOf(",");
  if (lastComma > maxLength * 0.6) return hard.slice(0, lastComma).trim();
  return hard.trim();
}

export function buildPacketAwareRetryPrompt(
  input: BuildPacketAwareRetryPromptInput,
): BuildPacketAwareRetryPromptResult {
  const reason = mapRetryModeToRerollReason(input.retryMode);
  const plan = planRerollForPacket(input.packet, reason, input.attemptIndex);

  const positivePrompt = normalizePromptParts([
    input.packet.finalEnglishStructuredPrompt,
    ...plan.extraPromptHints,
    input.positiveAugment,
    input.userPromptAdditions ?? "",
  ]);

  const negativePrompt = normalizePromptParts([
    input.packet.negativePromptEnglish ?? "",
    ...plan.extraNegativeTokens,
    input.negativeAugment,
    input.userPromptExclusions ?? "",
  ]);

  return {
    positivePrompt,
    negativePrompt,
    referencePolicyOverride: plan.forcedReferencePolicy ?? null,
    extraNegativeTokens: plan.extraNegativeTokens,
    extraPromptHints: plan.extraPromptHints,
    allowed: plan.allowed,
    reason: plan.reason,
    intent: input.packet.imageIntentType,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Zod retry body schema (exported for route validation)
// ────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

const retrySubjectFocusSchema = z.enum([
  "hero",
  "npc",
  "important_npc",
  "enemy",
  "antagonist",
  "environment",
  "group",
  "prop",
  "reaction",
  "aftermath",
]);

const retryShotTypeSchema = z.enum([
  "wide",
  "medium",
  "closeup",
  "extreme_closeup",
  "over_shoulder",
]);

const retryModeSchema = z.enum([
  "character",
  "environment",
  "style",
  "composition",
  "interaction",
  "policy",
]);

/**
 * Zod schema strict pour le body du retry.
 * - Supporte les trois états : absent = preserve, null = clear, string = set
 * - Les champs string sont plafonnés pour éviter les prompts abusifs
 */
export const retryBodySchema = z.object({
  mode: retryModeSchema.optional(),
  targetCharacterId: z.string().min(1).max(200).optional(),
  userPromptAdditions: z.union([z.string().max(400), z.null()]).optional(),
  userPromptExclusions: z.union([z.string().max(200), z.null()]).optional(),
  forceOverrides: z
    .union([
      z.object({
        shotType: z.union([retryShotTypeSchema, z.null()]).optional(),
        subjectFocus: z.union([retrySubjectFocusSchema, z.null()]).optional(),
        cameraAngle: z.union([z.string().max(100), z.null()]).optional(),
        forcedCharacterNames: z.union([z.array(z.string().max(200)).max(10), z.null()]).optional(),
      }),
      z.null(),
    ])
    .optional(),
});

export type RetryBodyParsed = z.infer<typeof retryBodySchema>;
