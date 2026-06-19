/**
 * SceneAnchor — ancre spatiale, visuelle et ÉTABLIE d'une scène.
 *
 * Générée une seule fois au début de chaque scène, puis réutilisée par tous les panels
 * suivants de la même scène + lors des rerolls. C'est l'infrastructure "Option 1" qui
 * garantit la cohérence visuelle inter-panels SANS coût par image (une seule construction
 * par scène, pass-through pur pour les N panels suivants).
 *
 * Contenu :
 * - Ancrage spatial (castLineup, positions, layout) — historique
 * - Ancrage ÉTABLI (BUG-20+ correction) : lieux canoniques, PNJ récurrents, apparence
 *   des personnages principaux, palette de style du projet. Ces ancres combattent la
 *   dérive visuelle (ex: "tanto chemise" → "tanto sweat à capuche") et les leaks
 *   thématiques (cyberpunk qui devient fantasy parce que le prompt oublie son style).
 */

/** Apparence canonique d'un personnage principal, persistée entre chapitres. */
export interface MainCastAnchor {
  name: string;
  /** Description visuelle courte et stable (hair/eyes/outfit/signature). */
  shortVisualCore: string;
}

/** PNJ récurrent ayant déjà été rendu visuellement dans un chapitre précédent. */
export interface RecurringNpcAnchor {
  label: string;
  shortVisualCore: string;
  outfitSignature?: string | null;
}

export interface SceneAnchor {
  sceneId: string;
  /** ID du premier panel généré (keyframe) qui sert d'ancre visuelle */
  anchorImageId?: string;
  /** Cast présent dans cette scène */
  castLineup: string[];
  /** Description textuelle du layout spatial */
  spatialLayout: string;
  /** Lieu dominant de la scène */
  dominantLocation: string;
  /** Positions relatives des personnages dans le cadre */
  characterPositions: Record<string, "left" | "center" | "right" | "background">;
  /** Mood dominant établi */
  dominantMood: string;
  /** Timestamp de création */
  establishedAt: string;
  /** Météo / heure établies pour la scène */
  weather?: string;
  timeOfDay?: string;
  /** Éléments de décor persistants */
  persistentProps?: string[];
  // ─── Ancrage établi (Option 1 — anchor-by-scene) ────────────────────────────
  /**
   * Brief visuel canonique du lieu s'il a déjà été rendu (Location.establishedVisualBrief).
   * Garantit qu'un lieu dessiné au chapitre 2 garde son aspect du chapitre 1.
   */
  establishedLocationBrief?: string | null;
  /**
   * Apparence canonique des personnages principaux présents dans cette scène.
   * Combat la dérive vestimentaire/physique inter-panels.
   */
  mainCastAnchors?: MainCastAnchor[];
  /**
   * PNJ secondaires promus (déjà apparus ≥ N fois) présents dans cette scène.
   * Leur shortVisualCore est déjà établi et doit être respecté.
   */
  recurringNpcAnchors?: RecurringNpcAnchor[];
  /**
   * Signature de style du PROJET (cyberpunk néon, dark fantasy ambiance, etc).
   * Injectée dans chaque panel pour éviter que l'univers se "dilue" panel après panel.
   */
  styleAnchor?: string | null;
}

