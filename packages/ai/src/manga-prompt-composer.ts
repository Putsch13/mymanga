import type { PanelMood } from "./chapter-pipeline";
import type { SceneBlueprint } from "@manga-ai-studio/world";
import type { ChapterLookProfile } from "@manga-ai-studio/core";
import { buildLookProfilePromptBlock, buildLookProfileNegativeBlock } from "@manga-ai-studio/core";
import type { CharacterFingerprint } from "@manga-ai-studio/core";
import { compileHardTraitsPromptBlock, compileHardTraitsNegativeBlock } from "@manga-ai-studio/core";
import type { SceneAnchor } from "./services/scene-anchor";
import { buildSceneAnchorPromptBlock } from "./services/scene-anchor";
import type { PanelIntentCard } from "./services/panel-intent-card";
import { buildPanelIntentPromptBlock, buildPanelIntentNegativeBlock } from "./services/panel-intent-card";
import { getPropVisualDescriptor } from "./services/prop-visual-library";

export interface CharacterRef {
  name: string;
  entityKind?: string | null;
  speciesLabel?: string | null;
  gender?: string | null;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  canonicalImageUrl?: string | null;
  visualSignatureText?: string | null;
  forbiddenDrift?: string[] | null;
  /** Détails corps (prothèses, cicatrices, tatouages, morphologie) */
  bodyDetails?: string | null;
  /** Détails tenue enrichis */
  wardrobeDetails?: string | null;
  importanceTier?: "MAIN_HERO" | "SECONDARY_CORE" | "IMPORTANT_SUPPORTING_CHARACTER" | "RECURRING_NPC" | "BACKGROUND_EXTRA" | null;
  lockStrength?: "HARD_LOCK" | "STRONG" | "MEDIUM" | "LIGHT" | "NONE" | null;
  continuityBudget?: "strict" | "light" | "none" | null;
  recurringMemory?: string | null;
  /** Traits durs non négociables (hard lock) */
  hardTraits?: string[] | null;
  /** Traits souples */
  softTraits?: string[] | null;
  /** Fingerprint structuré complet si disponible */
  fingerprint?: CharacterFingerprint | null;
}

export interface StylePackRef {
  name?: string | null;
  description?: string | null;
  visualStyle?: string | null;
  anatomyBias?: string | null;
  backgroundDensity?: string | null;
  cameraLanguage?: string | null;
  negativeConstraints?: string[] | null;
  styleRefImageUrl?: string | null;
  approvedLoraIds?: string[] | null;
}

export interface PanelPromptInput {
  stylePack?: StylePackRef | null;
  characters?: CharacterRef[];
  sceneBlueprint?: SceneBlueprint | null;
  location: string;
  action: string;
  camera: string;
  mood: PanelMood;
  contentIntensityLayer?: string;
  dialogueHint?: string;
  seed?: number;
  /** Contexte narratif de la scène (résumé, but, tension) — enrichit l'image */
  sceneContext?: string | null;
  /** Ambiance d'environnement : foule, heure, météo, etc. */
  environmentHint?: string | null;
  /** Intention narrative condensée pour prioriser le panel */
  narrativeObjective?: string | null;
  /** Contraintes canon actives pour le panel */
  canonConstraints?: string[] | null;
  /** Profil look chapitre autoritaire — source de vérité style */
  chapterLookProfile?: ChapterLookProfile | null;
  /** Ancre spatiale de la scène */
  sceneAnchor?: SceneAnchor | null;
  /** Carte d'intention visuelle du panel */
  intentCard?: PanelIntentCard | null;
  /** URGENCE 4 : accessoires requis par le panel (depuis prop inference engine) */
  requiredProps?: Array<{
    canonicalName: string;
    visibilityMode?: string | null;
    mustBeVisible?: boolean;
    narrativeRole?: string | null;
  }> | null;
  /** URGENCE 5 : PNJ présents dans cette scène avec leur descripteur visuel */
  npcPresence?: string[] | null;
  /** IMG-3 : phrase d'ancrage de style figée pour le chapitre */
  chapterStyleAnchor?: string | null;
  /** IMG-1 : type de plan manga pour les framing directives */
  shotType?: string | null;
  cutawayType?: string | null;
  subjectFocus?: string | null;
  /** Aligné sur le blueprint panel : autorise le héros au centre pour les plans réaction héros */
  heroCenterAllowed?: boolean | null;
  cameraAngle?: string | null;
  /** IMG-4 : type de beat narratif pour les effets manga */
  beatType?: string | null;
  /** STYLE-1 : URLs d'images de référence de style (passées à l'adaptateur fal) */
  referenceImageUrls?: string[] | null;
  /** STYLE-1 : politique d'application de la référence de style */
  referencePolicy?: "LIGHT" | "STRONG" | null;
}

