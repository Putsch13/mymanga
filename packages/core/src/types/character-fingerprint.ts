/**
 * CharacterFingerprint: identité visuelle et comportementale stricte d'un personnage.
 * Utilisé pour garantir la cohérence à travers tous les panels/chapitres.
 */

export interface CharacterFingerprint {
  identity: {
    name: string;
    gender: "male" | "female" | "other" | "non_applicable";
    perceivedAge: string;
    role: string;
    ageBand?: "child" | "teen" | "young_adult" | "adult" | "elder" | "ancient" | "unknown";
    /** CREATURE-2 : type d'entité pour les non-humains */
    entityKind?: "human" | "monster" | "creature" | "animal" | "spirit" | "construct" | "dragon" | "demon" | "beast";
    /** CREATURE-2 : label d'espèce libre (ex: "dragon rouge", "golem de pierre") */
    speciesLabel?: string | null;
  };
  face: {
    faceShape: string;
    eyeShape: string;
    eyeColor: string;
    eyebrowStyle: string;
    noseStyle?: string;
    mouthStyle?: string;
  };
  hair: {
    color: string;
    style: string;
    length: string;
    texture: string;
    silhouette: string;
    bangs?: string;
    parting?: string;
  };
  body: {
    build: string;
    height: string;
    posture: string;
    silhouette: string;
    shoulderWidthClass?: "narrow" | "average" | "broad";
    heightClass?: "short" | "average" | "tall";
    skinTone?: string;
  };
  /** Marques permanentes qui ne doivent JAMAIS disparaître */
  permanentMarkers: string[];
  /** Tenue par défaut du personnage */
  defaultOutfit: string[];
  /** Dérives interdites (ex: "ne jamais avoir les yeux verts", "jamais de barbe") */
  forbiddenDrift: string[];
  /** URLs des références visuelles primaires */
  primaryRefs: string[];
  /** Trigger word LoRA si disponible */
  loraTrigger?: string;
  /**
   * Traits durs non négociables — leur absence dans le prompt = character_reroll.
   * Ex: ["silver hair", "bionic arm", "scar on left cheek"]
   */
  hardTraits?: string[];
  /**
   * Traits souples qui peuvent varier selon le contexte.
   * Ex: ["casual outfit", "relaxed posture"]
   */
  softTraits?: string[];
  /** Signature d'accessoire persistante */
  accessorySignature?: string;
  /** Signature de posture */
  postureSignature?: string;
  /**
   * CREATURE-2 : traits visuels spécifiques aux entités non-humaines.
   * Complète (et peut remplacer) les champs hair/body pour les créatures.
   */
  creatureTraits?: {
    bodyType: string;              // ex: "quadruped", "serpentine", "winged_biped"
    coveringType: string;          // "scales", "fur", "feathers", "skin", "metal", "energy"
    primaryColor: string;
    secondaryColor?: string;
    distinctiveFeatures: string[]; // ex: ["six eyes", "barbed tail", "bioluminescent markings"]
    sizeClass: "tiny" | "small" | "medium" | "large" | "colossal";
  };
  /** Continuité de garde-robe */
  wardrobeContinuity?: {
    currentOutfit: string;
    outfitHistory: Array<{ sceneId: string; outfit: string; changedAt: string }>;
    outfitChangeRules: string[];
  };
}

/** Compiler les hard traits en bloc prompt */
export function compileHardTraitsPromptBlock(fingerprint: CharacterFingerprint): string {
  const traits = fingerprint.hardTraits ?? [];
  if (traits.length === 0) return "";
  return `HARD LOCK [${fingerprint.identity.name}]: ${traits.join(", ")}`;
}

/** Compiler les hard traits en bloc négatif */
export function compileHardTraitsNegativeBlock(fingerprint: CharacterFingerprint): string {
  const forbidden = fingerprint.forbiddenDrift ?? [];
  if (forbidden.length === 0) return "";
  return forbidden.slice(0, 8).join(", ");
}
