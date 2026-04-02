export type ProjectContextForChapter = {
  project: {
    title: string;
    pitch: string | null;
    primaryGenre: string | null;
    tone: string | null;
    format: string | null;
    visualStyle?: string | null;
    contentRating?: string | null;
    intensityLayer?: string | null;
  };
  characters: Array<{
    id: string;
    name: string;
    roleType: string | null;
    objective: string | null;
    fear: string | null;
    emotionalState: string | null;
    status: string;
    appearance?: string | null;
    outfitDefault?: string | null;
    hairColor?: string | null;
    eyeColor?: string | null;
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
    content: string;
  }>;
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

export type GridLayout = "A" | "B" | "C" | "D" | "E";

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
};

export type StoryboardPage = {
  pageNumber: number;
  layout: GridLayout;
  panels: StoryboardPanel[];
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
  return context.characters.slice(0, count).map((c) => c.name);
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
  const vs = context.project.visualStyle ?? "";
  if (vs) return vs;
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
  if (panelCount === 7) return tension >= 8 ? "E" : "D";
  if (panelCount === 6) return tension >= 7 ? "C" : "B";
  return "A";
}

const STD_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, watermark, text overlay, low quality, duplicate character";

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
    "high detail, professional manga art, consistent character design",
  ]
    .filter(Boolean)
    .join(", ");
}

function buildPanelsForScene(
  context: ProjectContextForChapter,
  scene: { id: string; location: string; characters: string[]; summary: string; purpose: string },
  beat: { id: string; tension: number },
  panelCount: number,
  visualStyle: string,
  genre: string,
  sceneDialogue: Array<{ speaker: string; text: string; subtext: string; emotion: string }>,
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

  const actions = [
    `${scene.characters[0] ?? "protagonist"} arrives at the scene`,
    `tension rises between characters`,
    `${scene.characters[0] ?? "protagonist"} reacts with shock`,
    `confrontation escalates`,
    `a key object or detail is revealed`,
    `${scene.characters[0] ?? "protagonist"} makes a decision`,
    `dramatic consequence unfolds`,
  ];

  const panels: StoryboardPanel[] = [];
  for (let i = 0; i < panelCount; i++) {
    const panelTension = beat.tension + (i / panelCount) * 2;
    const mood = inferMood(panelTension, genre);
    const camera = cameras[i % cameras.length] ?? "medium shot";
    const action = actions[i % actions.length] ?? "character reacts";
    const charSubset =
      i === 0
        ? scene.characters
        : i % 3 === 0
          ? scene.characters
          : [scene.characters[i % scene.characters.length] ?? scene.characters[0]].filter(Boolean);

    const dialogueLine = sceneDialogue[i];
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
      caption:
        i === 0
          ? scene.summary
          : i === panelCount - 1
            ? `La tension atteint son paroxysme.`
            : action,
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
      sfx: sfxMap[mood],
      dialogue: dialogueLine
        ? { speaker: dialogueLine.speaker, text: dialogueLine.text }
        : undefined,
      narration: i === 0 ? scene.summary : undefined,
    });
  }
  return panels;
}

