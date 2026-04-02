// ─── Panel types for grid layout ───
export type PanelSize = "wide" | "tall" | "large" | "normal";
export type PanelMood =
  | "night-rain"
  | "sanctuary"
  | "close-up-lyra"
  | "close-up-kael"
  | "action"
  | "mystical"
  | "shadow"
  | "warm"
  | "dramatic"
  | "cold";

export type DemoPanel = {
  id: string;
  size: PanelSize;
  mood: PanelMood;
  dialogue?: string;
  speaker?: string;
  narration?: string;
  sfx?: string;
  characters?: string[];
};

export type DemoMangaPage = {
  id: string;
  layout: "A" | "B" | "C" | "D" | "E";
  panels: DemoPanel[];
};

// ─── 5 pages × 6-7 panels = 32 panels ───

export const demoChapter = {
  number: 2,
  title: "Le murmure sous la pluie",
  arc: "Le pacte fissuré",
};

export const demoMangaPages: DemoMangaPage[] = [
  // ── PAGE 1 : Ouverture ──
  {
    id: "p1",
    layout: "A",
    panels: [
      {
        id: "p1-1",
        size: "wide",
        mood: "night-rain",
        narration: "Troisième nuit depuis l\u2019effondrement du mur Est. La pluie noire n\u2019a pas cessé.",
      },
      {
        id: "p1-2",
        size: "normal",
        mood: "close-up-lyra",
        dialogue: "Je sens les voix plus fort ce soir.",
        speaker: "Lyra",
      },
      {
        id: "p1-3",
        size: "normal",
        mood: "shadow",
        narration: "Le sanctuaire pulse sous ses pieds. Chaque battement fait craquer les dalles.",
      },
      {
        id: "p1-4",
        size: "tall",
        mood: "sanctuary",
        sfx: "GRRMMM",
        narration: "Les portes du sanctuaire vibrent.",
      },
      {
        id: "p1-5",
        size: "normal",
        mood: "close-up-lyra",
        dialogue: "Mira, reste en arrière. Si je ne reviens pas\u2026",
        speaker: "Lyra",
      },
      {
        id: "p1-6",
        size: "normal",
        mood: "warm",
        dialogue: "Tu reviendras. Tu reviens toujours.",
        speaker: "Mira",
      },
    ],
  },

  // ── PAGE 2 : Confrontation ──
  {
    id: "p2",
    layout: "B",
    panels: [
      {
        id: "p2-1",
        size: "large",
        mood: "dramatic",
        narration: "Kael se dresse devant les marches du sanctuaire, immobile comme une statue de guerre.",
        characters: ["Kael"],
      },
      {
        id: "p2-2",
        size: "normal",
        mood: "close-up-kael",
        dialogue: "Tu ne passes pas.",
        speaker: "Kael",
      },
      {
        id: "p2-3",
        size: "normal",
        mood: "close-up-lyra",
        dialogue: "Depuis quand tu décides où je vais ?",
        speaker: "Lyra",
      },
      {
        id: "p2-4",
        size: "normal",
        mood: "action",
        sfx: "CLANG",
        narration: "La lame de Lyra s\u2019arrête à trois centimètres de la gorge de Kael. Il n\u2019a pas bougé.",
      },
      {
        id: "p2-5",
        size: "wide",
        mood: "cold",
        dialogue: "Parce que je sais ce qui attend derrière ces portes. Et toi non.",
        speaker: "Kael",
      },
      {
        id: "p2-6",
        size: "normal",
        mood: "close-up-lyra",
        dialogue: "Alors dis-le-moi.",
        speaker: "Lyra",
      },
      {
        id: "p2-7",
        size: "normal",
        mood: "shadow",
        narration: "Le silence entre eux pèse plus lourd que la pluie.",
      },
    ],
  },

  // ── PAGE 3 : Révélation ──
  {
    id: "p3",
    layout: "C",
    panels: [
      {
        id: "p3-1",
        size: "wide",
        mood: "sanctuary",
        narration: "L\u2019intérieur du sanctuaire est plus vaste que ce que la carte montrait. Les murs respirent.",
      },
      {
        id: "p3-2",
        size: "normal",
        mood: "mystical",
        sfx: "SHHHHH",
        narration: "Un murmure. Non \u2014 mille murmures. Tous en même temps.",
      },
      {
        id: "p3-3",
        size: "tall",
        mood: "mystical",
        dialogue: "Tu portes du sang ancien, héritière.",
        speaker: "Le Veilleur",
      },
      {
        id: "p3-4",
        size: "normal",
        mood: "close-up-lyra",
        dialogue: "Qui parle ?!",
        speaker: "Lyra",
        sfx: "!",
      },
      {
        id: "p3-5",
        size: "normal",
        mood: "shadow",
        narration: "Les ombres se condensent. Une forme apparaît \u2014 ni humaine, ni tout à fait autre chose.",
      },
      {
        id: "p3-6",
        size: "wide",
        mood: "dramatic",
        dialogue: "Je suis ce qui reste quand on oublie. Je suis le Veilleur.",
        speaker: "Le Veilleur",
      },
    ],
  },

  // ── PAGE 4 : Le prix ──
  {
    id: "p4",
    layout: "D",
    panels: [
      {
        id: "p4-1",
        size: "normal",
        mood: "close-up-kael",
        dialogue: "Ne lui donne rien, Lyra. Rien.",
        speaker: "Kael",
      },
      {
        id: "p4-2",
        size: "large",
        mood: "mystical",
        dialogue: "Le prix n\u2019est pas du sang. C\u2019est un souvenir. Un seul. Mais il doit être précieux.",
        speaker: "Le Veilleur",
      },
      {
        id: "p4-3",
        size: "normal",
        mood: "close-up-lyra",
        narration: "Lyra ferme les yeux. Elle revoit le visage de sa mère. Le dernier matin.",
      },
      {
        id: "p4-4",
        size: "normal",
        mood: "warm",
        dialogue: "Maman\u2026",
        speaker: "Lyra",
        sfx: "\u2026",
      },
      {
        id: "p4-5",
        size: "normal",
        mood: "shadow",
        narration: "Kael serre les poings. Il connaît ce regard. Il l\u2019a déjà vu \u2014 dans un miroir.",
      },
      {
        id: "p4-6",
        size: "wide",
        mood: "dramatic",
        dialogue: "J\u2019accepte.",
        speaker: "Lyra",
        sfx: "!!",
      },
    ],
  },

  // ── PAGE 5 : Cliffhanger ──
  {
    id: "p5",
    layout: "E",
    panels: [
      {
        id: "p5-1",
        size: "wide",
        mood: "mystical",
        sfx: "FWOOOSH",
        narration: "La lumière engloutit tout. Le souvenir s\u2019arrache comme une racine vivante.",
      },
      {
        id: "p5-2",
        size: "normal",
        mood: "close-up-lyra",
        narration: "Pendant une seconde, Lyra ne sait plus qui elle est.",
      },
      {
        id: "p5-3",
        size: "normal",
        mood: "close-up-kael",
        dialogue: "LYRA !",
        speaker: "Kael",
        sfx: "!",
      },
      {
        id: "p5-4",
        size: "tall",
        mood: "sanctuary",
        narration: "Le sanctuaire s\u2019ouvre. Derrière les portes : un escalier qui descend dans le noir absolu.",
      },
      {
        id: "p5-5",
        size: "normal",
        mood: "shadow",
        dialogue: "Le pacte est scellé. Descendez\u2026 si vous l\u2019osez.",
        speaker: "Le Veilleur",
      },
      {
        id: "p5-6",
        size: "wide",
        mood: "night-rain",
        narration: "Fin du chapitre 2. Le souvenir de sa mère a disparu. Il ne reste que le vide\u2026 et l\u2019escalier.",
        sfx: "TO BE CONTINUED\u2026",
      },
    ],
  },
];

