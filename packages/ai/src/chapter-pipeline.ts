import { generateChapterOutline } from "./chapter-outline";
import { writeDialogueForScene } from "./services/dialogue-writer";
import { planPanelText, type PanelTextPlan } from "./services/panel-text-planner";

export type ProjectContextForChapter = {
  project: {
    title: string;
    pitch: string | null;
    description?: string | null;
    primaryGenre: string | null;
    subGenres?: string[];
    tone: string | null;
    format: string | null;
    visualStyle?: string | null;
    contentRating?: string | null;
    intensityLayer?: string | null;
  };
  focusCharacterIds?: string[];
  settings?: {
    violenceLevel?: number | null;
    romanceLevel?: number | null;
    sensualityLevel?: number | null;
    darknessLevel?: number | null;
    mysteryLevel?: number | null;
    dialogueDensity?: number | null;
    canonStrictness?: number | null;
  } | null;
  stylePack?: {
    renderFamily?: string | null;
    lineWeight?: string | null;
    shadingMode?: string | null;
    contrastProfile?: string | null;
    anatomyBias?: string | null;
    backgroundDensity?: string | null;
    cameraLanguage?: string | null;
    negativeConstraints?: string[];
  } | null;
  storyBible?: {
    summary?: string | null;
    themes?: string[];
    worldRules?: unknown;
    lore?: unknown;
    glossary?: unknown;
    lockedCanon?: unknown;
  } | null;
  characters: Array<{
    id: string;
    name: string;
    roleType: string | null;
    gender?: string | null;
    biography?: string | null;
    objective: string | null;
    fear: string | null;
    emotionalState: string | null;
    status: string;
    canonLocked?: boolean;
    traits?: string[];
    flaws?: string[];
    speechProfile?: Record<string, unknown>;
    appearance?: string | null;
    outfitDefault?: string | null;
    hairColor?: string | null;
    eyeColor?: string | null;
    bodyState?: Record<string, unknown>;
    wardrobeProfile?: Record<string, unknown>;
    visualProfile?: Record<string, unknown>;
    continuityProfile?: Record<string, unknown>;
  }>;
  relationships: Array<{
    sourceCharacterId: string;
    targetCharacterId: string;
    relationType: string;
    intensity: number;
  }>;
  arcs: Array<{
    name: string;
    summary: string | null;
    status: string;
  }>;
  recentChapters: Array<{
    chapterNumber: number;
    title: string | null;
    summary: string | null;
    cliffhanger: string | null;
  }>;
  recentMemory: Array<{
    narrativeSummary: string | null;
  }>;
  retrievedDocs: Array<{
    title: string | null;
    entityType?: string | null;
    content: string;
    metadata?: unknown;
  }>;
  recentContinuityEvents?: Array<{
    eventType: string;
    summary: string | null;
    permanent: boolean;
    importance: number;
    entities?: unknown;
  }>;
  seriesSynopsis?: string;
};

export type PanelMood =
  | "action"
  | "tension"
  | "emotion"
  | "revelation"
  | "calm"
  | "horror"
  | "romance"
  | "comedy"
  | "dramatic";

export type GridLayout = "A" | "B" | "C" | "D" | "E" | "F";

export type StoryboardPanel = {
  panelNumber: number;
  sceneId: string;
  beatId: string;
  caption: string;
  prompt: string;
  negativePrompt: string;
  camera: string;
  characters: string[];
  mood: PanelMood;
  sfx?: string;
  dialogue?: { speaker: string; text: string };
  dialogues?: Array<{ speaker: string; text: string }>;
  narration?: string;
  textScale?: "normal" | "compact" | "micro";
};

export type StoryboardPage = {
  pageNumber: number;
  layout: GridLayout;
  panels: StoryboardPanel[];
};

type PanelBlueprint = {
  panelId: string;
  action: string;
  mood: PanelMood;
  characters: string[];
};

export type GeneratedChapterBundle = {
  creativeDirection: {
    chapterGoal: string;
    tone: string;
    whyNow: string;
  };
  plotOptions: Array<{
    id: string;
    title: string;
    label: "safe" | "bold" | "shock";
    summary: string;
  }>;
  outline: {
    chapter_title: string;
    chapter_goal: string;
    tone: string;
    beats: Array<{
      id: string;
      summary: string;
      tension: number;
      characters: string[];
      location: string;
      purpose: string;
    }>;
    cliffhanger: string;
    continuity_notes: string[];
  };
  script: {
    scenes: Array<{
      id: string;
      title: string;
      summary: string;
      location: string;
      characters: string[];
      purpose: string;
      dialogue: Array<{
        speaker: string;
        text: string;
        subtext: string;
        emotion: string;
        intensity: number;
        balloon: string;
      }>;
    }>;
  };
  storyboard: {
    pageCount: number;
    pages: StoryboardPage[];
  };
  memory: {
    narrativeSummary: string;
    structuredState: Record<string, unknown>;
    timelineEvents: Array<Record<string, unknown>>;
    openLoops: string[];
  };
};