export function generateChapterBundle(input: {
  chapterNumber: number;
  chapterTitle?: string | null;
  userIntent: string;
  selectedPlotLabel?: "safe" | "bold" | "shock";
  context: ProjectContextForChapter;
}): GeneratedChapterBundle {
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

  // Cible produit : ~6 pages par chapitre, 6–7 panels/page.
  // On aligne volontairement 1 scène = 1 page pour coller au workflow (persist scene ↔ storyboard page).
  const beats = [
    {
      id: "beat_1",
      summary: `${mainCast[0]} ouvre le chapitre dans ${locAt(0)}. L'enjeu est posé, l'air est lourd.`,
      tension: 2,
      characters: [mainCast[0]],
      location: locAt(0),
      purpose: "mise en place rapide + humeur",
    },
    {
      id: "beat_2",
      summary: `Un indice apparaît à ${locAt(1)}. ${mainCast[0]} comprend que quelque chose cloche.`,
      tension: 4,
      characters: mainCast.slice(0, 2),
      location: locAt(1),
      purpose: "inciting incident + suspicion",
    },
    {
      id: "beat_3",
      summary: `${selected.summary} À ${locAt(2)}, une décision moralement coûteuse se profile.`,
      tension: 5,
      characters: mainCast.slice(0, 2),
      location: locAt(2),
      purpose: "investigation + dilemme",
    },
    {
      id: "beat_4",
      summary: `Confrontation à ${locAt(3)}. Les mots sont des lames ; personne ne cède.`,
      tension: 7,
      characters: mainCast.slice(0, 3),
      location: locAt(3),
      purpose: "confrontation + révélation partielle",
    },
    {
      id: "beat_5",
      summary: `L'escalade explose. Le monde répond à la violence : conséquences immédiates.`,
      tension: 8,
      characters: mainCast.slice(0, 3),
      location: locAt(0),
      purpose: "action + bascule",
    },
    {
      id: "beat_6",
      summary: `Silence, puis choc : une vérité dangereuse surgit et change la trajectoire.`,
      tension: 9,
      characters: mainCast.slice(0, 4),
      location: locAt(1),
      purpose: "cliffhanger + promesse du prochain chapitre",
    },
  ];

  const scenes = beats.map((beat, index) => ({
    id: `scene_${index + 1}`,
    title: `Scene ${index + 1}`,
    summary: beat.summary,
    location: beat.location,
    characters: beat.characters,
    purpose: beat.purpose,
    // Dialogues courts manga-like (placeholder déterministe, le vrai DialogueWriter peut remplacer ça plus tard)
    dialogue: Array.from({ length: 7 }).map((_, lineIndex) => {
      const speaker = beat.characters[lineIndex % Math.max(beat.characters.length, 1)] ?? mainCast[0];
      const shortIntent = input.userIntent.length > 60 ? input.userIntent.slice(0, 57) + "…" : input.userIntent;
      const text =
        lineIndex === 0
          ? "…"
          : lineIndex === 1
            ? "On bouge."
            : lineIndex === 2
              ? shortIntent
              : lineIndex === 3
                ? "Tu mens."
                : lineIndex === 4
                  ? "Prouve-le."
                  : lineIndex === 5
                    ? "Pas ici."
                    : "Maintenant.";
      return {
        speaker,
        text,
        subtext: lineIndex <= 2 ? "pression" : "attaque",
        emotion: beat.tension >= 8 ? "urgence" : beat.tension >= 6 ? "tension" : "calme",
        intensity: Math.min(10, 3 + index + Math.floor(lineIndex / 2)),
        balloon: lineIndex <= 2 ? "court" : "très_court",
      };
    }),
  }));

  // 6 scènes → ~6 pages, 6–7 panels/page
  const panelCounts = [6, 7, 6, 7, 6, 7];

  const storyboardPages: StoryboardPage[] = scenes.map((scene, pageIndex) => {
    const beat = beats[pageIndex] ?? beats[0];
    const count = panelCounts[pageIndex] ?? 6;
    const panels = buildPanelsForScene(
      input.context,
      scene,
      beat,
      count,
      visualStyle,
      genre,
      scene.dialogue,
    );
    return {
      pageNumber: pageIndex + 1,
      layout: inferLayout(beat.tension, count),
      panels,
    };
  });

  const cliffhanger = `Au moment où ${mainCast[0]} croit tenir la réponse, une vérité plus dangereuse surgit et compromet tout.`;
  const narrativeSummary = `Chapitre ${input.chapterNumber} : ${selected.summary} L'arc progresse sur ~6 pages ; la tension monte, puis se referme sur un cliffhanger.`;

  return {
    creativeDirection: {
      chapterGoal,
      tone,
      whyNow: `Le chapitre capitalise sur les récents événements pour faire progresser ${input.context.project.title} sans casser la continuité.`,
    },
    plotOptions: optionSeed,
    outline: {
      chapter_title: input.chapterTitle ?? `Chapitre ${input.chapterNumber}`,
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
        location: locD ?? locC,
      },
      timelineEvents: beats.map((beat, index) => ({
        eventType: "chapter_beat",
        summary: beat.summary,
        importance: 45 + index * 10,
        entities: { characters: beat.characters, location: beat.location },
        permanent: true,
      })),
      openLoops: [cliffhanger, `Conséquences de la décision prise à ${locC}.`],
    },
  };
}
