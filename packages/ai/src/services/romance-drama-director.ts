export type RomanceDramaBeatType =
  | "gaze_lock"
  | "hesitation"
  | "interrupted_confession"
  | "touch_then_retreat"
  | "silent_reaction"
  | "third_party_interruption"
  | "misunderstanding_pivot"
  | "emotional_asymmetry";

/** Conventions visuelles par beat type */
export interface RomanceBeatVisualConventions {
  cameraConvention: string;
  distanceConvention: "intimate" | "close" | "medium" | "far";
  gestureConvention: string;
  expressionConvention: string;
  silenceVsDialogueRatio: "silence_dominant" | "balanced" | "dialogue_dominant";
  forbiddenMismatches: string[];
  sfxForbidden: string[];
}

export type RomanceDramaBeat = {
  type: RomanceDramaBeatType;
  description: string;
  panelSuggestions: string[];
  tensionDelta: number;
  resolutionRequired: boolean;
  /** Conventions visuelles pour ce beat */
  visualConventions: RomanceBeatVisualConventions;
};

export type RomanceDramaDirectionInput = {
  sceneText: string;
  involvedCharacters: string[];
  currentTensionLevel?: number;
  /** Continuité de chimie entre les personnages */
  previousChemistryState?: ChemistryState | null;
};

/** État de chimie entre les personnages — continuité émotionnelle */
export interface ChemistryState {
  relationalDistance: "very_close" | "close" | "medium" | "distant" | "hostile";
  emotionalDominance: "character_a" | "character_b" | "balanced";
  gazeEvolution: "approaching" | "retreating" | "locked" | "avoiding";
  progressionPhase: "buildup" | "peak" | "aftermath" | "reset";
}

export type RomanceDramaDirection = {
  detectedBeat: RomanceDramaBeatType | null;
  suggestedBeat: RomanceDramaBeat;
  tensionAfter: number;
  narrativeSuggestion: string;
  /** Contraintes visuelles pour le prompt */
  visualPromptConstraints: string[];
  /** Éléments interdits pour le prompt négatif */
  visualNegativeConstraints: string[];
  /** État de chimie mis à jour */
  nextChemistryState: ChemistryState;
};

const BEAT_VISUAL_CONVENTIONS: Record<RomanceDramaBeatType, RomanceBeatVisualConventions> = {
  gaze_lock: {
    cameraConvention: "alternating close-ups on eyes, or medium shot showing both faces",
    distanceConvention: "close",
    gestureConvention: "stillness, subtle tension in hands or shoulders",
    expressionConvention: "intense eye contact, held breath visible",
    silenceVsDialogueRatio: "silence_dominant",
    forbiddenMismatches: ["action pose", "combat framing", "wide establishing shot"],
    sfxForbidden: ["impact", "explosion", "crash", "SMASH", "BOOM"],
  },
  hesitation: {
    cameraConvention: "profile shot or 3/4 view showing posture",
    distanceConvention: "medium",
    gestureConvention: "hand reaching then stopping, mouth slightly open",
    expressionConvention: "uncertainty, inner conflict visible",
    silenceVsDialogueRatio: "silence_dominant",
    forbiddenMismatches: ["action SFX", "combat framing"],
    sfxForbidden: ["impact", "explosion"],
  },
  interrupted_confession: {
    cameraConvention: "medium shot for confession, then sharp cut to interruptor",
    distanceConvention: "close",
    gestureConvention: "leaning forward then sudden freeze",
    expressionConvention: "vulnerability then shock",
    silenceVsDialogueRatio: "balanced",
    forbiddenMismatches: ["calm transition", "smooth composition"],
    sfxForbidden: ["impact", "explosion"],
  },
  touch_then_retreat: {
    cameraConvention: "close-up on contact point, then pull back",
    distanceConvention: "intimate",
    gestureConvention: "hand contact clearly visible, then withdrawal",
    expressionConvention: "surprise, embarrassment, warmth",
    silenceVsDialogueRatio: "silence_dominant",
    forbiddenMismatches: ["action SFX", "wide shot during contact"],
    sfxForbidden: ["impact", "explosion", "crash"],
  },
  silent_reaction: {
    cameraConvention: "close-up on face, minimal background",
    distanceConvention: "close",
    gestureConvention: "stillness, single tear or contained smile",
    expressionConvention: "restrained emotion, internal weight visible",
    silenceVsDialogueRatio: "silence_dominant",
    forbiddenMismatches: ["action pose", "SFX overlay", "busy background"],
    sfxForbidden: ["impact", "explosion", "movement", "ambient_loud"],
  },
  third_party_interruption: {
    cameraConvention: "intimate shot then wide to include interruptor",
    distanceConvention: "medium",
    gestureConvention: "startled separation, distance created",
    expressionConvention: "shock, embarrassment, frustration",
    silenceVsDialogueRatio: "balanced",
    forbiddenMismatches: ["smooth transition"],
    sfxForbidden: ["impact", "explosion"],
  },
  misunderstanding_pivot: {
    cameraConvention: "over-shoulder then cut to reaction",
    distanceConvention: "medium",
    gestureConvention: "turning away, crossed arms, physical distance",
    expressionConvention: "hurt, cold, withdrawn",
    silenceVsDialogueRatio: "balanced",
    forbiddenMismatches: ["warm lighting", "close proximity after pivot"],
    sfxForbidden: ["impact", "explosion"],
  },
  emotional_asymmetry: {
    cameraConvention: "split panel or alternating shots showing contrast",
    distanceConvention: "medium",
    gestureConvention: "one character reaching, other unaware or distant",
    expressionConvention: "longing vs neutrality",
    silenceVsDialogueRatio: "silence_dominant",
    forbiddenMismatches: ["both characters equally engaged"],
    sfxForbidden: ["impact", "explosion"],
  },
};

