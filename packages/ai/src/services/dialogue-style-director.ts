/**
 * Profil de style dialogue dérivé du genre / ton / public — sans LLM.
 * Sert de guide pour le scene-writer et pour des répliques déterministes
 * à faible entropie (seed) quand l’IA est indisponible.
 */

export type DialogueStyleProfile = {
  density: "low" | "medium" | "high";
  subtextLevel: "low" | "medium" | "high";
  sentenceLength: "short" | "mixed" | "long";
  emotionalDirectness: "direct" | "balanced" | "restrained";
  humorAllowed: boolean;
  innerMonologueRatio: number;
  silenceRatio: number;
  vocabularyRegister: "simple" | "natural" | "literary" | "technical" | "rough";
  forbiddenPatterns: string[];
};

export type DialogueStyleDirectorInput = {
  genre?: string | null;
  tone?: string | null;
  contentRating?: string | null;
  /** ex. teen / mature — déduit du contentRating si absent */
  targetAudienceHint?: "all_ages" | "teen" | "mature" | "adult_restricted" | null;
};

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function audienceFromRating(contentRating?: string | null): DialogueStyleDirectorInput["targetAudienceHint"] {
  const r = norm(contentRating ?? "");
  if (r.includes("adult") || r.includes("18") || r.includes("explicit")) return "adult_restricted";
  if (r.includes("mature") || r.includes("16") || r.includes("17")) return "mature";
  if (r.includes("teen") || r.includes("13") || r.includes("12")) return "teen";
  return "all_ages";
}

/**
 * Déduit un profil lisible par le prompt dialoguiste (et des garde-fous).
 */