export interface ComposedPrompt {
  positive: string;
  negative: string;
  seed?: number;
  debug?: {
    finalPrompt: string;
    promptSections: Array<{ key: string; label: string; content: string }>;
    sectionSources: Record<string, string[]>;
    resolvedPolicy: {
      hasCharacterLock: boolean;
      hasNarrativeObjective: boolean;
      hasEnvironmentLock: boolean;
      hasLookProfile?: boolean;
      hasSceneAnchor?: boolean;
      hasIntentCard?: boolean;
    };
    promptWarnings: string[];
  };
  fal?: {
    positivePrompt: string;
    negativePrompt: string;
    safetyProfile: "safe" | "teen" | "mature_non_explicit";
    intensityProfile: string;
    preset:
      | "combat_clash"
      | "combat_aftermath"
      | "rage_closeup"
      | "dialogue_tension"
      | "establishing_location"
      | "crowd_reaction"
      | "hero_entry_panel"
      | "story_panel";
  };
}

const MOOD_DESCRIPTORS: Record<PanelMood, string> = {
  action: "dynamic action scene, motion blur, speed lines, explosive energy",
  tension: "tense atmosphere, dramatic shadows, high contrast, ominous lighting",
  emotion: "emotional close-up, glistening eyes, soft warm lighting, delicate expression",
  revelation: "shocking reveal, dramatic spotlight, wide eyes, frozen moment",
  calm: "peaceful composition, soft diffused light, serene atmosphere",
  horror: "dark horror, deep oppressive shadows, unsettling angles, pale skin",
  romance: "soft romantic lighting, cherry blossom petals, warm golden tones, intimate framing",
  comedy: "comedic exaggeration, sweat drops, chibi-style reaction, bright colors",
  dramatic: "dramatic composition, strong diagonal shadows, cinematic framing",
};

const CAMERA_DESCRIPTORS: Record<string, string> = {
  "wide establishing shot": "wide shot, full environment visible, characters small in frame",
  "medium shot": "medium shot, waist up, balanced composition",
  "close-up on face": "close-up portrait, face filling frame, emotional detail",
  "over-the-shoulder shot": "over-the-shoulder perspective, depth of field",
  "extreme close-up on eyes": "extreme close-up, eyes only, intense gaze, micro detail",
  "low angle shot": "low angle, looking up, powerful imposing figure",
  "bird's eye view": "bird's eye view, top-down perspective, full scene overview",
};

const INTENSITY_CONSTRAINTS: Record<string, string> = {
  GENERAL_SAFE: "family friendly, no violence, no suggestive content",
  TEEN: "mild action, teen appropriate, light drama only",
  // FIX-2 : MATURE_DRAMA autorise le gore stylisé, la violence dark manga et l'horreur
  MATURE_DRAMA: "dark manga style, stylized violence allowed, blood splatter manga ink style, dark seinen aesthetic, visceral action, dramatic wounds, intense combat damage, horror manga composition, mature dark themes",
  MATURE_VISUAL: "mature visual content, artistic nudity allowed, explicit violence, dark themes",
  ADULT_EXPLICIT: "adult content, explicit artistic nudity, dark romance, explicit violence, extreme gore manga style, visceral wounds, blood splatter heavy, seinen extreme violence, visceral body horror manga, intense combat damage, no censorship manga style, extreme mature themes",
  RESTRICTED_BLOCKED_VISUAL: "BLOCKED",
};

const BASE_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, " +
  "watermark, text overlay, low quality, duplicate character, poorly drawn face, " +
  "missing fingers, extra fingers, fused characters, inconsistent art style, empty background, vague background, plain backdrop, studio background, floating character, disconnected characters, no environment interaction, washed image, overblur";

// IMG-2 : Négatif prompt manga universel — interdit tout ce qui casse le style manga
const MANGA_UNIVERSAL_NEGATIVE =
  "photorealistic, photography, 3d render, CGI, western comics style, american comics, " +
  "Marvel style, DC style, pixar style, anime 3d, portrait photo, selfie, " +
  "centered composition always, white background, studio background, signature, artist signature, " +
  "bad anatomy, deformed hands, extra fingers, fused fingers, missing limbs, floating limbs";