function takeNames(context: ProjectContextForChapter, count: number) {
  const focusSet = new Set((context.focusCharacterIds ?? []).filter(Boolean));
  const prioritized = [...context.characters].sort((a, b) => {
    const aFocused = focusSet.has(a.id) ? 1 : 0;
    const bFocused = focusSet.has(b.id) ? 1 : 0;
    if (aFocused !== bFocused) return bFocused - aFocused;
    const aRole = /hero|heros|protagon/i.test(a.roleType ?? "") ? 1 : /antagon/i.test(a.roleType ?? "") ? 2 : 3;
    const bRole = /hero|heros|protagon/i.test(b.roleType ?? "") ? 1 : /antagon/i.test(b.roleType ?? "") ? 2 : 3;
    return aRole - bRole;
  });
  return prioritized.slice(0, count).map((c) => c.name);
}

function mergeCharactersFromBeat(
  context: ProjectContextForChapter,
  beatCharacters: string[] | undefined,
  beatSummary: string,
  fallback: string[],
): string[] {
  const fromBeat = [...new Set((beatCharacters ?? []).map((name) => name.trim()).filter(Boolean))];
  if (fromBeat.length > 0) return fromBeat;
  return extractCharactersFromText(context, beatSummary, fallback);
}

function stretchToCount<T>(items: T[], count: number, fallbackFactory: (index: number) => T): T[] {
  if (items.length >= count) return items.slice(0, count);
  const next = [...items];
  for (let i = items.length; i < count; i++) {
    next.push(items[i % Math.max(items.length, 1)] ?? fallbackFactory(i));
  }
  return next;
}

function inferLocations(context: ProjectContextForChapter, userIntent?: string | null) {
  const intent = (userIntent ?? "").toLowerCase();
  const explicitMatches = [
    "banque",
    "café",
    "cafe",
    "taverne",
    "rue",
    "ruelle",
    "ville",
    "toit",
    "forêt",
    "foret",
    "falaise",
    "palais",
    "trône",
    "trone",
  ].filter((token) => intent.includes(token));
  if (explicitMatches.length > 0) {
    const normalized = explicitMatches[0];
    if (normalized === "banque") return ["banque centrale sous haute sécurité", "banque centrale sous haute sécurité", "banque centrale sous haute sécurité", "sortie de la banque"];
    if (normalized === "café" || normalized === "cafe") return ["café calme en soirée", "café calme en soirée", "rue devant le café", "arrière-salle du café"];
    if (normalized === "taverne") return ["taverne enfumée aux lumières basses", "taverne enfumée aux lumières basses", "taverne enfumée aux lumières basses", "entrée de la taverne"];
    if (normalized === "forêt" || normalized === "foret") return ["forêt de cendres", "forêt de cendres", "clairière silencieuse", "lisière de la forêt"];
    if (normalized === "ville" || normalized === "rue" || normalized === "ruelle") return ["centre-ville cyberpunk", "ruelle néon sous la pluie", "rue commerçante cyberpunk", "toit d'immeuble au-dessus de la ville"];
    if (normalized === "toit") return ["toit d'immeuble au-dessus de la ville", "toit d'immeuble au-dessus de la ville", "escalier de service", "toit d'immeuble au-dessus de la ville"];
    if (normalized === "palais" || normalized === "trône" || normalized === "trone") return ["salle du trône en ruines", "salle du trône en ruines", "couloir du palais", "salle du trône en ruines"];
  }

  const genre = (context.project.primaryGenre ?? "fantasy").toLowerCase();
  if (genre.includes("cyber") || genre.includes("sci")) {
    return [
      "ruelle néon sous la pluie",
      "tour de données clignotante",
      "toit d'immeuble sous un ciel orange",
      "couloir de serveurs sombres",
    ];
  }
  if (genre.includes("horror") || genre.includes("horreur")) {
    return [
      "sanctuaire abandonné",
      "couloir sans fenêtres",
      "cour souillée de sang",
      "crypte sous la ville",
    ];
  }
  if (genre.includes("romance") || genre.includes("shojo")) {
    return [
      "toit de l'école au coucher du soleil",
      "café calme en soirée",
      "parc sous les cerisiers",
      "couloir désert après les cours",
    ];
  }
  return [
    "porte de la ville fissurée",
    "salle du trône en ruines",
    "forêt de cendres",
    "falaise au-dessus du vide",
  ];
}

