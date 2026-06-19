/**
 * PacketAwareRerollAdvisor
 *
 * Sur reroll, ne jamais repartir d'un simple prompt texte :
 *   - conserver le `CanonicalImagePromptPacket` source,
 *   - conserver les refs utiles selon l'intent,
 *   - ne perdre ni la hiérarchie visuelle, ni la mémoire continuité.
 *
 * Retourne un "plan de reroll" expliquant quelles refs/paramètres
 * garder/changer selon le type d'intent et la cause du reroll.
 */

import type {
  CanonicalImagePromptPacket,
  ImageIntentType,
  ProviderPayload,
  ProviderRef,
} from "@manga-ai-studio/core";

export type RerollReason =
  | "drift_character"
  | "drift_environment"
  | "drift_style"
  | "wrong_framing"
  | "wrong_dominant_subject"
  | "low_quality"
  | "policy_violation"
  | "user_request";

export interface PacketRerollPlan {
  allowed: boolean;
  reason: string;
  keepRefs: boolean;
  keepIpAdapterRefs: boolean;
  keepSeed: boolean;
  bumpGuidance: number;
  extraNegativeTokens: string[];
  extraPromptHints: string[];
  forcedReferencePolicy?: "STRONG" | "LIGHT" | "NONE";
}

export function planRerollForPacket(
  packet: CanonicalImagePromptPacket,
  rerollReason: RerollReason,
  attempt: number,
): PacketRerollPlan {
  if (attempt >= 4) {
    return {
      allowed: false,
      reason: "MAX_RETRIES_REACHED",
      keepRefs: true,
      keepIpAdapterRefs: true,
      keepSeed: true,
      bumpGuidance: 0,
      extraNegativeTokens: [],
      extraPromptHints: [],
    };
  }

  const intent = packet.imageIntentType;
  const base: PacketRerollPlan = {
    allowed: true,
    reason: `reroll attempt ${attempt} for ${rerollReason}`,
    keepRefs: true,
    keepIpAdapterRefs: true,
    keepSeed: false,
    bumpGuidance: 0.3,
    extraNegativeTokens: [],
    extraPromptHints: [],
  };

  switch (rerollReason) {
    case "drift_character":
      return {
        ...base,
        forcedReferencePolicy: "STRONG",
        keepIpAdapterRefs: true,
        extraNegativeTokens: ["different character", "wrong face", "generic face"],
        extraPromptHints: ["keep exact canonical face features", "match character reference"],
      };
    case "drift_environment":
      return {
        ...base,
        keepRefs: true,
        extraPromptHints: [
          `preserve location: ${packet.environmentContext.locationName}`,
          ...packet.environmentContext.mustShowLocationSignals.map(
            (s) => `mandatory visual signal: ${s}`,
          ),
        ],
        extraNegativeTokens: ["wrong location", "generic backdrop"],
      };
    case "drift_style":
      return {
        ...base,
        extraPromptHints: [
          `strict manga style: ${packet.mangaStyleProfile.styleName}`,
          `inking: ${packet.mangaStyleProfile.inkingStyle}`,
        ],
        extraNegativeTokens: ["wrong style", "non-manga rendering", "photorealistic"],
      };
    case "wrong_framing":
      return {
        ...base,
        keepIpAdapterRefs: false,
        extraNegativeTokens: framingNegativesForIntent(intent),
        extraPromptHints: framingHintsForIntent(intent),
      };
    case "wrong_dominant_subject":
      return {
        ...base,
        keepIpAdapterRefs: false,
        forcedReferencePolicy: intent === "environment_establishing" ? "LIGHT" : undefined,
        extraPromptHints: [
          `dominant subject must be: ${packet.dominantSubjectKind}`,
          ...dominantSubjectHintsForIntent(intent),
        ],
        extraNegativeTokens: ["hero portrait", "hero centered", "hero lock"],
      };
    case "low_quality":
      return {
        ...base,
        bumpGuidance: 0.5,
        extraNegativeTokens: ["low quality", "blurry", "deformed"],
      };
    case "policy_violation":
      return {
        ...base,
        extraNegativeTokens: ratingNegatives(packet.contentRating),
        extraPromptHints: [`strict rating compliance: ${packet.contentRating}`],
      };
    case "user_request":
      return base;
  }
}

function framingNegativesForIntent(intent: ImageIntentType): string[] {
  if (intent === "environment_establishing" || intent === "environment_transition") {
    return ["close-up", "portrait framing", "face filling frame"];
  }
  if (intent === "prop_insert" || intent === "symbolic_insert") {
    return ["full body character", "wide establishing"];
  }
  if (
    intent === "hero_duo" ||
    intent === "hero_secondary_character" ||
    intent === "dialogue_two_shot"
  ) {
    return ["solo framing", "single subject"];
  }
  return [];
}

function framingHintsForIntent(intent: ImageIntentType): string[] {
  if (intent === "environment_establishing") return ["wide establishing shot", "full location visible"];
  if (intent === "prop_insert") return ["tight insert on the prop", "prop centered"];
  if (
    intent === "hero_duo" ||
    intent === "hero_secondary_character" ||
    intent === "dialogue_two_shot"
  ) {
    return ["two readable subjects", "shared spotlight"];
  }
  if (intent === "guard_group_focus" || intent === "soldier_patrol") {
    return ["group in readable formation", "multiple guards visible"];
  }
  return [];
}

function dominantSubjectHintsForIntent(intent: ImageIntentType): string[] {
  if (intent === "environment_establishing") return ["environment is the subject"];
  if (intent === "prop_insert") return ["prop is the subject"];
  if (intent === "reaction_cutaway") return ["reacting character is the subject"];
  if (intent === "guard_group_focus") return ["guards are the subject"];
  if (intent === "crowd_presence") return ["crowd is the subject"];
  return [];
}

function ratingNegatives(rating: CanonicalImagePromptPacket["contentRating"]): string[] {
  if (rating === "teen" || rating === "all_ages") {
    return ["nudity", "explicit sexual", "gore", "dismembered"];
  }
  return [];
}

/**
 * Applique un plan de reroll à un payload existant pour produire un
 * payload de retry (non-destructif : renvoie un nouvel objet).
 */
export function applyRerollPlanToPayload(
  payload: ProviderPayload,
  plan: PacketRerollPlan,
): ProviderPayload {
  const refs: ProviderRef[] = plan.keepRefs ? payload.refs : [];
  const ipAdapterRefs: ProviderRef[] = plan.keepIpAdapterRefs ? payload.ipAdapterRefs : [];

  const newNeg = [...payload.negativePrompt.split(",").map((s) => s.trim()).filter(Boolean)];
  for (const t of plan.extraNegativeTokens) {
    if (!newNeg.includes(t)) newNeg.push(t);
  }

  const hints = plan.extraPromptHints.length
    ? `\n[REROLL_HINTS] ${plan.extraPromptHints.join("; ")}.`
    : "";

  return {
    ...payload,
    prompt: payload.prompt + hints,
    negativePrompt: newNeg.join(", "),
    guidanceScale: (payload.guidanceScale ?? 4.5) + plan.bumpGuidance,
    seed: plan.keepSeed ? payload.seed : null,
    refs,
    ipAdapterRefs,
  };
}