// IMG-1 : Framing directives selon shotType + subjectFocus
const MANGA_FRAMING_MAP: Record<string, string> = {
  "wide_environment": "wide establishing shot, full background detail, characters small in frame, manga environmental panel, environmental storytelling",
  "wide_action": "dynamic action shot, motion blur lines, speed lines, manga action panel, kinetic energy, explosive composition",
  "wide_crowd": "crowd scene, multiple figures, manga public scene, depth of field, social dynamics visible",
  "closeup_reaction": "extreme close-up face, manga reaction panel, expressive eyes, emotion lines, hatching screen tone background",
  "closeup_emotion": "extreme close-up face, manga emotion panel, glistening eyes, micro expression detail, emotion lines",
  "closeup_prop": "macro close-up insert panel, object detail shot, manga prop focus, sharp object detail",
  "closeup_enemy": "villain reveal close-up, manga antagonist panel, intimidating gaze, dramatic lighting",
  "medium_hero": "medium shot, manga hero panel, dynamic pose, detailed costume, clean crisp linework",
  "medium_dialogue": "over-shoulder dialogue shot, manga conversation panel, speech bubble space reserved top",
  "medium_combat": "manga combat panel, dynamic fighting pose, impact lines, kinetic composition",
  "over_shoulder": "over-the-shoulder perspective, manga POV panel, depth of field, subject in focus",
  "splash_reveal": "splash page reveal, full page impact, manga revelation panel, dramatic composition, widescreen manga",
  // Variantes dark/gore
  "wide_gore_aftermath": "wide shot aftermath, battle damage environment, debris field, dark atmosphere, empty battlefield, broken environment",
  "closeup_wound": "extreme close-up injury, manga wound rendering, dark seinen style, dramatic impact mark, intense detail",
  "medium_horror": "horror medium shot, unsettling framing, distorted space, horror manga composition, pale skin contrast",
  "wide_horror": "horror establishing shot, oppressive environment, dark atmosphere, twisted space, no safe ground in frame",
  "action_gore": "intense combat close-up, visceral action lines, impact moment, dark manga combat, kinetic violent energy",
};

// IMG-4 : Effets manga par type de beat
const BEAT_TYPE_ADDONS: Record<string, string> = {
  combat: "speed lines, motion blur, impact burst, kinetic energy lines, manga action sfx styling",
  action_gore: "speed lines, impact burst, blood splatter ink style, visceral wound detail, heavy manga gore sfx, body damage visible, extreme combat impact",
  chase: "speed lines, blur trail, motion streak, horizontal momentum lines, kinetic manga panel",
  revelation: "dramatic sunburst background, manga reveal panel, screen tone burst, radial lines emanating",
  emotional: "emotion screen tone, sparkle effects, soft diagonal screen tone, manga emotional moment",
  infiltration: "deep ink shadows, cross-hatching, noir manga style, stealth atmosphere, high contrast",
  confrontation: "dramatic impact lines, manga standoff panel, tension lines between figures",
  romance: "soft screen tone overlay, petal effects, warm hatching, manga romantic moment",
  comedy: "manga comedy panel, sweat drops, reaction lines, chibi exaggeration possible",
  body_horror_reveal: "visceral body horror manga, grotesque transformation, ink splatter heavy, extreme detail flesh, horror manga composition",
};

// QUAL-1 : Vocabulaire gore spécifique par sous-genre dark
function buildDarkGenreBlock(
  genre: string | null | undefined,
  layer: string,
): string | null {
  if (layer !== "MATURE_DRAMA" && layer !== "MATURE_VISUAL" && layer !== "ADULT_EXPLICIT") return null;

  const g = (genre ?? "").toLowerCase();

  if (/gore|guro|splatter/.test(g)) {
    return "dark gore manga style, visceral wounds stylized, blood splatter ink rendering, seinen splatter aesthetic, intense violence rendered in ink, horror manga composition";
  }
  if (/horror|horreur/.test(g)) {
    return "dark horror manga, junji ito inspired atmosphere, oppressive shadows, distorted anatomy horror style, unsettling composition, psychological horror visual, twisted surreal space";
  }
  if (/seinen|dark|grimdark/.test(g)) {
    return "dark seinen manga, gritty realistic style, heavy cross-hatching shadows, brutal atmosphere, visceral drama, damaged world aesthetic";
  }
  if (/post.?apo|apocalypse|wasteland/.test(g)) {
    return "post-apocalyptic manga aesthetic, ruined world, desolate atmosphere, survival dark tone, gritty environmental detail";
  }
  if (/military|militaire|war|guerre/.test(g)) {
    return "military manga style, tactical combat panel, weapon detail, war damage, realistic injuries manga rendering";
  }

  return "dark manga style, mature seinen aesthetic, intense dramatic shadows, adult drama visual";
}

// URGENCE 4 : Construire le bloc d'accessoires requis
function buildRequiredPropsBlock(
  props: NonNullable<NonNullable<PanelPromptInput["requiredProps"]>>,
): string {
  if (!props.length) return "";

  const visibleProps = props.filter((p) => p.mustBeVisible !== false);
  if (!visibleProps.length) return "";

  const parts = visibleProps.map((p) => {
    const visualDescriptor = getPropVisualDescriptor(p.canonicalName) ?? p.canonicalName;
    switch (p.visibilityMode) {
      case "in_hand":     return `holding ${visualDescriptor} in hand, prominently visible, sharp focus`;
      case "foreground_insert": return `${visualDescriptor} in foreground, extreme close-up detail, sharp focus`;
      case "used_in_action": return `using ${visualDescriptor} actively, visible in action pose`;
      case "on_body":    return `${visualDescriptor} worn/holstered, clearly visible on character`;
      case "aftermath_trace": return `${visualDescriptor} visible on ground, aftermath detail`;
      default:           return `${visualDescriptor} clearly visible in scene`;
    }
  });

  return parts.join(", ");
}

