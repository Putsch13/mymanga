/**
 * Canonical Prompt Recipe Builder (AI)
 *
 * Construit les sections structurées `[TAG] contenu` d'un prompt image à
 * partir des signaux canoniques d'un `CanonicalImagePromptPacket`.
 *
 * Différence avec `packages/workflow/src/prompt-recipe-builder.ts` :
 *   - celui-ci (workflow) produit une RECETTE abstraite (quelles sections,
 *     avec quels poids),
 *   - celui-ci (ai) produit le TEXTE FINAL du prompt en FR + EN, avec la
 *     règle dure "manga medium" toujours présente.
 *
 * Règle dure : chaque prompt contient TOUJOURS la section
 * `[MANGA_MEDIUM]` et mentionne explicitement le langage visuel manga.
 */

import type {
  ImageIntentType,
  ContentRating,
  HeroPresenceMode,
  PromptSection,
  CharacterContextEntry,
  NpcContextEntry,
  PropContextEntry,
  GroupContextEntry,
  EnvironmentContext,
  DialogueContext,
  StoryContext,
  ContinuityContext,
  VisualClassification,
  MangaStyleProfileRef,
  SubjectBalance,
} from "@manga-ai-studio/core";
import { isNonHeroDominantIntent } from "@manga-ai-studio/core";
import { translateStructuredPrompt } from "./structured-prompt-lang";

export interface CanonicalPromptRecipeInput {
  imageIntentType: ImageIntentType;
  contentRating: ContentRating;
  visualClassification: VisualClassification;
  mangaStyle: MangaStyleProfileRef;
  storyContext: StoryContext;
  sceneActionSummary: string;
  environment: EnvironmentContext;
  characters: CharacterContextEntry[];
  npcs: NpcContextEntry[];
  props: PropContextEntry[];
  group: GroupContextEntry | null;
  dialogue: DialogueContext | null;
  continuity: ContinuityContext;
  subjectBalance: SubjectBalance;
  heroPresenceMode: HeroPresenceMode;
  forbiddenPromptClauses: string[];
  forbiddenTokens: string[];
}