export function getDialogueStyleProfile(input: DialogueStyleDirectorInput): DialogueStyleProfile {
  const g = norm(input.genre ?? "");
  const t = norm(input.tone ?? "");
  const audience = input.targetAudienceHint ?? audienceFromRating(input.contentRating);

  const shonen = /shonen|shounen|action|aventure|combat/.test(g);
  const shojo = /shojo|shoujo|romance|slice/.test(g);
  const seinen = /seinen|drama|psychological|noir/.test(g);
  const horror = /horreur|horror|thriller|suspense/.test(g);
  const comedy = /comedie|comedy|gag/.test(g);

  let density: DialogueStyleProfile["density"] = "medium";
  let subtextLevel: DialogueStyleProfile["subtextLevel"] = "medium";
  let sentenceLength: DialogueStyleProfile["sentenceLength"] = "mixed";
  let emotionalDirectness: DialogueStyleProfile["emotionalDirectness"] = "balanced";
  let humorAllowed = comedy;
  let innerMonologueRatio = 0.35;
  let silenceRatio = 0.15;
  let vocabularyRegister: DialogueStyleProfile["vocabularyRegister"] = "natural";
  const forbiddenPatterns: string[] = [];

  if (shonen) {
    density = "medium";
    subtextLevel = "low";
    sentenceLength = "short";
    emotionalDirectness = "direct";
    innerMonologueRatio = 0.2;
    silenceRatio = 0.1;
  } else if (shojo) {
    density = "medium";
    subtextLevel = "high";
    sentenceLength = "mixed";
    emotionalDirectness = "balanced";
    innerMonologueRatio = 0.55;
    silenceRatio = 0.25;
  } else if (seinen) {
    density = "low";
    subtextLevel = "high";
    sentenceLength = "short";
    emotionalDirectness = "restrained";
    innerMonologueRatio = 0.4;
    silenceRatio = 0.3;
  } else if (horror) {
    density = "low";
    subtextLevel = "high";
    sentenceLength = "short";
    emotionalDirectness = "restrained";
    innerMonologueRatio = 0.25;
    silenceRatio = 0.45;
  }

  if (/grave|somber|dark/.test(t)) {
    emotionalDirectness = "restrained";
    silenceRatio = Math.min(0.55, silenceRatio + 0.1);
  }

  if (audience === "all_ages") {
    forbiddenPatterns.push("grossier", "sexuel explicite", "gore détaillé");
    emotionalDirectness = emotionalDirectness === "direct" ? "balanced" : emotionalDirectness;
  }
  if (audience === "teen") {
    forbiddenPatterns.push("contenu adulte explicite");
  }
  if (audience === "adult_restricted") {
    forbiddenPatterns.push("mineur sexualisé", "contenu illégal", "non-consentement explicite");
  }

  return {
    density,
    subtextLevel,
    sentenceLength,
    emotionalDirectness,
    humorAllowed,
    innerMonologueRatio,
    silenceRatio,
    vocabularyRegister,
    forbiddenPatterns,
  };
}

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function hashSeed(...parts: string[]): number {
  let h = FNV_OFFSET >>> 0;
  const flat = parts.join("|");
  for (let i = 0; i < flat.length; i++) {
    h ^= flat.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/**
 * Réplique courte déterministe (évite les phrases « catalogue » historiques).
 */
export function pickDeterministicFallbackLine(args: {
  seed: string;
  profile: DialogueStyleProfile;
  kind: "approach" | "hesitation" | "interrupt" | "gaze" | "decision";
}): { mode: "dialogue" | "thought" | "narration"; text: string } {
  const idx = hashSeed(args.seed, args.kind) % 6;
  const { emotionalDirectness, subtextLevel } = args.profile;

  const pools: Record<typeof args.kind, string[][]> = {
    approach: [
      ["dialogue", "On peut parler une seconde ?"],
      ["dialogue", "J’ai besoin de te voir."],
      ["thought", "Encore un pas. Juste un."],
      ["dialogue", "Attends — avant que tu partes."],
      ["thought", "Pourquoi c’est si dur d’ouvrir la bouche ?"],
      ["dialogue", "Je ne veux pas rater ce moment."],
    ],
    hesitation: [
      ["thought", "Respire. Ce n’est pas encore trop tard."],
      ["thought", "Les mots tournent, puis se figent."],
      ["dialogue", "Je… je ne sais pas par où commencer."],
      ["thought", "Si je parle, tout bascule."],
      ["narration", "Un battement de trop. Un silence de trop."],
      ["thought", "Mieux vaut le dire. Mieux vaut fuir."],
    ],
    interrupt: [
      ["dialogue", "Stop — une seconde."],
      ["dialogue", "Laisse-moi finir."],
      ["dialogue", "Tu crois vraiment que c’est fini ?"],
      ["thought", "Il fallait couper, avant que ça dérape."],
      ["dialogue", "Écoute-moi."],
      ["dialogue", "Non. Pas comme ça."],
    ],
    gaze: [
      ["thought", "Son regard dit ce qu’il tait."],
      ["narration", "Les regards se croisent, puis se détournent."],
      ["thought", "Tenir le contact, c’est déjà choisir."],
      ["dialogue", "Tu vois ce que je veux dire ?"],
      ["thought", "Trop près. Trop loin."],
      ["narration", "Un silence tendu entre deux battements."],
    ],
    decision: [
      ["narration", "Le geste arrive avant la phrase."],
      ["thought", "Plus le temps d’hésiter."],
      ["dialogue", "Je choisis. Maintenant."],
      ["narration", "La décision pèse d’un seul mot."],
      ["thought", "Si je recule, je me perds."],
      ["dialogue", "C’est maintenant ou jamais."],
    ],
  };

  const pool = pools[args.kind];
  const [mode, text] = pool[idx] ?? pool[0]!;

  if (emotionalDirectness === "restrained" && subtextLevel === "high" && mode === "dialogue" && idx % 2 === 0) {
    return { mode: "thought", text: pools.hesitation[(idx + 2) % 6]![1] };
  }

  return { mode: mode as "dialogue" | "thought" | "narration", text };
}