function describeCharacter(c: CharacterRef): string {
  const parts: string[] = [`[${c.name}]`];
  if (c.lockStrength && c.lockStrength !== "NONE") {
    parts.push(`lock ${c.lockStrength.toLowerCase()}`);
  }
  if (c.importanceTier) {
    parts.push(`tier ${c.importanceTier.toLowerCase()}`);
  }
  if (c.continuityBudget && c.continuityBudget !== "none") {
    parts.push(`continuity ${c.continuityBudget}`);
  }

  // CREATURE-3 : description anatomique prioritaire pour les entités non-humaines
  const entityKind = c.entityKind?.trim().toLowerCase();
  if (entityKind && entityKind !== "human" && entityKind !== "named_npc" && entityKind !== "") {
    const creatureStyleHints: Record<string, string> = {
      monster: "large imposing creature, terrifying anatomy, detailed manga monster design",
      creature: "fantastical creature, unique anatomy, manga creature design",
      animal: "animal manga style, detailed anatomy",
      spirit: "ethereal ghostly form, translucent, spiritual energy",
      construct: "mechanical robot body, metallic surface, visible joints",
      dragon: "massive dragon, detailed scales, powerful wings",
      demon: "dark demon, menacing horns, supernatural menace",
      beast: "powerful beast, wild anatomy, raw ferocity",
    };
    const styleHint = creatureStyleHints[entityKind] ?? `${entityKind} creature, detailed anatomy`;
    if (c.speciesLabel) parts.push(c.speciesLabel);
    parts.push(styleHint);
    if (c.appearance) parts.push(c.appearance);
    if (c.bodyDetails) parts.push(c.bodyDetails);
    if (c.hardTraits && c.hardTraits.length > 0) {
      parts.push(`MUST HAVE: ${c.hardTraits.slice(0, 4).join(", ")}`);
    }
    parts.push("manga creature art style, detailed anatomy, consistent design");
    return parts.join(", ");
  }

  const normalizedGender = c.gender?.trim().toLowerCase();
  if (normalizedGender === "male") parts.push("male, adult man");
  else if (normalizedGender === "female") parts.push("female, adult woman");

  if (c.visualSignatureText) parts.push(c.visualSignatureText);

  // appearance contient les détails uniques (bras bionique, cicatrice, tatouage…)
  if (c.appearance) parts.push(c.appearance);

  if (!c.visualSignatureText) {
    if (c.hairColor) parts.push(`${c.hairColor} hair`);
    if (c.eyeColor) parts.push(`${c.eyeColor} eyes`);
    if (c.outfitDefault) parts.push(c.outfitDefault);
  }

  // Détails corporels et vestimentaires enrichis
  if (c.bodyDetails) parts.push(c.bodyDetails);
  if (c.wardrobeDetails) parts.push(c.wardrobeDetails);
  if (c.recurringMemory) parts.push(c.recurringMemory);

  // Hard traits — non négociables
  if (c.hardTraits && c.hardTraits.length > 0) {
    parts.push(`HARD LOCK: ${c.hardTraits.slice(0, 5).join(", ")}`);
  } else if (c.fingerprint?.hardTraits && c.fingerprint.hardTraits.length > 0) {
    parts.push(`HARD LOCK: ${c.fingerprint.hardTraits.slice(0, 5).join(", ")}`);
  }

  return parts.join(", ");
}

function resolveVisualStyle(stylePack?: StylePackRef | null): string {
  if (!stylePack) return "detailed manga art, professional manga panel";
  const parts: string[] = [];
  if (stylePack.visualStyle) parts.push(stylePack.visualStyle);
  else if (stylePack.description) parts.push(stylePack.description);
  else if (stylePack.name) parts.push(`${stylePack.name} style`);
  if (stylePack.anatomyBias) parts.push(`anatomy bias ${stylePack.anatomyBias}`);
  if (stylePack.backgroundDensity) parts.push(`background density ${stylePack.backgroundDensity}`);
  if (stylePack.cameraLanguage) parts.push(`camera language ${stylePack.cameraLanguage}`);
  parts.push("manga panel");
  return parts.join(", ");
}

function sanitizeSectionText(value: string) {
  return value.replace(/\s+/g, " ").replace(/,+/g, ",").trim();
}