export interface CanonicalPromptRecipeOutput {
  sections: PromptSection[];
  finalFrenchStructuredPrompt: string;
  finalEnglishStructuredPrompt: string;
  negativePromptEnglish: string;
  warnings: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Section builders
// ────────────────────────────────────────────────────────────────────────────

function buildMangaMediumSection(): { fr: string; en: string } {
  return {
    fr: "Panel de manga, langage visuel manga, encrage manga cohérent, composition et lisibilité manga, même style manga que le canon du chapitre.",
    en: "Manga panel, manga visual language, consistent manga linework, manga composition and readability, same manga style as chapter canon.",
  };
}

function buildVisualStyleSection(style: MangaStyleProfileRef): { fr: string; en: string } {
  const base = [
    `Style manga référence: ${style.styleName}`,
    `Encrage: ${style.inkingStyle}`,
    `Ombrage: ${style.shadingStyle}`,
    `Composition: ${style.compositionStyle}`,
  ];
  if (style.referenceMangaTitle) {
    base.push(`Référence visuelle: inspiré de ${style.referenceMangaTitle}`);
  }
  return {
    fr: base.join(", ") + ".",
    en:
      [
        `Manga reference style: ${style.styleName}`,
        `inking: ${style.inkingStyle}`,
        `shading: ${style.shadingStyle}`,
        `composition: ${style.compositionStyle}`,
        style.referenceMangaTitle ? `visual reference inspired by ${style.referenceMangaTitle}` : null,
      ]
        .filter(Boolean)
        .join(", ") + ".",
  };
}

function buildContentClassificationSection(
  rating: ContentRating,
  cls: VisualClassification,
): { fr: string; en: string } {
  const ratingLabel: Record<ContentRating, { fr: string; en: string }> = {
    all_ages: { fr: "tout public", en: "all ages" },
    teen: { fr: "adolescent (13+)", en: "teen (13+)" },
    mature: { fr: "adulte (17+)", en: "mature (17+)" },
    explicit_adult: { fr: "adulte explicite (18+)", en: "explicit adult (18+)" },
  };
  const label = ratingLabel[rating];
  const fr = `Classification contenu: ${label.fr}, public ${cls.audience}, violence ${cls.violenceLevel}, sensualité ${cls.sensualityLevel}.`;
  const en = `Content rating: ${label.en}, audience ${cls.audience}, violence ${cls.violenceLevel}, sensuality ${cls.sensualityLevel}.`;
  return { fr, en };
}

function buildSceneActionSection(action: string): { fr: string; en: string } {
  return {
    fr: `Action de la scène: ${action}.`,
    en: `Scene action: ${action}.`,
  };
}

function buildEnvironmentSection(env: EnvironmentContext): { fr: string; en: string } {
  const signals = env.mustShowLocationSignals.length
    ? `, signaux visuels obligatoires: ${env.mustShowLocationSignals.join(", ")}`
    : "";
  const atmosphere = env.atmosphereTokens.length
    ? `, atmosphère: ${env.atmosphereTokens.join(", ")}`
    : "";
  const weather = env.weather ? `, météo ${env.weather}` : "";

  const fr = `Lieu: ${env.locationName}. ${env.locationCanonDescription}. Moment: ${env.timeOfDay}${weather}${signals}${atmosphere}.`;

  const enSignals = env.mustShowLocationSignals.length
    ? `, mandatory visual signals: ${env.mustShowLocationSignals.join(", ")}`
    : "";
  const enAtmosphere = env.atmosphereTokens.length
    ? `, atmosphere: ${env.atmosphereTokens.join(", ")}`
    : "";
  const enWeather = env.weather ? `, weather ${env.weather}` : "";

  const en = `Location: ${env.locationName}. ${env.locationCanonDescription}. Time of day: ${env.timeOfDay}${enWeather}${enSignals}${enAtmosphere}.`;
  return { fr, en };
}

function buildHeroDescriptionSection(
  characters: CharacterContextEntry[],
  intent: ImageIntentType,
  presence: HeroPresenceMode,
): { fr: string; en: string } | null {
  const hero = characters.find((c) => c.isHero);
  if (!hero) return null;
  if (presence === "absent") return null;

  const presenceLabel: Record<Exclude<HeroPresenceMode, "absent">, { fr: string; en: string }> = {
    primary: { fr: "sujet principal", en: "primary subject" },
    secondary: {
      fr: "présent en support visuel, pas sujet principal",
      en: "present as visual support, not primary subject",
    },
    silhouette: {
      fr: "présent uniquement en silhouette/arrière-plan",
      en: "present only as silhouette / background",
    },
  };
  const p = presenceLabel[presence];

  const outfit = hero.currentOutfit ? `, tenue actuelle: ${hero.currentOutfit}` : "";
  const enOutfit = hero.currentOutfit ? `, current outfit: ${hero.currentOutfit}` : "";

  const fr = `Héros: ${hero.characterName} (${hero.role}). ${hero.canonDescription}${outfit}. Rôle dans ce panel: ${p.fr}.`;
  const en = `Hero: ${hero.characterName} (${hero.role}). ${hero.canonDescription}${enOutfit}. Panel role: ${p.en}.`;

  if (isNonHeroDominantIntent(intent) && presence !== "silhouette") {
    // Hero should be tucked, never front-and-center
    return {
      fr: fr + " Ne jamais cadrer en portrait, jamais centré, jamais premier plan.",
      en: en + " Never frame as portrait, never centered, never foreground.",
    };
  }
  return { fr, en };
}

function buildSecondaryCharacterSection(
  characters: CharacterContextEntry[],
): { fr: string; en: string } | null {
  const seconds = characters.filter((c) => !c.isHero && c.presenceMode !== "absent");
  if (seconds.length === 0) return null;

  const frParts: string[] = [];
  const enParts: string[] = [];
  for (const c of seconds) {
    frParts.push(`${c.characterName} (${c.role}, ${c.importanceTier}): ${c.canonDescription}`);
    enParts.push(`${c.characterName} (${c.role}, ${c.importanceTier}): ${c.canonDescription}`);
  }
  return {
    fr: `Personnages secondaires: ${frParts.join(" ; ")}.`,
    en: `Secondary characters: ${enParts.join(" ; ")}.`,
  };
}

function buildNpcSection(npcs: NpcContextEntry[]): { fr: string; en: string } | null {
  if (npcs.length === 0) return null;
  const frParts = npcs.map((n) => `${n.npcName} (${n.role}): ${n.canonDescription}`);
  const enParts = npcs.map((n) => `${n.npcName} (${n.role}): ${n.canonDescription}`);
  return {
    fr: `PNJ présents: ${frParts.join(" ; ")}.`,
    en: `NPCs present: ${enParts.join(" ; ")}.`,
  };
}

function buildGroupSection(group: GroupContextEntry): { fr: string; en: string } {
  const propsFr = group.groupProps.length ? `, armes/props: ${group.groupProps.join(", ")}` : "";
  const propsEn = group.groupProps.length ? `, weapons/props: ${group.groupProps.join(", ")}` : "";
  const threatFr = group.threatLevel === "none" ? "aucune" : group.threatLevel === "latent" ? "latente" : "active";
  const threatEn = group.threatLevel;
  const fr = `Groupe: ${group.count} ${group.groupKind}, posture: ${group.postureDescription}, menace ${threatFr}${propsFr}. Ce groupe est le sujet lisible du panel.`;
  const en = `Group: ${group.count} ${group.groupKind}, posture: ${group.postureDescription}, threat level ${threatEn}${propsEn}. This group is the readable subject of the panel.`;
  return { fr, en };
}

function buildPropSection(props: PropContextEntry[]): { fr: string; en: string } | null {
  if (props.length === 0) return null;
  const frParts = props.map(
    (p) => `${p.propName} (propriétaire: ${p.ownerCategory}, importance: ${p.visualSignificance}): ${p.canonDescription}`,
  );
  const enParts = props.map(
    (p) => `${p.propName} (owner: ${p.ownerCategory}, significance: ${p.visualSignificance}): ${p.canonDescription}`,
  );
  return {
    fr: `Props: ${frParts.join(" ; ")}.`,
    en: `Props: ${enParts.join(" ; ")}.`,
  };
}

function buildDialogueSection(d: DialogueContext): { fr: string; en: string } | null {
  if (d.lines.length === 0) return null;
  const frLines = d.lines.map((l) => `${l.speakerName}: « ${l.text} »${l.emotion ? ` (${l.emotion})` : ""}`);
  const enLines = d.lines.map(
    (l) => `${l.speakerName}: "${l.text}"${l.emotion ? ` (${l.emotion})` : ""}`,
  );
  return {
    fr: `Contexte dialogue: ${frLines.join(" | ")}.`,
    en: `Dialogue context: ${enLines.join(" | ")}.`,
  };
}

function buildStoryContextSection(s: StoryContext): { fr: string; en: string } {
  return {
    fr: `Chapitre "${s.chapterTitle}": ${s.chapterSummary}. Beat "${s.beatTitle}" (fonction: ${s.beatNarrativeFunction}).`,
    en: `Chapter "${s.chapterTitle}": ${s.chapterSummary}. Beat "${s.beatTitle}" (function: ${s.beatNarrativeFunction}).`,
  };
}

function buildCanonConstraintsSection(
  continuity: ContinuityContext,
  balance: SubjectBalance,
): { fr: string; en: string } {
  const frParts: string[] = [];
  const enParts: string[] = [];

  if (continuity.heroKnownOutfit) {
    frParts.push(`Tenue héros obligatoire: ${continuity.heroKnownOutfit}`);
    enParts.push(`Mandatory hero outfit: ${continuity.heroKnownOutfit}`);
  }
  if (continuity.heroKnownInjuries.length) {
    frParts.push(`Blessures héros à montrer: ${continuity.heroKnownInjuries.join(", ")}`);
    enParts.push(`Hero injuries to show: ${continuity.heroKnownInjuries.join(", ")}`);
  }
  if (continuity.activeInventory.length) {
    frParts.push(`Inventaire actif: ${continuity.activeInventory.join(", ")}`);
    enParts.push(`Active inventory: ${continuity.activeInventory.join(", ")}`);
  }
  if (balance.requiredReadableFaces.length) {
    frParts.push(`Visages obligatoirement lisibles: ${balance.requiredReadableFaces.join(", ")}`);
    enParts.push(`Required readable faces: ${balance.requiredReadableFaces.join(", ")}`);
  }
  if (balance.requiredRelativePosition) {
    frParts.push(`Positionnement requis: ${balance.requiredRelativePosition}`);
    enParts.push(`Required positioning: ${balance.requiredRelativePosition}`);
  }
  if (balance.forbiddenSoloFraming) {
    frParts.push("Interdit de cadrer un seul sujet (scène partagée)");
    enParts.push("Solo framing forbidden (shared scene)");
  }
  if (frParts.length === 0) {
    return {
      fr: "Contraintes canon: cohérence avec les panels précédents.",
      en: "Canon constraints: consistency with previous panels.",
    };
  }
  return {
    fr: `Contraintes canon: ${frParts.join(" ; ")}.`,
    en: `Canon constraints: ${enParts.join(" ; ")}.`,
  };
}

function buildForbiddenSection(
  forbiddenClauses: string[],
  forbiddenTokens: string[],
): { fr: string; en: string } {
  const all = [...forbiddenClauses, ...forbiddenTokens].filter(Boolean);
  if (all.length === 0) {
    return {
      fr: "Éléments interdits: aucune dérive stylistique hors manga.",
      en: "Forbidden elements: no stylistic drift outside manga.",
    };
  }
  return {
    fr: `Éléments interdits: ${all.join(", ")}, aucune dérive stylistique hors manga.`,
    en: `Forbidden elements: ${all.join(", ")}, no stylistic drift outside manga.`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Assembly
// ────────────────────────────────────────────────────────────────────────────

export function buildCanonicalPromptRecipe(
  input: CanonicalPromptRecipeInput,
): CanonicalPromptRecipeOutput {
  const warnings: string[] = [];
  const sections: PromptSection[] = [];

  const push = (
    tag: PromptSection["tag"],
    content: { fr: string; en: string } | null,
    required: boolean,
  ) => {
    if (content === null) return;
    sections.push({
      tag,
      languageFr: content.fr,
      languageEn: content.en,
      required,
    });
  };

  push("MANGA_MEDIUM", buildMangaMediumSection(), true);
  push("VISUAL_STYLE", buildVisualStyleSection(input.mangaStyle), true);
  push(
    "CONTENT_CLASSIFICATION",
    buildContentClassificationSection(input.contentRating, input.visualClassification),
    true,
  );
  push("SCENE_ACTION", buildSceneActionSection(input.sceneActionSummary), true);
  push("ENVIRONMENT", buildEnvironmentSection(input.environment), true);

  const heroSec = buildHeroDescriptionSection(
    input.characters,
    input.imageIntentType,
    input.heroPresenceMode,
  );
  push("HERO_DESCRIPTION", heroSec, false);

  push("SECONDARY_CHARACTER_DESCRIPTION", buildSecondaryCharacterSection(input.characters), false);
  push("NPC_DESCRIPTION", buildNpcSection(input.npcs), false);

  if (input.group) {
    push("GROUP_DESCRIPTION", buildGroupSection(input.group), true);
  }

  push("PROP_DESCRIPTION", buildPropSection(input.props), false);

  if (input.dialogue) {
    push("DIALOGUE_CONTEXT", buildDialogueSection(input.dialogue), false);
  }

  push("STORY_CONTEXT", buildStoryContextSection(input.storyContext), true);
  push("CANON_CONSTRAINTS", buildCanonConstraintsSection(input.continuity, input.subjectBalance), true);
  push(
    "FORBIDDEN_ELEMENTS",
    buildForbiddenSection(input.forbiddenPromptClauses, input.forbiddenTokens),
    true,
  );

  // Garde-fous structure
  const mandatorySectionTags = new Set<PromptSection["tag"]>([
    "MANGA_MEDIUM",
    "VISUAL_STYLE",
    "CONTENT_CLASSIFICATION",
    "SCENE_ACTION",
    "ENVIRONMENT",
    "STORY_CONTEXT",
    "CANON_CONSTRAINTS",
    "FORBIDDEN_ELEMENTS",
  ]);
  const presentTags = new Set(sections.map((s) => s.tag));
  for (const t of mandatorySectionTags) {
    if (!presentTags.has(t)) warnings.push(`MISSING_MANDATORY_SECTION:${t}`);
  }

  const finalFrenchStructuredPrompt = sections
    .map((s) => `[${s.tag}] ${s.languageFr}`)
    .join("\n");

  // Anglais : préférer les champs `languageEn` déjà construits, puis passer
  // la traduction mécanique en filet de sécurité pour les termes restants.
  const englishRaw = sections.map((s) => `[${s.tag}] ${s.languageEn}`).join("\n");
  const finalEnglishStructuredPrompt = translateStructuredPrompt(englishRaw);

  const negativePromptEnglish = buildNegativePrompt(
    input.imageIntentType,
    input.forbiddenTokens,
    input.forbiddenPromptClauses,
  );

  return {
    sections,
    finalFrenchStructuredPrompt,
    finalEnglishStructuredPrompt,
    negativePromptEnglish,
    warnings,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Negative prompt
// ────────────────────────────────────────────────────────────────────────────

const BASE_NEGATIVE_TOKENS = [
  "photorealistic",
  "3d render",
  "concept art not manga",
  "illustration cover art",
  "anime color frame",
  "western comic style",
  "extra limbs",
  "deformed hands",
  "low quality",
  "blurry",
  "watermark",
  "text overlay",
];

function buildNegativePrompt(
  intent: ImageIntentType,
  forbiddenTokens: string[],
  forbiddenClauses: string[],
): string {
  const tokens = new Set<string>(BASE_NEGATIVE_TOKENS);
  for (const t of forbiddenTokens) tokens.add(t);
  for (const c of forbiddenClauses) tokens.add(c);

  if (isNonHeroDominantIntent(intent)) {
    tokens.add("hero portrait");
    tokens.add("hero centered");
    tokens.add("face filling frame");
  }
  if (intent === "environment_establishing" || intent === "environment_transition") {
    tokens.add("close up");
    tokens.add("portrait framing");
  }
  if (intent === "prop_insert" || intent === "symbolic_insert") {
    tokens.add("full body character");
    tokens.add("wide establishing");
  }
  return Array.from(tokens).join(", ");
}
