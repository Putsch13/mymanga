import { generateChapterOutline } from "./chapter-outline";
import {
  duplicatePageIndexes,
  buildRegeneratedBlueprints as buildRegeneratedBlueprintsImpl,
} from "./chapter/page-dedup";
import {
  inferVisualStyle,
  inferMood,
  inferLayout,
} from "./chapter/visual-inference";
import {
  inferLocations,
  resolveCanonicalLocation,
} from "./chapter/location-inference";
import { summarizeGenerationStatuses } from "./generation-status";
import { parseIntentEntities } from "./services/entity-brain";
import { writeDialogueForScene } from "./services/dialogue-writer";
import { planPanelText, type PanelTextPlan } from "./services/panel-text-planner";
import { analyzeBeatsForRepetition } from "./beat-advancement-checker";
import type { ApprovedChapterOutline, SceneContinuityPayload, StructuredBeatPayload } from "@manga-ai-studio/core";
import { creativityControlsSchema, type CreativityControls } from "@manga-ai-studio/world";
import type { ChapterOutlineGenerationResult } from "./chapter-outline";

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
  locations?: Array<{
    name: string;
    type?: string | null;
    description?: string | null;
    aliases?: string[];
    visualBrief?: string | null;
    canonLocked?: boolean;
  }>;
  intentEntities?: Array<{
    name: string;
    entityKind: string;
    dialogueMode: string;
    recurrencePolicy: string;
    roleHint?: string | null;
    speciesLabel?: string | null;
  }>;
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
    entityKind?: string | null;
    speciesLabel?: string | null;
    dialogueMode?: string | null;
    recurrencePolicy?: string | null;
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

function normalizeCreativityControls(input: Partial<CreativityControls> | undefined): CreativityControls {
  return creativityControlsSchema.parse(input ?? {});
}

function describeCreativityProfile(input: CreativityControls) {
  const novelty = input.noveltyLevel >= 70 ? "variations plus audacieuses" : input.noveltyLevel <= 35 ? "variations très maîtrisées" : "variations équilibrées";
  const canon = input.worldStrictness >= 85 ? "canon verrouillé" : input.worldStrictness <= 45 ? "canon plus souple" : "canon surveillé";
  const environment = input.environmentRichness >= 75 ? "décors plus riches" : "décors plus fonctionnels";
  const npc = input.npcVariety >= 70 ? "présence PNJ plus variée" : "présence PNJ contenue";
  return `${novelty}, ${canon}, ${environment}, ${npc}`;
}