const BEAT_DEFINITIONS: Record<RomanceDramaBeatType, Omit<RomanceDramaBeat, "type">> = {
  gaze_lock: {
    description: "Deux personnages se regardent sans parler, la tension monte.",
    panelSuggestions: [
      "Gros plan sur les yeux de chaque personnage en alternance",
      "Panel silencieux avec fond épuré",
      "Détail des mains ou de la posture",
    ],
    tensionDelta: 15,
    resolutionRequired: false,
    visualConventions: BEAT_VISUAL_CONVENTIONS.gaze_lock,
  },
  hesitation: {
    description: "Un personnage hésite à parler ou à agir, visible dans la posture.",
    panelSuggestions: [
      "Panel de profil montrant la posture tendue",
      "Bulle de pensée ou narration interne",
      "Gros plan sur la bouche entrouverte",
    ],
    tensionDelta: 10,
    resolutionRequired: false,
    visualConventions: BEAT_VISUAL_CONVENTIONS.hesitation,
  },
  interrupted_confession: {
    description: "Une confession est interrompue au moment crucial.",
    panelSuggestions: [
      "Panel de la confession commençant",
      "Panel de l'interruption (bruit, arrivée d'un tiers, événement)",
      "Panel de réaction des deux personnages",
    ],
    tensionDelta: 25,
    resolutionRequired: true,
    visualConventions: BEAT_VISUAL_CONVENTIONS.interrupted_confession,
  },
  touch_then_retreat: {
    description: "Un contact physique suivi d'un recul immédiat.",
    panelSuggestions: [
      "Panel du contact (main, épaule)",
      "Panel du recul avec expression surprise ou gênée",
      "Panel de distance créée entre les deux",
    ],
    tensionDelta: 20,
    resolutionRequired: false,
    visualConventions: BEAT_VISUAL_CONVENTIONS.touch_then_retreat,
  },
  silent_reaction: {
    description: "Un personnage réagit silencieusement à une révélation émotionnelle.",
    panelSuggestions: [
      "Gros plan sur le visage expressif",
      "Panel panoramique montrant l'isolement",
      "Détail symbolique (larme, sourire contenu)",
    ],
    tensionDelta: 12,
    resolutionRequired: false,
    visualConventions: BEAT_VISUAL_CONVENTIONS.silent_reaction,
  },
  third_party_interruption: {
    description: "Un tiers interrompt un moment intime.",
    panelSuggestions: [
      "Panel du moment intime",
      "Panel de l'arrivée du tiers",
      "Panel de la réaction des deux protagonistes",
    ],
    tensionDelta: 18,
    resolutionRequired: true,
    visualConventions: BEAT_VISUAL_CONVENTIONS.third_party_interruption,
  },
  misunderstanding_pivot: {
    description: "Un malentendu crée une distance émotionnelle.",
    panelSuggestions: [
      "Panel montrant la phrase ou l'action mal interprétée",
      "Panel de la réaction froide ou blessée",
      "Panel de la distance physique résultante",
    ],
    tensionDelta: 22,
    resolutionRequired: true,
    visualConventions: BEAT_VISUAL_CONVENTIONS.misunderstanding_pivot,
  },
  emotional_asymmetry: {
    description: "Un personnage ressent plus que l'autre, créant un déséquilibre.",
    panelSuggestions: [
      "Panel comparatif des deux expressions",
      "Narration interne du personnage qui ressent plus",
      "Panel symbolique de la distance émotionnelle",
    ],
    tensionDelta: 16,
    resolutionRequired: false,
    visualConventions: BEAT_VISUAL_CONVENTIONS.emotional_asymmetry,
  },
};

