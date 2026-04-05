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

function stretchToCount<T>(items: T[], count: number, fallbackFactory: (index: number) => T): T[] {
  if (items.length >= count) return items.slice(0, count);
  const next = [...items];
  for (let i = items.length; i < count; i++) {
    next.push(items[i % Math.max(items.length, 1)] ?? fallbackFactory(i));
  }
  return next;
}

function inferLocations(context: ProjectContextForChapter) {
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
  // - 6 panels: A, C, D
  // - 5 panels: use A or C (last area empty)
  // - 4 panels: use layout F (2×2) or fallback to A with 2 empty areas
  if (panelCount >= 6) return tension >= 8 ? "D" : tension >= 5 ? "C" : "A";
  if (panelCount === 5) return tension >= 6 ? "C" : "A";
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

function buildPanelBlueprints(
  scene: { id: string; summary: string; location: string; characters: string[]; purpose: string },
  beat: { summary: string; tension: number },
  panelCount: number,
  genre: string,
): PanelBlueprint[] {
  const mainA = scene.characters[0] ?? "Le protagoniste";
  const mainB = scene.characters[1] ?? mainA;
  const actionTemplates = [
    `Installer ${scene.location} et l'état émotionnel de ${mainA}.`,
    `${mainA} perçoit un détail lié à : ${beat.summary}`,
    `${mainA} et ${mainB} se répondent avec tension autour de ${scene.purpose}.`,
    `Un geste, regard ou silence change la lecture de la scène.`,
    `La pression monte concrètement autour de ${beat.summary}.`,
    `${mainA} prend une décision qui coûte quelque chose.`,
    `La dernière image relance la suite avec une conséquence immédiate.`,
  ];

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
      action:
        actionTemplates[panelIndex] ??
        `${scene.summary} Progression panel ${panelIndex + 1} dans ${scene.location}.`,
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
  const cameras = [
    "wide establishing shot",
    "medium shot",
    "close-up on face",
    "over-the-shoulder shot",
    "extreme close-up on eyes",
    "low angle shot",
    "bird's eye view",
  ];

  const panels: StoryboardPanel[] = [];
  for (let i = 0; i < panelBlueprints.length; i++) {
    const blueprint = panelBlueprints[i];
    const panelTension = beat.tension + (i / Math.max(panelBlueprints.length, 1)) * 2;
    const mood = blueprint?.mood ?? inferMood(panelTension, genre);
    const camera = cameras[i % cameras.length] ?? "medium shot";
    const action = blueprint?.action ?? scene.summary;
    const charSubset = blueprint?.characters?.length ? blueprint.characters : scene.characters;

    const textPlan = panelTextPlan?.[i];
    const leadBubble = textPlan?.bubbles?.[0];
    const sfxMap: Record<PanelMood, string | undefined> = {
      action: "WHAM!",
      tension: undefined,
      emotion: undefined,
      revelation: "...",
      calm: undefined,
      horror: "CREAK...",
      romance: undefined,
      comedy: "BOING!",
      dramatic: undefined,
    };

    panels.push({
      panelNumber: i + 1,
      sceneId: scene.id,
      beatId: beat.id,
      caption: i === 0 ? scene.summary : i === panelBlueprints.length - 1 ? `${action}` : action,
      prompt: buildPanelPrompt(
        context,
        charSubset,
        scene.location,
        camera,
        action,
        mood,
        visualStyle,
      ),
      negativePrompt: STD_NEGATIVE,
      camera,
      characters: charSubset,
      mood,
      sfx: textPlan?.sfx?.[0] ?? sfxMap[mood],
      dialogue: leadBubble
        ? { speaker: leadBubble.speaker ?? charSubset[0] ?? scene.characters[0] ?? "Narrateur", text: leadBubble.text }
        : undefined,
      narration: textPlan?.narration?.[0] ?? (i === 0 ? scene.summary : undefined),
      textScale: textPlan?.textScale ?? "normal",
    });
  }
  return panels;
}

export async function generateChapterBundle(input: {
  chapterNumber: number;
  chapterTitle?: string | null;
  userIntent: string;
  selectedPlotLabel?: "safe" | "bold" | "shock";
  context: ProjectContextForChapter;
}): Promise<GeneratedChapterBundle> {
  const cast = takeNames(input.context, 4);
  const mainCast = cast.length > 0 ? cast : ["Le protagoniste", "L'antagoniste"];
  const locations = inferLocations(input.context);
  const [locA, locB, locC, locD] = locations;
  const locAt = (i: number) => locations[i % Math.max(locations.length, 1)] ?? locA;
  const tone = input.context.project.tone ?? "dramatique";
  const genre = (input.context.project.primaryGenre ?? "fantasy").toLowerCase();
  const visualStyle = inferVisualStyle(input.context);
  const chapterGoal = `Faire avancer l'intrigue autour de : ${input.userIntent}`;

  const optionSeed = [
    {
      id: "safe",
      title: "Progression logique",
      label: "safe" as const,
      summary: `${mainCast[0]} suit la conséquence immédiate du chapitre précédent et obtient une piste concrète.`,
    },
    {
      id: "bold",
      title: "Accélération émotionnelle",
      label: "bold" as const,
      summary: `${mainCast[0]} confronte directement ${mainCast[1] ?? "un allié ambigu"} et force une décision risquée.`,
    },
    {
      id: "shock",
      title: "Rupture dramatique",
      label: "shock" as const,
      summary: `Une révélation sur ${mainCast[1] ?? "le passé du groupe"} change la lecture de tous les événements récents.`,
    },
  ];

  const selected =
    optionSeed.find((o) => o.label === (input.selectedPlotLabel ?? "bold")) ?? optionSeed[1];

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
  const rawOutlineBeats = outlineResult.outline.beats.map((beat, index) => ({
    id: `beat_${index + 1}`,
    summary: beat.summary,
    tension: Math.min(9, 2 + index + Math.floor(index / 2)),
    characters: extractCharactersFromText(
      input.context,
      beat.summary,
      index % 3 === 0
        ? mainCast.slice(0, Math.min(3, mainCast.length))
        : index % 2 === 0
          ? mainCast.slice(0, Math.min(2, mainCast.length))
          : [mainCast[index % mainCast.length] ?? mainCast[0], mainCast[(index + 1) % mainCast.length] ?? mainCast[0]].filter(Boolean),
    ),
    location: locAt(index),
    purpose: beat.emotionalTone ?? `beat_${index + 1}`,
  }));

  const TARGET_PAGES = 10;
  const beats = stretchToCount(rawOutlineBeats, TARGET_PAGES, (index) => ({
    id: `beat_${index + 1}`,
    summary: `${selected.summary} Cette étape fait avancer ${input.context.project.title} dans une nouvelle direction.`,
    tension: Math.min(9, 3 + index),
    characters: mainCast.slice(0, Math.min(2 + (index % 2), mainCast.length)),
    location: locAt(index),
    purpose: `variation_${index + 1}`,
  }));

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
    plotOptions: optionSeed,
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