function buildDynamicPlotOptions(input: {
  userIntent: string;
  mainCast: string[];
  previousSummary: string | null;
  previousCliffhanger: string | null;
  outline: {
    summary: string;
    cliffhanger: string;
    beats: Array<{ summary: string; turn?: string; location?: string; pageRole?: string }>;
  };
}) {
  const [hero = "Le héros", second = "un allié"] = input.mainCast;
  const firstBeat = input.outline.beats[0];
  const middleBeat = input.outline.beats.find((b) => b.pageRole === "confrontation" || b.pageRole === "revelation") ?? input.outline.beats[1];
  const lastBeat = input.outline.beats[input.outline.beats.length - 1];
  const previousAnchor = input.previousCliffhanger ?? input.previousSummary ?? "les événements récents";

  return [
    {
      id: "safe",
      title: "Progression logique",
      label: "safe" as const,
      summary: `Après ${previousAnchor}, ${hero} suit ${firstBeat?.turn?.toLowerCase() ?? "une piste concrète"} à ${firstBeat?.location ?? "un lieu clé"} pour faire avancer ${input.userIntent.slice(0, 80)}.`,
    },
    {
      id: "bold",
      title: "Accélération émotionnelle",
      label: "bold" as const,
      summary: `${hero} et ${second} se heurtent autour de ${middleBeat?.summary?.slice(0, 90) ?? input.userIntent.slice(0, 90)}, ce qui force une décision risquée et plus intime.`,
    },
    {
      id: "shock",
      title: "Rupture dramatique",
      label: "shock" as const,
      summary: `Le chapitre pousse vers ${lastBeat?.turn?.toLowerCase() ?? input.outline.cliffhanger.toLowerCase()} et transforme ${input.outline.cliffhanger.toLowerCase()} en vraie ouverture de saga.`,
    },
  ];
}

function inferVisualStyle(context: ProjectContextForChapter): string {
  const stylePackBits = [
    context.stylePack?.renderFamily,
    context.stylePack?.lineWeight,
    context.stylePack?.shadingMode,
    context.stylePack?.contrastProfile,
    context.stylePack?.cameraLanguage,
  ]
    .filter(Boolean)
    .join(", ");
  const vs = context.project.visualStyle ?? "";
  if (vs && stylePackBits) return `${vs}, ${stylePackBits}`;
  if (vs) return vs;
  if (stylePackBits) return stylePackBits;
  const genre = (context.project.primaryGenre ?? "").toLowerCase();
  if (genre.includes("cyber")) return "cyberpunk neon manga, detailed ink, Masamune Shirow style";
  if (genre.includes("horror")) return "dark horror manga, heavy shadows, Junji Ito style";
  if (genre.includes("romance")) return "soft shojo manga, delicate linework, pastel tones";
  return "detailed action manga, dynamic lines, Kentaro Miura style";
}

function inferMood(tension: number, genre: string): PanelMood {
  if (genre.includes("horror")) return tension > 6 ? "horror" : "tension";
  if (genre.includes("romance")) return tension > 6 ? "emotion" : "romance";
  if (tension >= 9) return "revelation";
  if (tension >= 7) return "action";
  if (tension >= 5) return "tension";
  if (tension >= 3) return "dramatic";
  return "calm";
}

function inferLayout(tension: number, panelCount: number): GridLayout {
  // Layouts in UI:
  // - 6 panels: A, B, D
  // - 5 panels: C ou E
  // - 4 panels: F (2x2)
  if (panelCount >= 6) return tension >= 8 ? "D" : tension >= 5 ? "B" : "A";
  if (panelCount === 5) return tension >= 6 ? "E" : "C";
  // 4 panels → layout F (2×2 grid)
  return "F";
}

const STD_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, watermark, text overlay, low quality, duplicate character";

function extractCharactersFromText(context: ProjectContextForChapter, text: string, fallback: string[]): string[] {
  const lowered = text.toLowerCase();
  const matched = context.characters
    .filter((character) => lowered.includes(character.name.toLowerCase()))
    .map((character) => character.name);
  return matched.length > 0 ? matched : fallback;
}

type PageRoleKey = "establishing" | "escalation" | "confrontation" | "revelation" | "aftermath" | "cliffhanger";

