export type ProjectContextForChapter = {
  project: {
    title: string;
    pitch: string | null;
    primaryGenre: string | null;
    tone: string | null;
    format: string | null;
  };
  characters: Array<{
    id: string;
    name: string;
    roleType: string | null;
    objective: string | null;
    fear: string | null;
    emotionalState: string | null;
    status: string;
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
    pages: Array<{
      pageNumber: number;
      panels: Array<{
        panelNumber: number;
        sceneId: string;
        beatId: string;
        caption: string;
        prompt: string;
        camera: string;
        characters: string[];
      }>;
    }>;
  };
  memory: {
    narrativeSummary: string;
    structuredState: Record<string, unknown>;
    timelineEvents: Array<Record<string, unknown>>;
    openLoops: string[];
  };
};

function takeNames(context: ProjectContextForChapter, count: number) {
  return context.characters.slice(0, count).map((character) => character.name);
}

function inferLocations(context: ProjectContextForChapter) {
  const genre = (context.project.primaryGenre ?? "fantasy").toLowerCase();
  if (genre.includes("cyber")) {
    return ["ruelle néon", "tour de données", "toit sous la pluie"];
  }
  if (genre.includes("horror") || genre.includes("horreur")) {
    return ["sanctuaire abandonné", "couloir sans fenêtres", "cour souillée"];
  }
  return ["porte de la ville", "salle du trône fissurée", "forêt de cendres"];
}

export function generateChapterBundle(input: {
  chapterNumber: number;
  chapterTitle?: string | null;
  userIntent: string;
  selectedPlotLabel?: "safe" | "bold" | "shock";
  context: ProjectContextForChapter;
}): GeneratedChapterBundle {
  const cast = takeNames(input.context, 3);
  const mainCast = cast.length > 0 ? cast : ["Le protagoniste", "L'antagoniste"];
  const [locA, locB, locC] = inferLocations(input.context);
  const tone = input.context.project.tone ?? "dramatique";
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

  const selected = optionSeed.find((option) => option.label === (input.selectedPlotLabel ?? "bold")) ?? optionSeed[1];

  const beats = [
    {
      id: "beat_1",
      summary: `${mainCast[0]} ouvre le chapitre dans ${locA} avec une tension encore vive issue du cliffhanger précédent.`,
      tension: 3,
      characters: [mainCast[0]],
      location: locA,
      purpose: "recontextualiser l'enjeu et l'état émotionnel",
    },
    {
      id: "beat_2",
      summary: `${selected.summary} Les indices rassemblés relient la menace actuelle à la bible du monde.`,
      tension: 6,
      characters: mainCast.slice(0, 2),
      location: locB,
      purpose: "faire avancer l'arc et poser une décision difficile",
    },
    {
      id: "beat_3",
      summary: `${mainCast[0]} provoque un déséquilibre à ${locC}, ouvrant un nouveau front narratif.`,
      tension: 9,
      characters: mainCast,
      location: locC,
      purpose: "climax partiel et ouverture du prochain chapitre",
    },
  ];

  const scenes = beats.map((beat, index) => ({
    id: `scene_${index + 1}`,
    title: `Scene ${index + 1}`,
    summary: beat.summary,
    location: beat.location,
    characters: beat.characters,
    purpose: beat.purpose,
    dialogue: beat.characters.map((speaker, lineIndex) => ({
      speaker,
      text:
        lineIndex === 0
          ? `On avance. ${input.userIntent}.`
          : `Alors on accepte le prix de cette décision, mais on ne recule plus.`,
      subtext: lineIndex === 0 ? "reprendre le contrôle" : "masquer la peur derrière la détermination",
      emotion: lineIndex === 0 ? "tension" : "défi",
      intensity: 5 + index + lineIndex,
      balloon: lineIndex === 0 ? "court" : "moyen",
    })),
  }));

  const pages = scenes.map((scene, pageIndex) => ({
    pageNumber: pageIndex + 1,
    panels: [1, 2].map((panelNumber) => ({
      panelNumber,
      sceneId: scene.id,
      beatId: beats[pageIndex]?.id ?? "beat_x",
      caption: panelNumber === 1 ? scene.summary : `La tension grimpe autour de ${scene.characters.join(", ")}.`,
      prompt: `${input.context.project.title}, ${tone}, ${scene.location}, ${scene.characters.join(", ")}, manga dramatic panel, cinematic framing, continuity-safe details`,
      camera: panelNumber === 1 ? "wide establishing shot" : "tight emotional close-up",
      characters: scene.characters,
    })),
  }));

  const cliffhanger = `Au moment où ${mainCast[0]} croit tenir la réponse, une vérité plus dangereuse surgit et compromet tout.`;
  const narrativeSummary = `Chapitre ${input.chapterNumber} : ${selected.summary} L'arc progresse tandis que ${mainCast.join(", ")} affrontent une montée de tension qui se referme sur un nouveau point de bascule.`;

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
      pageCount: pages.length,
      pages,
    },
    memory: {
      narrativeSummary,
      structuredState: {
        chapterGoal,
        cliffhanger,
        involvedCharacters: mainCast,
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