// ─── Project / characters / arcs (unchanged structure, enhanced) ───

export const demoProject = {
  id: "demo-project",
  title: "Ashes of the Veil",
  pitch:
    "Une héritière maudite et le fils d\u2019une lignée rivale doivent empêcher l\u2019ouverture d\u2019un sanctuaire qui dévore les souvenirs du royaume.",
  description:
    "Démo publique de Manga AI Studio V3 : univers dark fantasy, personnages canoniques, pipeline chapitre, lecteur manga et wallet tokens.",
  primaryGenre: "dark fantasy",
  intensityLayer: "MATURE_DRAMA",
  contentRating: "MATURE",
  visualStyle: "gothic detailed ink",
  tone: "tragique, lyrique, tendu",
  stats: { characters: 4, chapters: 2, arcs: 2, progress: 62 },
};

export const demoCharacters = [
  {
    id: "lyra",
    name: "Lyra Vaelor",
    role: "Héroïne",
    bio: "Héritière froide et brillante, hantée par les fragments de mémoire qu\u2019elle absorbe malgré elle.",
    emotion: "détermination fragile",
  },
  {
    id: "kael",
    name: "Kael Serev",
    role: "Rival / allié ambigu",
    bio: "Prince ennemi, lié au sanctuaire par une dette de sang qu\u2019il ne peut pas révéler.",
    emotion: "contrôle glacé",
  },
  {
    id: "mira",
    name: "Mira",
    role: "Confidente",
    bio: "Stratège du groupe, spécialiste des rituels de protection et des mensonges utiles.",
    emotion: "inquiétude lucide",
  },
  {
    id: "warden",
    name: "Le Veilleur",
    role: "Entité du sanctuaire",
    bio: "Présence ancienne qui murmure à travers les murs et négocie avec les souvenirs.",
    emotion: "impassible",
  },
];

export const demoArcs = [
  {
    id: "arc-1",
    title: "Le pacte fissuré",
    summary: "Lyra comprend que le pacte originel a été signé par les deux familles, et pas par une seule.",
  },
  {
    id: "arc-2",
    title: "Le sanctuaire des cendres",
    summary: "Chaque souvenir consommé rapproche le royaume d\u2019une guerre civile irréversible.",
  },
];

export const demoTransactions = [
  { id: "t1", reason: "purchase: demo_studio", amount: 5000, type: "purchase", balanceAfter: 5000 },
  { id: "t2", reason: "character_visual_reservation", amount: 50, type: "debit", balanceAfter: 4950 },
  { id: "t3", reason: "chapter_pipeline_reservation", amount: 80, type: "debit", balanceAfter: 4870 },
];