const PAGE_ROLE_TEMPLATES: Record<PageRoleKey, (ctx: { mainA: string; mainB: string; location: string; summary: string; purpose: string; turn: string }) => string[]> = {
  establishing: (c) => [
    `Plan large : ${c.location} s'étend devant ${c.mainA}. Ambiance posée.`,
    `${c.mainA} observe un détail du décor qui révèle l'atmosphère.`,
    `${c.mainA} entre dans le lieu, posture et expression lisibles.`,
    `Un élément de l'environnement annonce la suite : ${c.turn}`,
    `Narration visuelle : le regard de ${c.mainA} se pose sur un indice.`,
    `Transition douce vers l'action : ${c.mainA} s'approche de ${c.mainB}.`,
  ],
  escalation: (c) => [
    `${c.mainA} et ${c.mainB} dans une situation qui se tend.`,
    `Un échange de regards chargé de tension autour de ${c.purpose}.`,
    `${c.mainA} réalise quelque chose : ${c.turn}`,
    `La pression monte : un détail concret aggrave la situation.`,
    `${c.mainB} réagit violemment ou émotionnellement.`,
    `Point de non-retour : ${c.mainA} doit agir maintenant.`,
  ],
  confrontation: (c) => [
    `Face à face : ${c.mainA} vs ${c.mainB}. Tension maximale.`,
    `Champ/contre-champ : expressions opposées, enjeux lisibles.`,
    `Action : ${c.mainA} fait un geste décisif. ${c.turn}`,
    `Impact : la conséquence est immédiate et visuelle.`,
    `${c.mainB} encaisse ou riposte. Le rapport de force bascule.`,
    `Respiration : un silence après l'impact, poussière ou souffle.`,
  ],
  revelation: (c) => [
    `Moment de silence : case sombre ou vide, suspense.`,
    `Zoom lent : un détail change tout — ${c.turn}`,
    `Réaction choc de ${c.mainA} : expression extrême, yeux écarquillés.`,
    `Plan large conséquence : l'ampleur de la révélation apparaît.`,
    `${c.mainB} comprend aussi. Regard échangé, chargé de sens.`,
    `Narration intérieure de ${c.mainA} sur ce que ça change.`,
  ],
  aftermath: (c) => [
    `Calme après la tempête : ${c.location} sous un nouveau jour.`,
    `${c.mainA} fait le point, expression fatiguée ou déterminée.`,
    `Dialogue posé entre ${c.mainA} et ${c.mainB} sur ce qui vient de se passer.`,
    `Un geste simple (soigner, ranger, marcher) montre l'état intérieur.`,
    `${c.turn} — une nouvelle perspective émerge.`,
    `Transition : le regard se porte vers l'horizon ou la prochaine étape.`,
  ],
  cliffhanger: (c) => [
    `Accélération : plusieurs cases rapides, rythme pressé.`,
    `${c.mainA} fait face à une dernière décision — ${c.purpose}.`,
    `Montée : chaque case rapproche du point de rupture.`,
    `${c.turn} — le retournement frappe.`,
    `Image symbolique : ombre, lumière ou silhouette — impact maximal.`,
    `Dernière case : question ouverte, le lecteur DOIT tourner la page.`,
  ],
};

function buildPanelBlueprints(
  scene: { id: string; summary: string; location: string; characters: string[]; purpose: string },
  beat: { summary: string; tension: number; pageRole?: string; turn?: string },
  panelCount: number,
  genre: string,
): PanelBlueprint[] {
  const mainA = scene.characters[0] ?? "Le protagoniste";
  const mainB = scene.characters[1] ?? mainA;
  const role = (beat.pageRole ?? "escalation") as PageRoleKey;
  const templateFn = PAGE_ROLE_TEMPLATES[role] ?? PAGE_ROLE_TEMPLATES.escalation;
  const templates = templateFn({
    mainA,
    mainB,
    location: scene.location,
    summary: beat.summary,
    purpose: scene.purpose,
    turn: beat.turn ?? beat.summary.slice(0, 60),
  });

  return Array.from({ length: panelCount }).map((_, panelIndex) => {
    const mood = inferMood(beat.tension + panelIndex / Math.max(panelCount, 1), genre);
    const baseCharacters =
      panelIndex === 0
        ? scene.characters
        : panelIndex % 3 === 0
          ? scene.characters
          : [scene.characters[panelIndex % Math.max(scene.characters.length, 1)] ?? mainA].filter(Boolean);
    return {
      panelId: `panel_${panelIndex + 1}`,
      action: templates[panelIndex] ?? `${scene.summary} — ${beat.turn ?? "progression"}.`,
      mood,
      characters: baseCharacters,
    };
  });
}

function buildNarrativeSummary(input: {
  projectTitle: string;
  chapterGoal: string;
  scenes: Array<{ summary: string; characters: string[]; location: string; dialogue: Array<{ speaker: string; text: string }> }>;
  cliffhanger: string;
}) {
  const highlights = input.scenes
    .slice(0, 3)
    .map((scene) => `${scene.characters.join(" / ") || "Le groupe"} à ${scene.location}: ${scene.summary}`)
    .join(" ");
  return `${input.projectTitle}: ${input.chapterGoal}. ${highlights} Fin de chapitre: ${input.cliffhanger}`.slice(0, 1200);
}

function buildPanelPrompt(
  context: ProjectContextForChapter,
  characters: string[],
  location: string,
  camera: string,
  action: string,
  mood: PanelMood,
  visualStyle: string,
): string {
  const charDescs = characters
    .map((name) => {
      const c = context.characters.find((ch) => ch.name === name);
      if (!c) return name;
      const parts = [name];
      if (c.appearance) parts.push(c.appearance);
      if (c.hairColor) parts.push(`${c.hairColor} hair`);
      if (c.eyeColor) parts.push(`${c.eyeColor} eyes`);
      if (c.outfitDefault) parts.push(c.outfitDefault);
      return parts.join(", ");
    })
    .join(" | ");

  const moodMap: Record<PanelMood, string> = {
    action: "dynamic action, motion blur, speed lines",
    tension: "tense atmosphere, dramatic shadows, high contrast",
    emotion: "emotional close-up, teary eyes, soft lighting",
    revelation: "shocking reveal, dramatic lighting, wide eyes",
    calm: "peaceful composition, soft light, serene",
    horror: "dark horror, deep shadows, unsettling angles",
    romance: "soft romantic lighting, cherry blossoms, warm tones",
    comedy: "comedic exaggeration, sweat drops, chibi elements",
    dramatic: "dramatic composition, strong shadows, cinematic",
  };

  return [
    visualStyle,
    `manga panel, ${camera}`,
    `location: ${location}`,
    charDescs,
    action,
    moodMap[mood],
    "high detail, professional manga art, consistent character design, environmental storytelling",
  ]
    .filter(Boolean)
    .join(", ");
}