const BEAT_KEYWORDS: Record<RomanceDramaBeatType, string[]> = {
  gaze_lock: ["regard", "yeux", "fixe", "observe", "contemple", "gaze"],
  hesitation: ["hésite", "hésit", "tremble", "bégaie", "n'ose", "pause"],
  interrupted_confession: ["interrompt", "coupe", "confess", "avoue", "dit que", "allait dire"],
  touch_then_retreat: ["touche", "effleure", "recule", "retire", "s'éloigne", "contact"],
  silent_reaction: ["silence", "sans mot", "muet", "larme", "sourit", "réaction"],
  third_party_interruption: ["arrive", "entre", "appelle", "interrompt", "tiers", "quelqu'un"],
  misunderstanding_pivot: ["malentendu", "comprend mal", "croit que", "se trompe", "interprète"],
  emotional_asymmetry: ["asymétrie", "plus que", "seul à", "ne ressent pas", "différemment"],
};

function detectBeatType(sceneText: string): RomanceDramaBeatType | null {
  const lower = sceneText.toLowerCase();
  let bestType: RomanceDramaBeatType | null = null;
  let bestScore = 0;

  for (const [type, keywords] of Object.entries(BEAT_KEYWORDS) as [RomanceDramaBeatType, string[]][]) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  return bestScore > 0 ? bestType : null;
}

function suggestNextBeat(
  detected: RomanceDramaBeatType | null,
  currentTension: number,
): RomanceDramaBeatType {
  if (!detected) {
    return currentTension < 40 ? "gaze_lock" : "hesitation";
  }

  const progressionMap: Record<RomanceDramaBeatType, RomanceDramaBeatType> = {
    gaze_lock: "hesitation",
    hesitation: "touch_then_retreat",
    touch_then_retreat: "interrupted_confession",
    interrupted_confession: "silent_reaction",
    silent_reaction: "emotional_asymmetry",
    emotional_asymmetry: "misunderstanding_pivot",
    misunderstanding_pivot: "third_party_interruption",
    third_party_interruption: "gaze_lock",
  };

  return progressionMap[detected];
}

function buildChemistryState(
  beatType: RomanceDramaBeatType,
  previous: ChemistryState | null | undefined,
  tensionAfter: number,
): ChemistryState {
  const prev: ChemistryState = previous ?? {
    relationalDistance: "medium",
    emotionalDominance: "balanced",
    gazeEvolution: "approaching",
    progressionPhase: "buildup",
  };

  const distanceMap: Record<RomanceDramaBeatType, ChemistryState["relationalDistance"]> = {
    gaze_lock: "close",
    hesitation: "close",
    interrupted_confession: "very_close",
    touch_then_retreat: "medium",
    silent_reaction: "medium",
    third_party_interruption: "distant",
    misunderstanding_pivot: "distant",
    emotional_asymmetry: "medium",
  };

  const gazeMap: Record<RomanceDramaBeatType, ChemistryState["gazeEvolution"]> = {
    gaze_lock: "locked",
    hesitation: "approaching",
    interrupted_confession: "retreating",
    touch_then_retreat: "retreating",
    silent_reaction: "avoiding",
    third_party_interruption: "retreating",
    misunderstanding_pivot: "avoiding",
    emotional_asymmetry: "approaching",
  };

  const phase: ChemistryState["progressionPhase"] =
    tensionAfter >= 80 ? "peak"
    : beatType === "misunderstanding_pivot" || beatType === "third_party_interruption" ? "aftermath"
    : tensionAfter <= 20 ? "reset"
    : "buildup";

  return {
    relationalDistance: distanceMap[beatType] ?? prev.relationalDistance,
    emotionalDominance: prev.emotionalDominance,
    gazeEvolution: gazeMap[beatType] ?? prev.gazeEvolution,
    progressionPhase: phase,
  };
}

export function directRomanceDramaScene(input: RomanceDramaDirectionInput): RomanceDramaDirection {
  const currentTension = input.currentTensionLevel ?? 50;
  const detectedBeat = detectBeatType(input.sceneText);
  const suggestedBeatType = suggestNextBeat(detectedBeat, currentTension);
  const beatDef = BEAT_DEFINITIONS[suggestedBeatType];
  const conventions = beatDef.visualConventions;

  const tensionAfter = Math.min(100, currentTension + beatDef.tensionDelta);

  const charList = input.involvedCharacters.slice(0, 2).join(" et ");
  const narrativeSuggestion = `Pour ${charList} : ${beatDef.description} Tension : ${currentTension} → ${tensionAfter}.`;

  // Construire les contraintes visuelles pour le prompt
  const visualPromptConstraints: string[] = [
    conventions.cameraConvention,
    `distance: ${conventions.distanceConvention}`,
    conventions.gestureConvention,
    conventions.expressionConvention,
  ];

  const visualNegativeConstraints: string[] = [
    ...conventions.forbiddenMismatches,
    ...conventions.sfxForbidden.map((s) => `${s} SFX`),
  ];

  const nextChemistryState = buildChemistryState(suggestedBeatType, input.previousChemistryState, tensionAfter);

  return {
    detectedBeat,
    suggestedBeat: { type: suggestedBeatType, ...beatDef },
    tensionAfter,
    narrativeSuggestion,
    visualPromptConstraints,
    visualNegativeConstraints,
    nextChemistryState,
  };
}