export type GeneratedChapterBundle = {
  generationDiagnostics: {
    operationalStatus: string;
    degradedModes: string[];
    outline: {
      degradedStatus: string;
      usedFallback: boolean;
      fallbackReason?: string;
      model?: string;
    };
    dialogue: {
      degradedStatus: string;
      usedFallback: boolean;
      fallbackSceneIds: string[];
      reasonsByScene: Array<{ sceneId: string; reason: string }>;
    };
  };
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
      pageRole?: string;
      turn?: string;
      emotionalDelta?: number;
      structuredBeat?: StructuredBeatPayload;
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
      continuityPayload: SceneContinuityPayload;
      dialogue: Array<{
        speaker: string;
        text: string;
        subtext: string;
        emotion: string;
        intensity: number;
        balloon: string;
      }>;
      generationDiagnostics?: {
        dialogue: {
          degradedStatus: string;
          usedFallback: boolean;
          fallbackReason?: string;
        };
      };
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

function shouldKeepSingleLocation(userIntent: string, beats: Array<{ location: string }>) {
  const transitionHints = /(plus tard|ensuite|puis|après|change de lieu|quitte|rejoint|traverse|retourne à|retourne au|retourne en)/i;
  if (transitionHints.test(userIntent)) return false;
  const distinct = [...new Set(beats.map((b) => b.location.trim().toLowerCase()).filter(Boolean))];
  return distinct.length <= 2;
}

function stretchToCount<T>(items: T[], count: number, fallbackFactory: (index: number) => T): T[] {
  if (items.length >= count) return items.slice(0, count);
  const next = [...items];
  for (let i = items.length; i < count; i++) {
    next.push(fallbackFactory(i));
  }
  return next;
}

// inferLocations extrait dans ./chapter/location-inference.ts

function reinforceIntentEntityCoverage(
  beats: Array<{ characters: string[]; summary: string; turn: string; pageRole: string }>,
  intentEntityHints: Array<{ name: string; recurrencePolicy?: string | null; roleHint?: string | null }>,
) {
  if (intentEntityHints.length === 0 || beats.length === 0) return;
  for (const entity of intentEntityHints) {
    const targetIndexes = entity.recurrencePolicy === "story_locked" || entity.recurrencePolicy === "recurring"
      ? [...new Set([0, Math.floor(beats.length / 2), Math.max(0, beats.length - 2)])]
      : [0];
    for (const index of targetIndexes) {
      const beat = beats[index];
      if (!beat) continue;
      if (!beat.characters.includes(entity.name)) {
        beat.characters = [...beat.characters, entity.name];
      }
      if (!beat.summary.toLowerCase().includes(entity.name.toLowerCase())) {
        beat.summary = `${beat.summary} ${entity.name} joue un rôle concret dans cette étape.`;
      }
      if (
        entity.roleHint &&
        !beat.turn.toLowerCase().includes(entity.name.toLowerCase()) &&
        (beat.pageRole === "revelation" || beat.pageRole === "cliffhanger" || index === 0)
      ) {
        beat.turn = `${beat.turn} ${entity.name} intervient (${entity.roleHint}).`;
      }
    }
  }
}

// resolveCanonicalLocation extrait dans ./chapter/location-inference.ts

function buildDynamicPlotOptions(input: {
  userIntent: string;
  mainCast: string[];
  previousSummary: string | null;
  previousCliffhanger: string | null;
  creativityControls: CreativityControls;
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
  const environmentHint = input.creativityControls.environmentRichness >= 70 ? "avec un décor plus incarné" : "dans un cadre lisible";
  const npcHint = input.creativityControls.npcVariety >= 70 ? "et une pression de foule plus variée" : "en gardant les présences secondaires sous contrôle";
  const canonHint = input.creativityControls.worldStrictness >= 85 ? "sans dévier du canon établi" : "avec un peu plus de latitude sur l'ambiance";

  return [
    {
      id: "safe",
      title: "Progression logique",
      label: "safe" as const,
      summary: `Après ${previousAnchor}, ${hero} suit ${firstBeat?.turn?.toLowerCase() ?? "une piste concrète"} à ${firstBeat?.location ?? "un lieu clé"} ${environmentHint} pour faire avancer ${input.userIntent.slice(0, 80)} ${canonHint}.`,
    },
    {
      id: "bold",
      title: "Accélération émotionnelle",
      label: "bold" as const,
      summary: `${hero} et ${second} se heurtent autour de ${middleBeat?.summary?.slice(0, 90) ?? input.userIntent.slice(0, 90)}, ce qui force une décision risquée et plus intime, ${npcHint}.`,
    },
    {
      id: "shock",
      title: "Rupture dramatique",
      label: "shock" as const,
      summary: `Le chapitre pousse vers ${lastBeat?.turn?.toLowerCase() ?? input.outline.cliffhanger.toLowerCase()} et transforme ${input.outline.cliffhanger.toLowerCase()} en vraie ouverture de saga, avec ${input.creativityControls.noveltyLevel >= 70 ? "une rupture plus inattendue" : "une montée plus contrôlée"}.`,
    },
  ];
}

// inferVisualStyle / inferMood / inferLayout extraits dans ./chapter/visual-inference.ts
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
    `Plan large narratif : ${c.summary} Décor lisible de ${c.location}.`,
    `${c.mainA} capte un détail concret du lieu qui soutient : ${c.summary}`,
    `${c.mainA} entre dans le lieu, posture et expression lisibles.`,
    `Un élément de l'environnement annonce la suite : ${c.turn}`,
    `Narration visuelle : le regard de ${c.mainA} se pose sur un indice.`,
    `Transition douce vers l'action : ${c.mainA} s'approche de ${c.mainB}.`,
  ],
  escalation: (c) => [
    `${c.summary} La tension devient concrète entre ${c.mainA} et ${c.mainB}.`,
    `Un échange de regards chargé de tension autour de ${c.purpose}.`,
    `${c.mainA} réalise quelque chose : ${c.turn}`,
    `La pression monte : un détail concret aggrave la situation.`,
    `${c.mainB} réagit violemment ou émotionnellement.`,
    `Point de non-retour : ${c.mainA} doit agir maintenant.`,
  ],
  confrontation: (c) => [
    `${c.summary} Face à face clair : ${c.mainA} contre ${c.mainB}.`,
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
    `${c.summary} L'accélération devient irréversible.`,
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
    const isEstablishingPanel = panelIndex === 0;
    const isClosingPanel = panelIndex === panelCount - 1;
    const shouldKeepFullScene =
      isEstablishingPanel
      || role === "confrontation"
      || role === "aftermath"
      || role === "cliffhanger";
    const focusedCharacter =
      scene.characters[panelIndex % Math.max(scene.characters.length, 1)] ?? mainA;
    const supportCharacter =
      scene.characters[(panelIndex + 1) % Math.max(scene.characters.length, 1)] ?? mainB;
    const baseCharacters = shouldKeepFullScene
      ? scene.characters
      : isClosingPanel
        ? [focusedCharacter, supportCharacter].filter((name, index, all) => Boolean(name) && all.indexOf(name) === index)
        : [focusedCharacter].filter(Boolean);
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

function buildMemoryTimelineEventsFromScenes(
  scenes: Array<{
    summary: string;
    location: string;
    characters: string[];
    continuityPayload: SceneContinuityPayload;
  }>,
) {
  return scenes.flatMap((scene, sceneIndex) => {
    const explicitEvents = scene.continuityPayload.sceneEvents;
    if (explicitEvents.length > 0) {
      return explicitEvents.map((event, eventIndex) => ({
        eventType: event.eventType,
        summary: event.description,
        importance:
          event.importance === "critical"
            ? 90
            : event.importance === "major"
              ? 70
              : Math.max(35, 45 + sceneIndex * 5 - eventIndex * 3),
        entities: {
          characters: event.actorNames ?? scene.characters,
          location: event.location ?? scene.location,
          consequences: event.consequences ?? [],
          objectsGained: event.objectsGained ?? [],
          objectsLost: event.objectsLost ?? [],
          injuriesApplied: event.injuriesApplied ?? [],
          injuriesResolved: event.injuriesResolved ?? [],
          relationshipChanges: event.relationshipChanges ?? [],
          continuityFlags: event.continuityFlags ?? [],
        },
        permanent: Boolean(event.irreversible),
      }));
    }
    return [{
      eventType: "chapter_beat",
      summary: scene.summary,
      importance: 45 + sceneIndex * 10,
      entities: { characters: scene.characters, location: scene.location },
      permanent: true,
    }];
  });
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
      .filter((b: { text?: string }) => b.text?.trim())
      .slice(0, 3)
      .map((b: { speaker?: string; text?: string }) => ({
        speaker: b.speaker ?? normalizedChars[0] ?? scene.characters[0] ?? "Narrateur",
        text: b.text as string, // Safe: filtered above for truthy text
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

// Les helpers de déduplication (pageDupSignature, duplicatePageIndexes,
// buildRegeneratedBlueprints) sont extraits dans ./chapter/page-dedup.ts.
function buildRegeneratedBlueprints(
  scene: { id: string; summary: string; location: string; characters: string[]; purpose: string },
  beat: { summary: string; tension: number },
  panelCount: number,
  genre: string,
  attempt: number,
): PanelBlueprint[] {
  return buildRegeneratedBlueprintsImpl(
    buildPanelBlueprints,
    scene,
    beat,
    panelCount,
    genre,
    attempt,
  );
}

export async function generateChapterBundle(input: {
  chapterId?: string;
  chapterNumber: number;
  chapterTitle?: string | null;
  userIntent: string;
  selectedPlotLabel?: "safe" | "bold" | "shock";
  creativityControls?: Partial<CreativityControls>;
  context: ProjectContextForChapter;
  approvedOutline?: ApprovedChapterOutline | null;
}): Promise<GeneratedChapterBundle> {
  const effectiveCreativeControls = normalizeCreativityControls(input.creativityControls);
  const cast = takeNames(input.context, 6);
  const mainCast = cast.length > 0 ? cast : ["Le protagoniste", "L'antagoniste"];
  const intentEntityHints = parseIntentEntities(
    input.userIntent,
    input.context.characters.map((c) => c.name),
  );
  const locations = inferLocations(input.context, input.userIntent);
  const [locA, locB, locC, locD] = locations;
  const locAt = (i: number) => locations[i % Math.max(locations.length, 1)] ?? locA;
  const tone = input.context.project.tone ?? "dramatique";
  const genre = (input.context.project.primaryGenre?.trim() || "generic").toLowerCase();
  const visualStyle = inferVisualStyle(input.context);
  const chapterGoal = input.approvedOutline?.summary ?? `Faire avancer l'intrigue autour de : ${input.userIntent}`;
  const selectedLabel = input.selectedPlotLabel ?? "bold";

  const previous = input.context.recentChapters[0];
  const outlineResult: ChapterOutlineGenerationResult = input.approvedOutline
    ? {
        outline: {
          title: input.chapterTitle ?? `Chapitre ${input.chapterNumber}`,
          summary: input.approvedOutline.summary,
          cliffhanger: input.approvedOutline.cliffhanger,
          beats: input.approvedOutline.beats.map((beat) => ({
            summary: beat.summary,
            emotionalTone: beat.pageRole,
            pageRole: beat.pageRole as import("./chapter-outline").PageRole,
            turn: beat.turn,
            emotionalDelta: beat.emotionalDelta,
            location: beat.location,
            characters: beat.characters,
            structuredBeat: (beat.structuredBeat ?? {
              source: "heuristic_fallback",
              confidence: 0.45,
              arcPromises: [],
              worldConsequences: [],
              setupPayoffHooks: [],
            }) as StructuredBeatPayload,
          })),
        },
        usedOpenAI: false,
        model: "user-approved-outline",
        degradedStatus: "FULLY_OPERATIONAL",
      }
    : await generateChapterOutline({
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
        intentEntities: intentEntityHints,
        knownLocations: (input.context.locations ?? []).slice(0, 12),
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
        creativityControls: effectiveCreativeControls,
        previousSummary: previous?.summary ?? null,
        previousCliffhanger: previous?.cliffhanger ?? null,
        seriesSynopsis: input.context.seriesSynopsis ?? null,
        targetBeats: 10,
      });
  if (outlineResult.degradedStatus !== "FULLY_OPERATIONAL") {
    console.warn(
      `[chapter-pipeline] outline degraded chapter=${input.chapterNumber} status=${outlineResult.degradedStatus} reason=${outlineResult.fallbackReason ?? "n/a"}`,
    );
  }

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
    location: resolveCanonicalLocation(input.context, beat.location?.trim()) ?? locAt(index === 0 ? 0 : Math.min(index, 1)),
    purpose: beat.emotionalTone ?? `beat_${index + 1}`,
    pageRole: beat.pageRole ?? PAGE_ROLE_SEQUENCE[index % PAGE_ROLE_SEQUENCE.length] ?? "escalation",
    turn: beat.turn ?? beat.summary.slice(0, 80),
    emotionalDelta: beat.emotionalDelta ?? (index % 2 === 0 ? 1 : -1),
    structuredBeat: beat.structuredBeat,
  }));

  if (!input.approvedOutline && shouldKeepSingleLocation(input.userIntent, rawOutlineBeats)) {
    const dominantLocation = rawOutlineBeats[0]?.location || locA;
    for (const beat of rawOutlineBeats) {
      beat.location = dominantLocation;
    }
  }

  if (!input.approvedOutline && intentEntityHints.length > 0) {
    for (let index = 0; index < Math.min(2, rawOutlineBeats.length); index++) {
      const beat = rawOutlineBeats[index];
      if (!beat) continue;
      beat.characters = [...new Set([...beat.characters, ...intentEntityHints.map((entity) => entity.name)])];
    }
  }

  const TARGET_PAGES = input.approvedOutline ? input.approvedOutline.beats.length : 10;
  const dominantLocation = rawOutlineBeats[0]?.location || locA;
  const beats = input.approvedOutline
    ? rawOutlineBeats.slice(0, TARGET_PAGES)
    : (() => {
        const lastBeat = rawOutlineBeats[rawOutlineBeats.length - 1];
        const lastLocation = lastBeat?.location ?? dominantLocation;
        const lastSummaryBase = lastBeat?.summary?.slice(0, 80) ?? input.userIntent.slice(0, 80);
        const STRETCH_PHASES: string[] = [
          `Les conséquences de ${lastSummaryBase} deviennent physiquement visibles autour de ${lastLocation}.`,
          `${mainCast[0] ?? "Le héros"} fait face à un obstacle concret qui bloque sa progression.`,
          `Un personnage secondaire intervient — son action change la dynamique de la scène à ${lastLocation}.`,
          `${mainCast[0] ?? "Le héros"} prend une décision visible : un geste, un mouvement, un choix physique.`,
          `L'environnement réagit : ${lastLocation} se transforme ou révèle un nouvel élément.`,
          `Confrontation directe : ${mainCast[0] ?? "le héros"} et son adversaire se retrouvent face à face.`,
        ];
        return stretchToCount(rawOutlineBeats, TARGET_PAGES, (index) => ({
          id: "beat_" + (index + 1),
          summary: STRETCH_PHASES[index % STRETCH_PHASES.length] ?? STRETCH_PHASES[0]!,
          tension: Math.min(9, 3 + index),
          characters: mainCast.slice(0, Math.min(index % 3 === 0 ? 4 : 3, mainCast.length)),
          location: index % 2 === 0 ? dominantLocation : (locB ?? dominantLocation),
          purpose: "variation_" + (index + 1),
          pageRole: PAGE_ROLE_SEQUENCE[index % PAGE_ROLE_SEQUENCE.length] ?? "escalation",
          turn: "Conséquence directe : la situation évolue de manière irréversible (étape " + (index + 1) + ").",
          emotionalDelta: index % 2 === 0 ? 1 : -1,
          structuredBeat: rawOutlineBeats[Math.max(0, rawOutlineBeats.length - 1)]?.structuredBeat,
        }));
      })();

  if (!input.approvedOutline) {
    reinforceIntentEntityCoverage(beats, intentEntityHints);
  }

  if (!input.approvedOutline) {
    const beatAdvancement = await analyzeBeatsForRepetition(
      beats.map((beat) => ({
        id: beat.id,
        summary: beat.summary,
        location: beat.location,
        characters: beat.characters,
        tension: beat.tension,
        purpose: beat.purpose,
      })),
      {
        currentThreads: [input.userIntent, previous?.cliffhanger ?? "", previous?.summary ?? ""].filter(Boolean),
        characterGoals: Object.fromEntries(
          input.context.characters
            .filter((character) => character.objective)
            .map((character) => [character.name, character.objective ?? ""])
        ),
      },
    );
    beatAdvancement.results.forEach((result, index) => {
      if (!result.shouldReject) return;
      const beat = beats[index];
      if (!beat) return;
      const fallbackLocation = locAt(index + 1);
      if (index > 0 && beats[index - 1]?.location === beat.location && fallbackLocation !== beat.location) {
        beat.location = fallbackLocation;
      }
      beat.summary = `${beat.summary} Nouvelle conséquence concrète : ${result.advancement.whatChanges}.`;
      beat.turn = `${beat.turn} Le lecteur comprend : ${result.advancement.readerLearns}.`;
      beat.purpose = `${beat.purpose} / progression`;
      beat.tension = Math.min(9, beat.tension + 1);
    });
  }

  const dynamicPlotOptions = buildDynamicPlotOptions({
    userIntent: input.userIntent,
    mainCast,
    previousSummary: previous?.summary ?? null,
    previousCliffhanger: previous?.cliffhanger ?? null,
    creativityControls: effectiveCreativeControls,
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
        structuredBeatPayload: beats[index]?.structuredBeat,
        continuityContext: [
          previous?.summary ? `Résumé précédent: ${previous.summary}` : "",
          previous?.cliffhanger ? `Cliffhanger précédent: ${previous.cliffhanger}` : "",
          beats[index]?.structuredBeat
            ? `Structured beat payload: ${JSON.stringify(beats[index]?.structuredBeat)}`
            : "",
          ...(input.context.storyBible?.summary ? [`Bible: ${input.context.storyBible.summary}`] : []),
          ...input.context.retrievedDocs.map((doc) => `${doc.title ?? doc.entityType ?? "mémoire"}: ${doc.content}`).slice(0, 4),
        ].filter(Boolean),
        panelBlueprints: blueprints,
        characters: scene.characters.map((name) => {
          const c = input.context.characters.find((ch) => ch.name === name);
          return {
            name,
            entityKind: c?.entityKind ?? undefined,
            dialogueMode: c?.dialogueMode ?? undefined,
            speciesLabel: c?.speciesLabel ?? undefined,
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
      if (dialogue.usedFallback) {
        console.warn(
          `[chapter-pipeline] dialogue degraded scene=${scene.id} status=${dialogue.degradedStatus} reason=${dialogue.fallbackReason ?? "n/a"}`,
        );
      }

      return {
        plannedPanels: planPanelText({
          sceneId: scene.id,
          layout,
          panels: blueprints,
          dialogue: dialogue.panels,
        }),
        continuityPayload: dialogue.continuityPayload,
        dialogueDiagnostics: {
          degradedStatus: dialogue.degradedStatus,
          usedFallback: dialogue.usedFallback,
          fallbackReason: dialogue.fallbackReason,
        },
      };
    }),
  );

  const scenes = scenesBase.map((scene, index) => {
    const plan = dialoguePlans[index]?.plannedPanels ?? [];
    return {
      ...scene,
      continuityPayload: dialoguePlans[index]?.continuityPayload ?? {
        source: "heuristic_fallback",
        confidence: 0.3,
        sceneEvents: [],
        characterDeltas: [],
        locationDeltas: [],
        arcDeltas: [],
      },
      dialogue: plan.flatMap((panel, panelIndex) =>
        (panel.bubbles ?? []).map((bubble: { speaker?: string; text?: string; emotion?: string; bubbleType?: string }) => ({
          speaker: bubble.speaker ?? scene.characters[0] ?? mainCast[0],
          text: bubble.text as string, // Safe: bubbles are always generated with text
          subtext: bubble.emotion ?? scene.purpose,
          emotion: bubble.emotion ?? ((beats[index]?.tension ?? 5) >= 7 ? "tension" : "calme"),
          intensity: Math.min(10, 3 + index + panelIndex),
          balloon: bubble.bubbleType ?? "speech",
        })),
      ),
      generationDiagnostics: {
        dialogue: dialoguePlans[index]?.dialogueDiagnostics ?? {
          degradedStatus: "FULLY_OPERATIONAL",
          usedFallback: false,
        },
      },
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
      dialoguePlans[pageIndex]?.plannedPanels,
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
        dialoguePlans[pageIndex]?.plannedPanels,
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
  const dialogueFallbacks = scenes
    .filter((scene) => scene.generationDiagnostics?.dialogue.usedFallback)
    .map((scene) => ({
      sceneId: scene.id,
      reason:
        scene.generationDiagnostics?.dialogue.fallbackReason ?? "Dialogue fallback used",
    }));
  const bundleStatus = summarizeGenerationStatuses([
    outlineResult.degradedStatus,
    ...dialogueFallbacks.map(() => "DEGRADED_DIALOGUE_FALLBACK" as const),
  ]);

  return {
    generationDiagnostics: {
      operationalStatus: bundleStatus.operationalStatus,
      degradedModes: bundleStatus.degradedModes,
      outline: {
        degradedStatus: outlineResult.degradedStatus,
        usedFallback: input.approvedOutline ? false : !outlineResult.usedOpenAI,
        fallbackReason: input.approvedOutline ? undefined : outlineResult.fallbackReason,
        model: outlineResult.model,
      },
      dialogue: {
        degradedStatus: dialogueFallbacks.length > 0 ? "DEGRADED_DIALOGUE_FALLBACK" : "FULLY_OPERATIONAL",
        usedFallback: dialogueFallbacks.length > 0,
        fallbackSceneIds: dialogueFallbacks.map((item) => item.sceneId),
        reasonsByScene: dialogueFallbacks,
      },
    },
    creativeDirection: {
      chapterGoal,
      tone,
      whyNow: `Le chapitre capitalise sur les récents événements pour faire progresser ${input.context.project.title} sans casser la continuité, avec ${describeCreativityProfile(effectiveCreativeControls)}.`,
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
        ...beats.flatMap((beat) => beat.structuredBeat?.setupPayoffHooks.slice(0, 1).map((hook) => `Hook: ${hook.label}`) ?? []).slice(0, 3),
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
        creativityControls: effectiveCreativeControls,
        location: locD ?? locC,
        outlineBeatPayloads: beats.map((beat) => ({
          beatId: beat.id,
          payload: beat.structuredBeat ?? null,
        })),
        sceneContinuityPayloads: scenes.map((scene) => ({
          sceneId: scene.id,
          payload: scene.continuityPayload,
        })),
      },
      timelineEvents: buildMemoryTimelineEventsFromScenes(scenes),
      openLoops: [cliffhanger, `Conséquences de la décision prise à ${locC}.`, `Effets durables sur ${mainCast.join(", ")}.`],
    },
  };
}