function buildPanelsForScene(
  context: ProjectContextForChapter,
  scene: { id: string; location: string; characters: string[]; summary: string; purpose: string },
  beat: { id: string; tension: number },
  panelBlueprints: PanelBlueprint[],
  visualStyle: string,
  genre: string,
  panelTextPlan?: PanelTextPlan[],
): StoryboardPanel[] {
  const PANEL_FUNCTION_CAMERAS: Record<string, string[]> = {
    establishing: ["wide establishing shot", "medium shot", "close-up on face", "medium shot", "wide shot", "medium shot"],
    escalation: ["medium shot", "over-the-shoulder shot", "close-up on face", "low angle shot", "medium shot", "extreme close-up on eyes"],
    confrontation: ["medium shot", "close-up on face", "low angle dynamic shot", "extreme close-up on eyes", "over-the-shoulder shot", "dutch angle shot"],
    revelation: ["medium shot", "slow zoom close-up", "extreme close-up shocked eyes", "wide shot consequences", "over-the-shoulder shot", "high angle distant shot"],
    aftermath: ["wide establishing shot", "medium shot", "close-up on face", "medium shot", "wide shot", "medium shot"],
    cliffhanger: ["medium shot", "close-up on face", "low angle shot", "extreme close-up on eyes", "silhouette shot", "dramatic wide shot"],
  };

  const pageRole = (beat as { pageRole?: string }).pageRole ?? "escalation";
  const roleCameras = PANEL_FUNCTION_CAMERAS[pageRole] ?? PANEL_FUNCTION_CAMERAS.escalation;

  const panels: StoryboardPanel[] = [];
  for (let i = 0; i < panelBlueprints.length; i++) {
    const blueprint = panelBlueprints[i];
    const panelTension = beat.tension + (i / Math.max(panelBlueprints.length, 1)) * 2;
    const mood = blueprint?.mood ?? inferMood(panelTension, genre);
    const camera = roleCameras[i] ?? roleCameras[i % roleCameras.length] ?? "medium shot";
    const action = blueprint?.action ?? scene.summary;
    const charSubsetRaw = blueprint?.characters?.length ? blueprint.characters : scene.characters;

    const textPlan = panelTextPlan?.[i];
    const leadBubble = textPlan?.bubbles?.[0];
    const normalizedChars = [...new Set((charSubsetRaw ?? []).filter(Boolean))];
    const allBubbles = (textPlan?.bubbles ?? [])
      .filter((b) => b.text?.trim())
      .slice(0, 3)
      .map((b) => ({
        speaker: b.speaker ?? normalizedChars[0] ?? scene.characters[0] ?? "Narrateur",
        text: b.text,
      }));
    for (const bubble of allBubbles) {
      const bubbleSpeaker = bubble.speaker?.trim();
      if (bubbleSpeaker && !/narrateur|narration/i.test(bubbleSpeaker)) {
        const hasSpeaker = normalizedChars.some((name) => name.toLowerCase() === bubbleSpeaker.toLowerCase());
        if (!hasSpeaker) normalizedChars.push(bubbleSpeaker);
      }
    }

    const beatTurn = (beat as { turn?: string }).turn;

    panels.push({
      panelNumber: i + 1,
      sceneId: scene.id,
      beatId: beat.id,
      caption: i === 0 && beatTurn ? beatTurn : action,
      prompt: buildPanelPrompt(
        context,
        normalizedChars,
        scene.location,
        camera,
        action,
        mood,
        visualStyle,
      ),
      negativePrompt: STD_NEGATIVE,
      camera,
      characters: normalizedChars,
      mood,
      sfx: textPlan?.sfx?.[0] ?? undefined,
      dialogue: allBubbles[0] ?? undefined,
      dialogues: allBubbles.length > 0 ? allBubbles : undefined,
      narration: textPlan?.narration?.[0] ?? undefined,
      textScale: textPlan?.textScale ?? "normal",
    });
  }
  return panels;
}

function normalizeTextForDup(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pageDupSignature(page: StoryboardPage): string {
  return page.panels
    .map((panel) => {
      const chars = [...new Set(panel.characters.map((c) => c.toLowerCase()))].sort().join(",");
      return [
        normalizeTextForDup(panel.caption),
        normalizeTextForDup(panel.dialogue?.text),
        normalizeTextForDup(panel.narration),
        chars,
      ].join("|");
    })
    .join("||");
}

function duplicatePageIndexes(pages: StoryboardPage[]): number[] {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const signature = pageDupSignature(page);
    const prev = seen.get(signature);
    if (typeof prev === "number") {
      // On régénère la page la plus récente pour préserver l'intention du flow narratif.
      duplicates.add(index);
      continue;
    }
    seen.set(signature, index);
  }
  return [...duplicates];
}

