function makeDemoImage(title: string, subtitle: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#18181b" />
          <stop offset="55%" stop-color="#3b0764" />
          <stop offset="100%" stop-color="#4c0519" />
        </linearGradient>
      </defs>
      <rect width="1200" height="1600" fill="url(#bg)" />
      <circle cx="980" cy="220" r="220" fill="rgba(255,255,255,0.08)" />
      <circle cx="200" cy="1320" r="260" fill="rgba(255,255,255,0.06)" />
      <rect x="80" y="80" width="1040" height="1440" rx="36" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="4" />
      <text x="600" y="700" fill="#f5f3ff" font-size="84" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" font-weight="700">${title}</text>
      <text x="600" y="790" fill="#e9d5ff" font-size="34" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">${subtitle}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const demoProject = {
  id: "demo-project",
  title: "Ashes of the Veil",
  pitch:
    "Une héritière maudite et le fils d'une lignée rivale doivent empêcher l'ouverture d'un sanctuaire qui dévore les souvenirs du royaume.",
  description:
    "Démo publique de Manga AI Studio V3 : univers dark fantasy, personnages canoniques, pipeline chapitre, lecteur manga et wallet tokens.",
  primaryGenre: "dark fantasy",
  intensityLayer: "MATURE_DRAMA",
  contentRating: "MATURE",
  visualStyle: "gothic detailed ink",
  tone: "tragique, lyrique, tendu",
  stats: {
    characters: 4,
    chapters: 2,
    arcs: 2,
    progress: 62,
  },
};

export const demoCharacters = [
  {
    id: "lyra",
    name: "Lyra Vaelor",
    role: "Héroïne",
    bio: "Héritière froide et brillante, hantée par les fragments de mémoire qu'elle absorbe malgré elle.",
    emotion: "détermination fragile",
  },
  {
    id: "kael",
    name: "Kael Serev",
    role: "Rival / allié ambigu",
    bio: "Prince ennemi, lié au sanctuaire par une dette de sang qu'il ne peut pas révéler.",
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
    summary: "Chaque souvenir consommé rapproche le royaume d'une guerre civile irréversible.",
  },
];

export const demoTransactions = [
  { id: "t1", reason: "purchase: demo_studio", amount: 5000, type: "purchase", balanceAfter: 5000 },
  { id: "t2", reason: "character_visual_reservation", amount: 50, type: "debit", balanceAfter: 4950 },
  { id: "t3", reason: "chapter_pipeline_reservation", amount: 80, type: "debit", balanceAfter: 4870 },
];

export const demoReaderPages = [
  {
    id: "p1",
    title: "Chapitre 2 · Le murmure sous la pluie",
    caption: "Le sanctuaire réagit au sang de Lyra.",
    imageUrl: makeDemoImage("Cover Manga Demo", "Ashes of the Veil"),
    text:
      "Sous la pluie noire, Lyra comprend que les voix qui hantent le sanctuaire ne sont pas mortes. Elles attendent une héritière capable de leur rendre un visage.",
  },
  {
    id: "p2",
    title: "Scene 1",
    caption: "Confrontation sur les marches du sanctuaire",
    imageUrl: makeDemoImage("Scene 1", "Confrontation"),
    text:
      "Kael lui bloque le passage. Il sait ce qui l'attend derrière les portes, mais il sait aussi qu'il n'a plus le droit de lui mentir.",
  },
  {
    id: "p3",
    title: "Scene 2",
    caption: "Le Veilleur réclame un souvenir",
    imageUrl: makeDemoImage("Scene 2", "Le prix de la memoire"),
    text:
      "Le prix n'est pas du sang, mais de la mémoire. Un nom, un visage, un instant d'enfance. Quelque chose d'assez précieux pour nourrir la pierre.",
  },
];