/** Créer un SceneAnchor depuis les données de scène */
export function buildSceneAnchor(input: {
  sceneId: string;
  castLineup: string[];
  location: string;
  mood: string;
  weather?: string;
  timeOfDay?: string;
  persistentProps?: string[];
  anchorImageId?: string;
  establishedLocationBrief?: string | null;
  mainCastAnchors?: MainCastAnchor[];
  recurringNpcAnchors?: RecurringNpcAnchor[];
  styleAnchor?: string | null;
}): SceneAnchor {
  const positions: Record<string, "left" | "center" | "right" | "background"> = {};
  const positionOptions: Array<"left" | "center" | "right"> = ["left", "center", "right"];
  input.castLineup.forEach((name, index) => {
    positions[name] = positionOptions[index % 3] ?? "center";
  });

  return {
    sceneId: input.sceneId,
    anchorImageId: input.anchorImageId,
    castLineup: input.castLineup,
    spatialLayout: input.castLineup.length > 0
      ? `${input.castLineup.join(" and ")} in ${input.location}`
      : input.location,
    dominantLocation: input.location,
    characterPositions: positions,
    dominantMood: input.mood,
    establishedAt: new Date().toISOString(),
    weather: input.weather,
    timeOfDay: input.timeOfDay,
    persistentProps: input.persistentProps,
    establishedLocationBrief: input.establishedLocationBrief ?? null,
    mainCastAnchors: input.mainCastAnchors ?? [],
    recurringNpcAnchors: input.recurringNpcAnchors ?? [],
    styleAnchor: input.styleAnchor ?? null,
  };
}

/** Construire le bloc prompt depuis un SceneAnchor */
export function buildSceneAnchorPromptBlock(anchor: SceneAnchor): string {
  const parts: string[] = [];
  parts.push(`Scene anchor: ${anchor.spatialLayout}`);

  const positions = Object.entries(anchor.characterPositions);
  if (positions.length > 0) {
    const posStr = positions.map(([name, pos]) => `${name} on ${pos}`).join(", ");
    parts.push(`Spatial continuity: ${posStr}`);
  }

  if (anchor.weather) parts.push(`Weather: ${anchor.weather}`);
  if (anchor.timeOfDay) parts.push(`Time: ${anchor.timeOfDay}`);
  if (anchor.persistentProps && anchor.persistentProps.length > 0) {
    parts.push(`Persistent props: ${anchor.persistentProps.slice(0, 3).join(", ")}`);
  }

  // ─── Ancres établies (Option 1) — injectées dans CHAQUE panel de la scène ────
  // Ces blocs traversent sans coût tous les panels successifs : on paie la
  // construction une seule fois (début de scène), puis on paie juste la concat
  // de string dans le prompt builder.
  if (anchor.styleAnchor) {
    parts.push(`Project style lock: ${anchor.styleAnchor}`);
  }
  if (anchor.establishedLocationBrief) {
    parts.push(
      `Canonical location brief (MUST match prior chapters): ${anchor.establishedLocationBrief.slice(0, 220)}`,
    );
  }
  if (anchor.mainCastAnchors && anchor.mainCastAnchors.length > 0) {
    const castBlock = anchor.mainCastAnchors
      .slice(0, 4)
      .map((c) => `${c.name}: ${c.shortVisualCore}`)
      .join(" | ");
    parts.push(`Main cast visual lock (MUST match): ${castBlock}`);
  }
  if (anchor.recurringNpcAnchors && anchor.recurringNpcAnchors.length > 0) {
    const npcBlock = anchor.recurringNpcAnchors
      .slice(0, 3)
      .map((n) => {
        const outfit = n.outfitSignature ? ` [outfit: ${n.outfitSignature}]` : "";
        return `${n.label}: ${n.shortVisualCore}${outfit}`;
      })
      .join(" | ");
    parts.push(`Recurring NPC visual lock (if present in panel): ${npcBlock}`);
  }

  return parts.join(". ");
}

/**
 * Construit une signature de style courte à partir du genre + tone + visualStyle du projet.
 * Utilisé comme `styleAnchor` dans le SceneAnchor pour verrouiller l'univers visuel.
 *
 * Exemples :
 * - cyberpunk + "sombre et brutal" + manga → "cyberpunk manga, dark and brutal tone, neon-lit shadows, high contrast black-and-blue palette"
 * - fantasy + "épique" + manga → "fantasy manga, epic tone, painterly natural light, earthy high-contrast palette"
 */