function buildRegeneratedBlueprints(
  scene: { id: string; summary: string; location: string; characters: string[]; purpose: string },
  beat: { summary: string; tension: number },
  panelCount: number,
  genre: string,
  attempt: number,
): PanelBlueprint[] {
  const base = buildPanelBlueprints(scene, beat, panelCount, genre);
  const variationTag = attempt % 2 === 0 ? "Conséquence immédiate" : "Nouveau contretemps";
  return base.map((panel, idx) => ({
    ...panel,
    action: `${panel.action} ${variationTag} ${idx + 1}: ${scene.purpose}.`,
  }));
}

export async function generateChapterBundle(input: {
  chapterNumber: number;
  chapterTitle?: string | null;
  userIntent: string;
  selectedPlotLabel?: "safe" | "bold" | "shock";
  context: ProjectContextForChapter;
}): Promise<GeneratedChapterBundle> {
  const cast = takeNames(input.context, 6);
  const mainCast = cast.length > 0 ? cast : ["Le protagoniste", "L'antagoniste"];
  const locations = inferLocations(input.context, input.userIntent);
  const [locA, locB, locC, locD] = locations;
  const locAt = (i: number) => locations[i % Math.max(locations.length, 1)] ?? locA;
  const tone = input.context.project.tone ?? "dramatique";
  const genre = (input.context.project.primaryGenre ?? "fantasy").toLowerCase();
  const visualStyle = inferVisualStyle(input.context);
  const chapterGoal = `Faire avancer l'intrigue autour de : ${input.userIntent}`;
  const selectedLabel = input.selectedPlotLabel ?? "bold";

  const previous = input.context.recentChapters[0];
  const outlineResult = await generateChapterOutline({
    projectTitle: input.context.project.title,
    pitch: input.context.project.pitch,
    description: input.context.project.description ?? null,
    primaryGenre: input.context.project.primaryGenre,
    subGenres: input.context.project.subGenres ?? [],
    tone: input.context.project.tone ?? null,
    visualStyle,
    styleGuide: input.context.stylePack
      ? [
          input.context.stylePack.renderFamily,
          input.context.stylePack.lineWeight,
          input.context.stylePack.shadingMode,
          input.context.stylePack.contrastProfile,
        ]
          .filter(Boolean)
          .join(", ")
      : null,
    cast: input.context.characters.slice(0, 8).map((character) => ({
      name: character.name,
      roleType: character.roleType,
      objective: character.objective,
      status: character.status,
      fear: character.fear,
      traits: character.traits,
      appearance: character.appearance,
    })),
    relationships: (input.context.relationships ?? []).slice(0, 8).map((r) => ({
      source: input.context.characters.find((c) => c.id === r.sourceCharacterId)?.name ?? r.sourceCharacterId,
      target: input.context.characters.find((c) => c.id === r.targetCharacterId)?.name ?? r.targetCharacterId,
      type: r.relationType,
    })),
    arcs: (input.context.arcs ?? []).slice(0, 4),
    allRecentChapters: input.context.recentChapters.slice(0, 3),
    bibleSummary: input.context.storyBible?.summary ?? null,
    themes: input.context.storyBible?.themes ?? [],
    continuitySnippets: input.context.recentMemory
      .map((memory) => memory.narrativeSummary)
      .filter((item): item is string => Boolean(item))
      .slice(0, 3),
    recentContinuityEvents: (input.context.recentContinuityEvents ?? [])
      .filter((e) => e.importance >= 40)
      .slice(0, 10),
    retrievedContext: input.context.retrievedDocs.map((doc) => doc.content).slice(0, 4),
    settings: {
      dialogueDensity: input.context.settings?.dialogueDensity ?? null,
      darknessLevel: input.context.settings?.darknessLevel ?? null,
      mysteryLevel: input.context.settings?.mysteryLevel ?? null,
      violenceLevel: input.context.settings?.violenceLevel ?? null,
      romanceLevel: input.context.settings?.romanceLevel ?? null,
      sensualityLevel: input.context.settings?.sensualityLevel ?? null,
      canonStrictness: input.context.settings?.canonStrictness ?? null,
    },
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle ?? null,
    userIntent: input.userIntent,
    quickTag: input.selectedPlotLabel ?? null,
    previousSummary: previous?.summary ?? null,
    previousCliffhanger: previous?.cliffhanger ?? null,
    seriesSynopsis: input.context.seriesSynopsis ?? null,
  });

  // Cible produit : ~10 pages par chapitre, 1 scène = 1 page.
  const PAGE_ROLE_SEQUENCE: import("./chapter-outline").PageRole[] = [
    "establishing", "escalation", "confrontation", "escalation",
    "revelation", "aftermath", "escalation", "confrontation",
    "aftermath", "cliffhanger",
  ];

  const rawOutlineBeats = outlineResult.outline.beats.map((beat, index) => ({
    id: `beat_${index + 1}`,
    summary: beat.summary,
    tension: Math.min(9, 2 + index + Math.floor(index / 2)),
    characters: mergeCharactersFromBeat(
      input.context,
      beat.characters,
      beat.summary,
      index % 3 === 0
        ? mainCast.slice(0, Math.min(4, mainCast.length))
        : index % 2 === 0
          ? mainCast.slice(0, Math.min(3, mainCast.length))
          : [mainCast[index % mainCast.length] ?? mainCast[0], mainCast[(index + 1) % mainCast.length] ?? mainCast[0]].filter(Boolean),
    ),
    location: beat.location?.trim() || locAt(index === 0 ? 0 : Math.min(index, 1)),
    purpose: beat.emotionalTone ?? `beat_${index + 1}`,
    pageRole: beat.pageRole ?? PAGE_ROLE_SEQUENCE[index % PAGE_ROLE_SEQUENCE.length] ?? "escalation",
    turn: beat.turn ?? beat.summary.slice(0, 80),
    emotionalDelta: beat.emotionalDelta ?? (index % 2 === 0 ? 1 : -1),
  }));

  const TARGET_PAGES = 10;
  const dominantLocation = rawOutlineBeats[0]?.location || locA;
  const beats = stretchToCount(rawOutlineBeats, TARGET_PAGES, (index) => ({
    id: `beat_${index + 1}`,
    summary: `${chapterGoal}. Cette étape approfondit ${input.userIntent.slice(0, 120)} avec une progression plus ${selectedLabel}.`,
    tension: Math.min(9, 3 + index),
    characters: mainCast.slice(0, Math.min(index % 3 === 0 ? 4 : 3, mainCast.length)),
    location: dominantLocation,
    purpose: `variation_${index + 1}`,
    pageRole: PAGE_ROLE_SEQUENCE[index % PAGE_ROLE_SEQUENCE.length] ?? "escalation",
    turn: `Progression inattendue vers ${input.context.project.title}.`,
    emotionalDelta: index % 2 === 0 ? 1 : -1,
  }));

  const dynamicPlotOptions = buildDynamicPlotOptions({
    userIntent: input.userIntent,
    mainCast,
    previousSummary: previous?.summary ?? null,
    previousCliffhanger: previous?.cliffhanger ?? null,
    outline: {
      summary: outlineResult.outline.summary,
      cliffhanger: outlineResult.outline.cliffhanger,
      beats: rawOutlineBeats.map((beat) => ({
        summary: beat.summary,
        turn: beat.turn,
        location: beat.location,
        pageRole: beat.pageRole,
      })),
    },
  });

  const panelCounts = beats.map((beat, index) => {
    const t = beat.tension ?? (3 + index);
    // 4–6 cases par page maximum (lisibilité et cadrage).
    if (t >= 8) return 6;
    if (t >= 5) return index % 2 === 0 ? 5 : 6;
    return index % 3 === 0 ? 4 : 5;
  });
  const scenesBase = beats.map((beat, index) => ({
    id: `scene_${index + 1}`,
    title: `Scene ${index + 1}`,
    summary: beat.summary,
    location: beat.location,
    characters: beat.characters,
    purpose: beat.purpose,
  }));
  const panelBlueprintsByScene = scenesBase.map((scene, index) =>
    buildPanelBlueprints(scene, beats[index] ?? beats[0], panelCounts[index] ?? 6, genre),
  );

  const dialoguePlans = await Promise.all(
    scenesBase.map(async (scene, index) => {
      const blueprints = panelBlueprintsByScene[index] ?? [];
      const panelCount = blueprints.length || panelCounts[index] || 6;
      const layout = inferLayout(beats[index]?.tension ?? 5, panelCount);
      const dialogue = await writeDialogueForScene({
        sceneId: scene.id,
        sceneSummary: scene.summary,
        location: scene.location,
        tension: beats[index]?.tension ?? 5,
        emotionalObjective: scene.purpose,
        chapterGoal,
        panelCount,
        projectStyle: `${tone} / ${visualStyle} / dialogues ${input.context.settings?.dialogueDensity ?? 55}`,
        contentIntensityLayer: input.context.project.intensityLayer ?? undefined,
        continuityContext: [
          previous?.summary ? `Résumé précédent: ${previous.summary}` : "",
          previous?.cliffhanger ? `Cliffhanger précédent: ${previous.cliffhanger}` : "",
          ...(input.context.storyBible?.summary ? [`Bible: ${input.context.storyBible.summary}`] : []),
          ...input.context.retrievedDocs.map((doc) => `${doc.title ?? doc.entityType ?? "mémoire"}: ${doc.content}`).slice(0, 4),
        ].filter(Boolean),
        panelBlueprints: blueprints,
        characters: scene.characters.map((name) => {
          const c = input.context.characters.find((ch) => ch.name === name);
          return {
            name,
            roleType: c?.roleType ?? undefined,
            objective: c?.objective ?? undefined,
            fear: c?.fear ?? undefined,
            biography: c?.biography ?? undefined,
            traits: c?.traits ?? [],
            flaws: c?.flaws ?? [],
            speechProfile: c?.speechProfile ?? {},
            emotionalState: c?.emotionalState ?? undefined,
          };
        }),
      });

      return planPanelText({
        sceneId: scene.id,
        layout,
        panels: blueprints,
        dialogue: dialogue.panels,
      });
    }),
  );

  const scenes = scenesBase.map((scene, index) => {
    const plan = dialoguePlans[index] ?? [];
    return {
      ...scene,
      dialogue: plan.flatMap((panel, panelIndex) =>
        (panel.bubbles ?? []).map((bubble) => ({
          speaker: bubble.speaker ?? scene.characters[0] ?? mainCast[0],
          text: bubble.text,
          subtext: bubble.emotion ?? scene.purpose,
          emotion: bubble.emotion ?? ((beats[index]?.tension ?? 5) >= 7 ? "tension" : "calme"),
          intensity: Math.min(10, 3 + index + panelIndex),
          balloon: bubble.bubbleType ?? "speech",
        })),
      ),
    };
  });

  const storyboardPages: StoryboardPage[] = scenes.map((scene, pageIndex) => {
    const beat = beats[pageIndex] ?? beats[0];
    const count = panelCounts[pageIndex] ?? 6;
    const panels = buildPanelsForScene(
      input.context,
      scene,
      beat,
      panelBlueprintsByScene[pageIndex] ?? buildPanelBlueprints(scene, beat, count, genre),
      visualStyle,
      genre,
      dialoguePlans[pageIndex],
    );
    return {
      pageNumber: pageIndex + 1,
      layout: inferLayout(beat.tension, count),
      panels,
    };
  });

  // Garde-fou strict anti-duplication: régénération ciblée des pages répétées.
  const MAX_DUP_REGEN = 2;
  for (let attempt = 1; attempt <= MAX_DUP_REGEN; attempt++) {
    const duplicates = duplicatePageIndexes(storyboardPages);
    if (duplicates.length === 0) break;
    console.warn(`[chapter-pipeline] duplicate pages detected: attempt=${attempt} pages=${duplicates.join(",")}`);

    for (const pageIndex of duplicates) {
      const scene = scenes[pageIndex];
      const beat = beats[pageIndex] ?? beats[0];
      const count = panelCounts[pageIndex] ?? 6;
      const regenBlueprints = buildRegeneratedBlueprints(scene, beat, count, genre, attempt);
      const regeneratedPanels = buildPanelsForScene(
        input.context,
        scene,
        beat,
        regenBlueprints,
        visualStyle,
        genre,
        dialoguePlans[pageIndex],
      ).map((panel, panelIndex) => ({
        ...panel,
        panelNumber: panelIndex + 1,
      }));

      storyboardPages[pageIndex] = {
        pageNumber: pageIndex + 1,
        layout: inferLayout(Math.min(9, beat.tension + attempt), count),
        panels: regeneratedPanels,
      };
    }
  }

  const remainingDuplicates = duplicatePageIndexes(storyboardPages);
  if (remainingDuplicates.length > 0) {
    console.warn(`[chapter-pipeline] duplicate pages still present after regen: ${remainingDuplicates.join(",")}`);
  }

  const cliffhanger = outlineResult.outline.cliffhanger;
  const narrativeSummary = buildNarrativeSummary({
    projectTitle: input.context.project.title,
    chapterGoal,
    scenes,
    cliffhanger,
  });

  return {
    creativeDirection: {
      chapterGoal,
      tone,
      whyNow: `Le chapitre capitalise sur les récents événements pour faire progresser ${input.context.project.title} sans casser la continuité.`,
    },
    plotOptions: dynamicPlotOptions,
    outline: {
      chapter_title: outlineResult.outline.title ?? input.chapterTitle ?? `Chapitre ${input.chapterNumber}`,
      chapter_goal: chapterGoal,
      tone,
      beats,
      cliffhanger,
      continuity_notes: [
        `Conserver la cohérence émotionnelle de ${mainCast[0]}.`,
        "Réutiliser la mémoire récente avant toute nouvelle révélation.",
        "Ne pas contredire les relations ou statuts canoniques.",
      ],
    },
    script: { scenes },
    storyboard: {
      pageCount: storyboardPages.length,
      pages: storyboardPages,
    },
    memory: {
      narrativeSummary,
      structuredState: {
        chapterGoal,
        cliffhanger,
        involvedCharacters: mainCast,
        focusCharacterIds: input.context.focusCharacterIds ?? [],
        selectedPlotLabel: input.selectedPlotLabel ?? "bold",
        location: locD ?? locC,
      },
      timelineEvents: scenes.map((scene, index) => ({
        eventType: "chapter_beat",
        summary: scene.summary,
        importance: 45 + index * 10,
        entities: { characters: scene.characters, location: scene.location },
        permanent: true,
      })),
      openLoops: [cliffhanger, `Conséquences de la décision prise à ${locC}.`, `Effets durables sur ${mainCast.join(", ")}.`],
    },
  };
}
