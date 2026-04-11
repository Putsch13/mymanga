export type RomanceDramaBeatType =
  | "gaze_lock"
  | "hesitation"
  | "interrupted_confession"
  | "touch_then_retreat"
  | "silent_reaction"
  | "third_party_interruption"
  | "misunderstanding_pivot"
  | "emotional_asymmetry";

export type RomanceDramaBeat = {
  type: RomanceDramaBeatType;
  description: string;
  panelSuggestions: string[];
  tensionDelta: number;
  resolutionRequired: boolean;
};

export type RomanceDramaDirectionInput = {
  sceneText: string;
  involvedCharacters: string[];
  currentTensionLevel?: number;
};

export type RomanceDramaDirection = {
  detectedBeat: RomanceDramaBeatType | null;
  suggestedBeat: RomanceDramaBeat;
  tensionAfter: number;
  narrativeSuggestion: string;
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

export function directRomanceDramaScene(input: RomanceDramaDirectionInput): RomanceDramaDirection {
  const currentTension = input.currentTensionLevel ?? 50;
  const detectedBeat = detectBeatType(input.sceneText);
  const suggestedBeatType = suggestNextBeat(detectedBeat, currentTension);
  const beatDef = BEAT_DEFINITIONS[suggestedBeatType];

  const tensionAfter = Math.min(100, currentTension + beatDef.tensionDelta);

  const charList = input.involvedCharacters.slice(0, 2).join(" et ");
  const narrativeSuggestion = `Pour ${charList} : ${beatDef.description} Tension : ${currentTension} → ${tensionAfter}.`;

  return {
    detectedBeat,
    suggestedBeat: { type: suggestedBeatType, ...beatDef },
    tensionAfter,
    narrativeSuggestion,
  };
}