export function composeProjectStyleAnchor(input: {
  genre: string | null | undefined;
  tone: string | null | undefined;
  visualStyle: string | null | undefined;
}): string | null {
  const genre = (input.genre ?? "").trim().toLowerCase();
  const tone = (input.tone ?? "").trim().toLowerCase();
  const vs = (input.visualStyle ?? "manga").trim().toLowerCase();
  if (!genre) return null;

  const genreStyles: Record<string, string> = {
    cyberpunk: "cyberpunk neon aesthetic, rain-slicked streets, holographic signage, dark blue and magenta palette, high contrast black shadows, chromatic accents",
    "sci-fi": "sci-fi aesthetic, sleek metallic surfaces, cool blue and chrome palette, volumetric lighting",
    "science-fiction": "sci-fi aesthetic, sleek metallic surfaces, cool blue and chrome palette, volumetric lighting",
    fantasy: "fantasy manga aesthetic, painterly natural light, earthy warm palette, detailed textile and architecture",
    "dark fantasy": "dark fantasy aesthetic, desaturated grim palette, oppressive shadows, baroque textures",
    dark_fantasy: "dark fantasy aesthetic, desaturated grim palette, oppressive shadows, baroque textures",
    "post-apocalyptique": "post-apocalyptic aesthetic, dust and rust palette, broken skyline, muted warm tones with high grain",
    "post-apo": "post-apocalyptic aesthetic, dust and rust palette, broken skyline, muted warm tones with high grain",
    horreur: "horror aesthetic, heavy shadows, cold desaturated palette, unsettling composition, psychological tension",
    horror: "horror aesthetic, heavy shadows, cold desaturated palette, unsettling composition, psychological tension",
    romance: "romance manga aesthetic, soft golden lighting, pastel palette, delicate linework, warm intimate framing",
    western: "western aesthetic, sun-bleached palette, dusty warm tones, wide horizons, harsh midday shadows",
    mecha: "mecha aesthetic, industrial metallic surfaces, dramatic back-lighting, cold steel palette with hot accents",
    isekai: "isekai fantasy aesthetic, vibrant saturated palette, magical ambient glow, painterly textures",
    "shōnen": "shōnen aesthetic, dynamic high-contrast inking, saturated accent colors, kinetic composition",
    shonen: "shōnen aesthetic, dynamic high-contrast inking, saturated accent colors, kinetic composition",
    seinen: "seinen aesthetic, gritty realistic linework, muted naturalistic palette, cinematic framing",
    "shōjo": "shōjo aesthetic, soft pastel palette, delicate screentones, sparkle accents, romantic glow",
    shojo: "shōjo aesthetic, soft pastel palette, delicate screentones, sparkle accents, romantic glow",
  };

  let base = genreStyles[genre];
  if (!base) {
    const entries = Object.entries(genreStyles).sort(([a], [b]) => b.length - a.length);
    for (const [key, value] of entries) {
      if (genre.includes(key)) {
        base = value;
        break;
      }
    }
  }
  base ??= `${genre} aesthetic, consistent visual identity`;

  const toneSuffix = tone
    ? toneFlavor(tone)
    : "";

  const styleSuffix = vs && vs !== "manga" ? `, ${vs} rendering` : ", manga rendering";

  return `${base}${toneSuffix}${styleSuffix}`;
}

function toneFlavor(tone: string): string {
  if (tone.includes("brutal") || tone.includes("sombre") || tone.includes("dark")) {
    return ", brutal dark mood, heavy shadows";
  }
  if (tone.includes("épique") || tone.includes("epic")) {
    return ", epic grandeur, wide scale";
  }
  if (tone.includes("mélancolique") || tone.includes("melancholic")) {
    return ", melancholic wistful mood";
  }
  if (tone.includes("humoristique") || tone.includes("comedy")) {
    return ", lighthearted mood, bright accents";
  }
  if (tone.includes("oppressant") || tone.includes("oppressive")) {
    return ", oppressive claustrophobic mood";
  }
  return "";
}