function buildEnvironmentLock(input: PanelPromptInput) {
  const pieces: string[] = [];
  const lower = `${input.location} ${input.action} ${input.environmentHint ?? ""} ${input.sceneContext ?? ""}`.toLowerCase();
  if (/(lycée|lycee|école|ecole|school|campus)/.test(lower)) {
    pieces.push("school courtyard or campus architecture must stay readable");
    pieces.push("students visible in background or around the conflict");
    pieces.push("no generic outdoor backdrop");
  }
  if (/(humili|ridicul|moque|crowd|students|foule)/.test(lower)) {
    pieces.push("social crowd reaction must be visible around the protagonists");
  }
  if (/(wide|establishing)/.test((input.camera ?? "").toLowerCase())) {
    pieces.push("full environment visible with clear foreground, midground and background");
  }
  return pieces.join(" | ");
}

function inferPromptPreset(input: PanelPromptInput): NonNullable<ComposedPrompt["fal"]>["preset"] {
  const lower = `${input.action} ${input.sceneContext ?? ""} ${input.dialogueHint ?? ""}`.toLowerCase();
  if (/(fight|combat|battle|duel|impact|strike|kick|punch)/.test(lower)) return "combat_clash";
  if (/(aftermath|retomb|apres le choc|after the hit)/.test(lower)) return "combat_aftermath";
  if (/(rage|furie|berserk|scream)/.test(lower)) return "rage_closeup";
  if (/(crowd|foule|public|students reacting)/.test(lower)) return "crowd_reaction";
  if (/(entry|apparition|entr[ée]e|arrive)/.test(lower)) return "hero_entry_panel";
  if (/(wide|establishing)/.test((input.camera ?? "").toLowerCase())) return "establishing_location";
  if (input.dialogueHint) return "dialogue_tension";
  return "story_panel";
}

export function buildNpcMemoryBlock(recurringNpcs: Array<{ label: string; shortVisualCore: string; speciesLabel?: string | null }>): string {
  if (recurringNpcs.length === 0) return "";
  return `\n=== PERSONNAGES SECONDAIRES RÉCURRENTS ===\n` +
    `Ces PNJ ont déjà été établis visuellement. Leurs traits DOIVENT être cohérents si ils réapparaissent.\n` +
    recurringNpcs.map(n =>
      `• ${n.label}${n.speciesLabel ? ` (${n.speciesLabel})` : ""} : ${n.shortVisualCore}`
    ).join("\n") +
    `\n=== FIN MÉMOIRE NPC ===\n`;
}

function buildCompositionDirective(blueprint: { subjectFocus: string; heroCenterAllowed?: boolean }): string {
  const focus = blueprint.subjectFocus;

  if (focus === "environment" || focus === "aftermath") {
    return "COMPOSITION: Le personnage principal NE DOIT PAS être au centre. Plan large sur le décor, l'architecture ou l'atmosphère. Si des personnages apparaissent, ils sont petits, en silhouette ou en arrière-plan.";
  }
  if (focus === "npc") {
    return "COMPOSITION: Centré sur les personnages secondaires ou la foule. Le héros principal est absent ou en arrière-plan flou. Montrer les visages, réactions et postures des NPC.";
  }
  if (focus === "enemy") {
    return "COMPOSITION: L'antagoniste ou le garde est le sujet principal. Cadrage menaçant, contre-plongée ou angle bas. Le héros est absent ou en réaction floue en arrière-plan.";
  }
  if (focus === "group") {
    return "COMPOSITION: Plan de groupe — héros ET antagoniste dans le même cadre. Tension spatiale entre les deux camps clairement lisible.";
  }
  if (focus === "prop") {
    return "COMPOSITION: Insert sur un objet, une arme, un symbole ou un détail de décor. Pas de visage humain en sujet principal. Cadrage serré, mise au point nette sur l'objet.";
  }
  if (focus === "reaction" && !blueprint.heroCenterAllowed) {
    return "COMPOSITION: Plan de réaction sur un personnage AUTRE que le héros principal. Émotion visible : surprise, peur, colère, tristesse.";
  }
  if (focus === "reaction" && blueprint.heroCenterAllowed) {
    return "COMPOSITION: Gros plan sur la réaction du personnage principal. Expression émotionnelle intense, lisible, premier plan.";
  }
  return "";
}

/**
 * Compose un prompt image structuré pour un panel manga.
 * Intègre le style du projet, les descriptions canoniques des personnages,
 * la caméra, le mood et les contraintes de contenu.
 */
export function composeMangaPanelPrompt(input: PanelPromptInput): ComposedPrompt {
  const layer = input.contentIntensityLayer ?? "TEEN";

  if (layer === "RESTRICTED_BLOCKED_VISUAL") {
    throw new Error("Content blocked: RESTRICTED_BLOCKED_VISUAL layer");
  }

  const visualStyle = resolveVisualStyle(input.stylePack);
  const moodDesc = MOOD_DESCRIPTORS[input.mood] ?? "dramatic manga panel";
  const cameraDesc =
    CAMERA_DESCRIPTORS[input.camera] ?? `${input.camera}, manga composition`;
  const intensityNote = INTENSITY_CONSTRAINTS[layer] ?? "";

  const charDescs =
    input.characters && input.characters.length > 0
      ? input.characters.map(describeCharacter).join(" | ")
      : "";

  const blueprint = input.sceneBlueprint;
  const preset = inferPromptPreset(input);
  const environmentLock = buildEnvironmentLock(input);
  const promptWarnings: string[] = [];
  const promptSections: Array<{ key: string; label: string; content: string }> = [];
  const addSection = (key: string, label: string, content: string) => {
    if (!content.trim()) return;
    promptSections.push({ key, label, content: sanitizeSectionText(content) });
  };

  // ChapterLookProfile — source de vérité style
  if (input.chapterLookProfile) {
    addSection("chapterLookProfile", "Chapter Look Profile", buildLookProfilePromptBlock(input.chapterLookProfile));
  }

  addSection("characterCanonLock", "Character Canon Lock", charDescs ? `Subject lock: ${charDescs}.` : "");

  // Hard traits depuis fingerprints
  if (input.characters && input.characters.length > 0) {
    const hardTraitBlocks = input.characters
      .filter((c) => c.fingerprint?.hardTraits && c.fingerprint.hardTraits.length > 0)
      .map((c) => compileHardTraitsPromptBlock(c.fingerprint!))
      .filter(Boolean);
    if (hardTraitBlocks.length > 0) {
      addSection("hardTraitsLock", "Hard Traits Lock", hardTraitBlocks.join(" | "));
    }
  }

  // PanelIntentCard — beat visuel autoritaire
  if (input.intentCard) {
    addSection("panelIntent", "Panel Intent / Beat", buildPanelIntentPromptBlock(input.intentCard));
  }

  // SceneAnchor — continuité spatiale
  if (input.sceneAnchor) {
    addSection("sceneAnchor", "Scene Spatial Anchor", buildSceneAnchorPromptBlock(input.sceneAnchor));
  }

  addSection(
    "narrativeObjective",
    "Narrative Objective",
    input.narrativeObjective
      ? `Narrative objective: ${input.narrativeObjective}.`
      : input.sceneContext
        ? `Continuity: ${input.sceneContext.slice(0, 220)}.`
        : "",
  );
  addSection("actionPoseEmotion", "Exact Action / Pose / Emotion", `Action: ${input.action}. Mood and lighting: ${moodDesc}.`);
  addSection("cameraComposition", "Camera / Composition / Framing", `Camera and composition: ${cameraDesc}.`);
  addSection(
    "environmentContext",
    "Environment / Context",
    `Environment: ${input.location} clearly visible. ${input.environmentHint?.slice(0, 220) ?? ""}${environmentLock ? ` Strict environment readability: ${environmentLock}.` : ""}`,
  );
  addSection("renderingMood", "Rendering / Inking / Mood", `Style: ${visualStyle}. ${intensityNote && layer !== "GENERAL_SAFE" ? `Content boundaries: ${intensityNote}.` : ""}`);

  // IMG-1 : Manga framing directive selon le type de plan
  const shotKey = input.shotType && input.subjectFocus
    ? `${input.shotType}_${input.subjectFocus}`
    : input.shotType && input.cutawayType
      ? `${input.shotType}_${input.cutawayType}`
      : input.shotType ?? null;
  if (shotKey && MANGA_FRAMING_MAP[shotKey]) {
    addSection("mangaFraming", "Manga Panel Framing", MANGA_FRAMING_MAP[shotKey]);
  }

  // IMG-4 : Effets manga selon le beatType
  if (input.beatType && BEAT_TYPE_ADDONS[input.beatType]) {
    addSection("beatEffects", "Beat FX / Manga Effects", BEAT_TYPE_ADDONS[input.beatType]);
  }

  // Magic / supernatural effects detection from action text
  const magicKeywords = /\b(magi[ceq]|spell|aura|energy|glow|power|supernatural|incantation|sorcell|enchant|invoc|rituel|rune|arcane|mystique|mana|pouvoir|gardien|gardienne|[eé]veil|[eé]veille|r[eé]v[eè]le|r[eé]v[eé]lation|capacit[eé]|don)\b/i;
  if (magicKeywords.test(input.action ?? "") || magicKeywords.test(input.sceneContext ?? "")) {
    addSection("magicEffect", "Magic Effects",
      "magical energy visible and readable, aura or glow effect emanating from character hands or body, " +
      "speed lines from magic source, dramatic light burst, energy particles, mystical light rays, " +
      "manga magical effect, screen tone burst for reveal, radial lines from power source");
  }

  // STYLE-1 + IMG-3 : Style anchor renforcé — cohérence intra-chapitre obligatoire
  if (input.chapterStyleAnchor) {
    const styleEnforcement = [
      input.chapterStyleAnchor,
      "IMPORTANT: maintain consistent art style throughout all panels",
      "same line weight, same shading technique, same character proportions as established",
    ].filter(Boolean).join(", ");
    addSection("chapterStyleAnchor", "Chapter Style Enforcement", styleEnforcement);
  }

  // STYLE-1 : injecter styleRefImageUrl du StylePack comme ancre de référence légère si disponible
  if (input.stylePack?.styleRefImageUrl && !input.referenceImageUrls?.length) {
    input.referenceImageUrls = [input.stylePack.styleRefImageUrl];
    input.referencePolicy = "LIGHT";
  }

  // URGENCE 4 : Accessoires requis depuis le prop inference engine + prop visual library
  if (input.requiredProps && input.requiredProps.length > 0) {
    const propsBlock = buildRequiredPropsBlock(input.requiredProps);
    if (propsBlock) {
      addSection("requiredProps", "Required Props / Key Objects", `KEY OBJECTS: ${propsBlock}`);
    }
  }

  // QUAL-1 : vocabulaire gore / dark genre spécifique
  const darkGenreBlock = buildDarkGenreBlock(input.stylePack?.description ?? input.stylePack?.name ?? null, layer);
  if (darkGenreBlock) {
    addSection("darkGenre", "Dark Genre Style", darkGenreBlock);
  }

  // URGENCE 5 : PNJ récurrents présents dans cette scène
  if (input.npcPresence && input.npcPresence.length > 0) {
    const npcBlock = input.npcPresence.slice(0, 3).join("; ");
    addSection("npcPresence", "Background NPC Characters", `BACKGROUND CHARACTERS: ${npcBlock}`);
  }

  if (input.subjectFocus) {
    const compositionDirective = buildCompositionDirective({
      subjectFocus: input.subjectFocus,
      heroCenterAllowed: input.heroCenterAllowed ?? false,
    });
    if (compositionDirective) {
      addSection("compositionDirective", "Composition Directive", compositionDirective);
    }
  }

  if (!charDescs && input.characters && input.characters.length > 0) {
    promptWarnings.push("character_lock_missing");
  }
  if (!input.narrativeObjective && !input.sceneContext) {
    promptWarnings.push("narrative_objective_missing");
  }

  const positiveParts = promptSections.map((section) => section.content);
  if (blueprint) {
    positiveParts.push(
      sanitizeSectionText(`Spatial relation: ${blueprint.composition.framingRules.join(", ")}.`),
      sanitizeSectionText(
        `Spatial staging: foreground ${blueprint.environment.foregroundElements.join(", ")}; midground ${blueprint.environment.midgroundElements.join(", ")}; background ${blueprint.environment.backgroundElements.join(", ")}.`,
      ),
    );
    if (blueprint.constraints.hard.length > 0) {
      positiveParts.push(sanitizeSectionText(`Mandatory constraints: ${blueprint.constraints.hard.join(", ")}.`));
    }
    // ── Premium hard constraints from panel blueprint ──────────────────────
    const pb = blueprint.promptBridge;
    if (pb.focusLine) {
      positiveParts.push(sanitizeSectionText(pb.focusLine));
    }
    if (pb.requiredPropLine) {
      positiveParts.push(sanitizeSectionText(pb.requiredPropLine));
    }
    if (pb.requiredEnemyLine) {
      positiveParts.push(sanitizeSectionText(pb.requiredEnemyLine));
    }
    if (pb.speakerAnchorLine) {
      positiveParts.push(sanitizeSectionText(pb.speakerAnchorLine));
    }
    if (pb.cutawayLine) {
      positiveParts.push(sanitizeSectionText(pb.cutawayLine));
    }
  }
  if (input.dialogueHint) positiveParts.push(sanitizeSectionText(`Subtext: ${input.dialogueHint.slice(0, 120)}.`));
  positiveParts.push("Readable background, strong environment, coherent manga composition, clear spatial relation between characters and place.");
  if (input.characters && input.characters.length > 0) {
    positiveParts.push("Keep character continuity stable: same hair, same face, same outfit, same silhouette.");
  }

  const positive = positiveParts.filter(Boolean).join(" ");

  // Negative prompt enrichi selon le layer + verrous de dérive visuelle
  // IMG-2 : négatif manga universel préfixé systématiquement
  let negative = `${MANGA_UNIVERSAL_NEGATIVE}, ${BASE_NEGATIVE}`;
  if (input.characters && input.characters.length > 0) {
    const driftGuards = input.characters
      .flatMap((c) => {
        const guards: string[] = [];
        // Verrous standards champ par champ
        if (c.hairColor) guards.push(`wrong hair color for ${c.name}`);
        if (c.eyeColor) guards.push(`wrong eye color for ${c.name}`);
        if (c.outfitDefault) guards.push(`wrong outfit for ${c.name}`);
        // forbiddenDrift : liste de traits visuels explicitement interdits
        if (c.forbiddenDrift && c.forbiddenDrift.length > 0) {
          guards.push(...c.forbiddenDrift.slice(0, 6));
        }
        return guards;
      })
      .filter(Boolean)
      .join(", ");
    if (driftGuards) negative += `, ${driftGuards}`;
  }
  if (/(lycée|lycee|école|ecole|school|campus)/i.test(`${input.location} ${input.action} ${input.environmentHint ?? ""}`)) {
    negative += ", generic campus background, empty school courtyard, missing students, blank outdoor backdrop";
  }
  if (input.stylePack?.negativeConstraints?.length) {
    negative += `, ${input.stylePack.negativeConstraints.join(", ")}`;
  }
  // Verrous de genre : empêcher le modèle de changer le sexe des personnages
  if (input.characters && input.characters.length > 0) {
    const maleChars = input.characters.filter((c) => c.gender?.trim().toLowerCase() === "male");
    const femaleChars = input.characters.filter((c) => c.gender?.trim().toLowerCase() === "female");
    if (maleChars.length > 0 && femaleChars.length === 0) {
      negative += ", woman, female, feminine, girl, long feminine hair";
    } else if (femaleChars.length > 0 && maleChars.length === 0) {
      negative += ", man, male, masculine, boy, beard, facial hair";
    }
  }
  if (layer === "GENERAL_SAFE" || layer === "TEEN") {
    negative += ", nudity, violence, blood, gore, suggestive poses";
  }

  // Anti-collapse premium constraint dans le négatif
  if (blueprint?.promptBridge.antiCollapseLine) {
    negative += `, ${blueprint.promptBridge.antiCollapseLine}`;
  }

  // ChapterLookProfile — familles visuelles incompatibles
  if (input.chapterLookProfile) {
    const lookNeg = buildLookProfileNegativeBlock(input.chapterLookProfile);
    if (lookNeg) negative += `, ${lookNeg}`;
  }

  // Hard traits forbidden drift depuis fingerprints
  if (input.characters && input.characters.length > 0) {
    const hardNegBlocks = input.characters
      .filter((c) => c.fingerprint)
      .map((c) => compileHardTraitsNegativeBlock(c.fingerprint!))
      .filter(Boolean);
    if (hardNegBlocks.length > 0) {
      negative += `, ${hardNegBlocks.join(", ")}`;
    }
  }

  // PanelIntentCard — éléments à éviter selon le beat
  if (input.intentCard) {
    const intentNeg = buildPanelIntentNegativeBlock(input.intentCard);
    if (intentNeg) negative += `, ${intentNeg}`;
  }

  return {
    positive,
    negative,
    seed: input.seed,
    debug: {
      finalPrompt: positive,
      promptSections,
      sectionSources: {
        characterCanonLock: input.characters?.map((character) => character.name) ?? [],
        narrativeObjective: [input.narrativeObjective ?? input.sceneContext ?? ""].filter(Boolean),
        actionPoseEmotion: [input.action, input.mood],
        cameraComposition: [input.camera],
        environmentContext: [input.location, input.environmentHint ?? "", environmentLock],
        renderingMood: [visualStyle, intensityNote],
      },
      resolvedPolicy: {
        hasCharacterLock: Boolean(charDescs),
        hasNarrativeObjective: Boolean(input.narrativeObjective || input.sceneContext),
        hasEnvironmentLock: Boolean(environmentLock),
        hasLookProfile: Boolean(input.chapterLookProfile),
        hasSceneAnchor: Boolean(input.sceneAnchor),
        hasIntentCard: Boolean(input.intentCard),
      },
      promptWarnings,
    },
    fal: {
      positivePrompt: positive,
      negativePrompt: negative,
      safetyProfile: layer === "GENERAL_SAFE" ? "safe" : layer === "TEEN" ? "teen" : "mature_non_explicit",
      intensityProfile: intensityNote,
      preset,
    },
  };
}

/**
 * Compose un prompt pour une image de couverture de chapitre.
 */
export function composeChapterCoverPrompt(input: {
  stylePack?: StylePackRef | null;
  characters?: CharacterRef[];
  chapterTitle: string;
  tone: string;
  mood: PanelMood;
  contentIntensityLayer?: string;
}): ComposedPrompt {
  const visualStyle = resolveVisualStyle(input.stylePack);
  const moodDesc = MOOD_DESCRIPTORS[input.mood] ?? "dramatic";
  const charDescs =
    input.characters && input.characters.length > 0
      ? input.characters.map(describeCharacter).join(" | ")
      : "";

  const positive = [
    visualStyle,
    "manga chapter cover, full page illustration",
    charDescs,
    `tone: ${input.tone}`,
    moodDesc,
    "epic composition, detailed background, professional manga cover art",
  ]
    .filter(Boolean)
    .join(", ");

  return { positive, negative: BASE_NEGATIVE };
}
