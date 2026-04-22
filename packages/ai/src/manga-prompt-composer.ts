/**
 * @deprecated LEGACY fallback prompt composer (Sprint C).
 *
 * Ce fichier est conserve uniquement comme fallback pour les cas ou le
 * `CanonicalImagePromptPacket` (voir `packages/ai/src/services/canonical-prompt-recipe-builder.ts`)
 * n'est pas disponible. Le chemin de production doit passer par :
 *
 *   canonical-prompt-recipe-builder.ts
 *     → fal-prompt-flattener.ts
 *     → fal-prompt-payload-builder.ts
 *     → provider FAL
 *
 * Chaque invocation runtime des exports publics de ce fichier
 * (`composeMangaPanelPrompt`, `composeChapterCoverPrompt`) est loguee une fois
 * par process pour mesurer la part de trafic legacy restant. Objectif : tomber
 * a 0% d'invocations en production pour pouvoir supprimer ce module.
 *
 * Ne pas ajouter de nouvelle logique ici. Toute nouveaute va dans le chemin
 * canonical.
 */

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
import { getStylePreset, stylePresetExtraTerms } from "./style-presets";

// ─── Legacy usage tracking ────────────────────────────────────────────────────
// On logue une fois par process pour mesurer la part de trafic legacy.
// Cible : 0 invocation en prod. Les tests sautent volontairement ce warning.
const __legacyComposerWarnedFor = new Set<string>();
function warnLegacyComposer(entry: string): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  if (__legacyComposerWarnedFor.has(entry)) return;
  __legacyComposerWarnedFor.add(entry);
  // eslint-disable-next-line no-console
  console.warn(
    `[manga-prompt-composer:legacy] ${entry} invoked — ` +
    `fallback path, canonical packet should be preferred (see Sprint C).`,
  );
}

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
    /** P0.4 — Catégorie de propriétaire pour éviter d'attribuer les props au mauvais personnage */
    ownerCategory?: "hero" | "enemy" | "guard" | "npc" | "ambient" | "unassigned" | null;
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
  /**
   * DIFF-3 : slug d'un style preset (ex: "shonen_classic", "cyberpunk_neon").
   * Si renseigné, le preset enrichit le stylePack et ajoute des termes positifs/négatifs.
   * Voir `STYLE_PRESETS` pour la liste complète.
   */
  stylePresetSlug?: string | null;
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
  "medium_environment": "medium shot with environment dominant, manga environmental panel, architecture and setting readable, characters secondary in frame",
  "closeup_environment": "close-up environmental detail, manga location texture, architectural or object detail, atmosphere-driven panel",
  "extreme_closeup_environment": "macro close-up environmental detail, manga texture panel, material and atmosphere focus, no character centered",
  "wide_action": "dynamic action shot, motion blur lines, speed lines, manga action panel, kinetic energy, explosive composition",
  "wide_crowd": "crowd scene, multiple figures, manga public scene, depth of field, social dynamics visible",
  "closeup_reaction": "extreme close-up face, manga reaction panel, expressive eyes, emotion lines, hatching screen tone background",
  "closeup_emotion": "extreme close-up face, manga emotion panel, glistening eyes, micro expression detail, emotion lines",
  "closeup_prop": "macro close-up insert panel, object detail shot, manga prop focus, sharp object detail",
  "closeup_enemy": "villain reveal close-up, manga antagonist panel, intimidating gaze, dramatic lighting",
  "closeup_npc": "secondary character close-up, manga NPC reveal panel, expressive reaction, detailed face, character personality visible",
  "extreme_closeup_npc": "extreme close-up secondary character, manga NPC emotion panel, micro-expression detail, emotion lines",
  "medium_npc": "medium shot NPC character, manga secondary character panel, clear body language, distinct silhouette, reaction to hero",
  "wide_npc": "wide shot with secondary character prominent, manga NPC establishing panel, readable body language, environment clues visible",
  "medium_interaction": "two-shot interaction panel, manga dialogue scene, both characters visible, spatial tension readable, face-to-face composition",
  "wide_interaction": "wide two-shot interaction, manga confrontation panel, characters framed together, spatial geography clear",
  "closeup_interaction": "tight two-shot interaction, manga dialogue close-up, both faces visible, emotional exchange readable",
  "medium_enemy": "medium shot villain panel, manga antagonist confrontation, menacing body language, dramatic pose",
  "wide_enemy": "wide shot villain reveal, manga antagonist establishing panel, environmental menace, full silhouette",
  "medium_hero": "medium shot, manga hero panel, dynamic pose, detailed costume, clean crisp linework",
  "extreme_closeup_hero": "extreme close-up hero, manga key emotion panel, intense gaze, micro-expression",
  "wide_hero": "wide shot hero panel, manga heroic composition, full body visible, environment readable",
  "wide_reaction": "wide shot reaction panel, manga group reaction, multiple responses visible, emotional spread",
  "medium_reaction": "medium shot reaction panel, manga emotional response, clear body language, reaction lines",
  "wide_prop": "wide shot with prominent prop, manga object-focused panel, object in context of environment",
  "medium_prop": "medium shot prop panel, manga object reveal, tactile detail, held or displayed object",
  "wide_aftermath": "wide aftermath shot, manga consequence panel, changed environment, silence and stillness",
  "medium_aftermath": "medium shot aftermath, manga quiet moment, debris and breath, emotional weight",
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
  // H7 : "revelation" n'injecte plus d'effets lumineux auto (sunburst,
  // screen tone burst, radial lines). Un reveal doit être décidé par l'IA2
  // via renderMode=insert_object ou creature_reveal + mustShow explicite.
  revelation: "manga reveal panel framing, emphasized subject clarity",
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
// P0.4 — Formule le prompt en attribuant les props au bon propriétaire
function buildRequiredPropsBlock(
  props: NonNullable<NonNullable<PanelPromptInput["requiredProps"]>>,
): string {
  if (!props.length) return "";

  const visibleProps = props.filter((p) => p.mustBeVisible !== false);
  if (!visibleProps.length) return "";

  const parts = visibleProps.map((p) => {
    const visualDescriptor = getPropVisualDescriptor(p.canonicalName) ?? p.canonicalName;
    const owner = p.ownerCategory ?? "unassigned";

    // P0.4 — Préfixe selon le propriétaire pour éviter que Flux attribue tout au héros
    const ownerPrefix = (() => {
      switch (owner) {
        case "guard": return "guards carrying";
        case "enemy": return "enemy wielding";
        case "npc": return "NPC holding";
        case "ambient": return ""; // Props ambiants sans propriétaire explicite
        case "hero": return "protagonist with";
        default: return ""; // Pas de préfixe si non assigné
      }
    })();

    switch (p.visibilityMode) {
      case "in_hand":
        return ownerPrefix
          ? `${ownerPrefix} ${visualDescriptor} in hand, prominently visible, sharp focus`
          : `holding ${visualDescriptor} in hand, prominently visible, sharp focus`;
      case "foreground_insert":
        return `${visualDescriptor} in foreground, extreme close-up detail, sharp focus`;
      case "used_in_action":
        return ownerPrefix
          ? `${ownerPrefix} ${visualDescriptor} actively, visible in action pose`
          : `using ${visualDescriptor} actively, visible in action pose`;
      case "on_body":
        return ownerPrefix
          ? `${ownerPrefix} ${visualDescriptor} holstered/worn, clearly visible`
          : `${visualDescriptor} worn/holstered, clearly visible on character`;
      case "aftermath_trace":
        return `${visualDescriptor} visible on ground, aftermath detail`;
      default:
        return ownerPrefix
          ? `${ownerPrefix} ${visualDescriptor} clearly visible in scene`
          : `${visualDescriptor} clearly visible in scene`;
    }
  });

  return parts.join(", ");
}

function describeCharacter(c: CharacterRef, mode: "full" | "supporting" = "full"): string {
  const parts: string[] = [`[${c.name}]`];

  // En mode "supporting" (le perso N'EST PAS le focus du panel), on retire le lock fort,
  // les tiers, et tous les hard_traits. Sinon le hero "hard_lock, tier main_hero, continuity strict"
  // écrase le NPC focus et Flux rend toujours Lyra. On garde juste un signal minimal d'identité.
  if (mode === "supporting") {
    const normalizedGender = c.gender?.trim().toLowerCase();
    if (normalizedGender === "male") parts.push("male");
    else if (normalizedGender === "female") parts.push("female");
    if (c.hairColor) parts.push(`${c.hairColor} hair`);
    if (c.outfitDefault) parts.push(c.outfitDefault);
    parts.push("secondary / background role, not the subject of this panel");
    return parts.join(", ");
  }

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

function resolveVisualStyle(stylePack?: StylePackRef | null, stylePresetSlug?: string | null): string {
  // DIFF-3 : un preset renseigné prend la priorité sur le stylePack libre
  // (le preset est considéré comme une intention explicite utilisateur).
  const preset = getStylePreset(stylePresetSlug ?? null);
  const parts: string[] = [];

  if (preset) {
    parts.push(preset.visualStyle);
    // Complète avec les hints du stylePack projet si disjoints du preset
    if (stylePack?.anatomyBias) parts.push(`anatomy bias ${stylePack.anatomyBias}`);
    if (stylePack?.backgroundDensity) parts.push(`background density ${stylePack.backgroundDensity}`);
    if (stylePack?.cameraLanguage) parts.push(`camera language ${stylePack.cameraLanguage}`);
    parts.push("manga panel");
    return parts.join(", ");
  }

  if (!stylePack) return "detailed manga art, professional manga panel";
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

/**
 * SUPPRIMÉ (audit hardening H5) — `buildCompositionDirective` injectait
 * des blocs prose FR longs et parfois contradictoires dans chaque prompt
 * (ex: "COMPOSITION: Le personnage principal NE DOIT PAS être au centre ...").
 *
 * Ces directives éditoriales doivent être décidées en amont par l'IA2
 * (manga-editor-agent) puis encodées dans le `renderMode` / `subjectFocus`
 * du `StoryboardPanel`. Elles ne doivent PLUS être transformées en prose
 * qui rentre dans le prompt image.
 *
 * Le helper est conservé en no-op pour ne pas casser l'API des call-sites
 * legacy, mais renvoie toujours "" : plus aucune directive globale n'est
 * injectée par le composer.
 */
function buildCompositionDirective(_blueprint: { subjectFocus: string; heroCenterAllowed?: boolean }): string {
  return "";
}

/**
 * Compose un prompt image structuré pour un panel manga.
 * Intègre le style du projet, les descriptions canoniques des personnages,
 * la caméra, le mood et les contraintes de contenu.
 *
 * @deprecated LEGACY. **Ne pas utiliser depuis le render-pass v3.**
 *
 * Pour la pipeline v3 (PIPELINE_V3_STORYBOARD), le builder autorisé est
 * `buildMinimalPanelPrompt` (`packages/ai/src/services/minimal-panel-prompt-builder.ts`)
 * qui travaille directement sur un `PanelRenderSpec` validé, en anglais,
 * court, non contradictoire, sans couche de traduction.
 *
 * Ce composer reste pour le legacy fallback (pipeline v1/v2) uniquement.
 * Toute nouvelle fonctionnalité doit passer par la pipeline v3.
 */
export function composeMangaPanelPrompt(input: PanelPromptInput): ComposedPrompt {
  warnLegacyComposer("composeMangaPanelPrompt");
  const layer = input.contentIntensityLayer ?? "TEEN";

  if (layer === "RESTRICTED_BLOCKED_VISUAL") {
    throw new Error("Content blocked: RESTRICTED_BLOCKED_VISUAL layer");
  }

  const visualStyle = resolveVisualStyle(input.stylePack, input.stylePresetSlug);
  const moodDesc = MOOD_DESCRIPTORS[input.mood] ?? "dramatic manga panel";
  const cameraDesc =
    CAMERA_DESCRIPTORS[input.camera] ?? `${input.camera}, manga composition`;
  const intensityNote = INTENSITY_CONSTRAINTS[layer] ?? "";

  // Réordonner le cast selon subjectFocus pour que le Subject Lock reflète la hiérarchie :
  // important_npc/npc → NPC d'abord, hero en supporting ; enemy → antagoniste d'abord.
  // Sans ça, le hero était toujours en tête et dominait la composition même sur un focus NPC.
  const focusForLock = input.subjectFocus;
  const reorderedCharacters = (() => {
    const list = input.characters ? [...input.characters] : [];
    if (!focusForLock || list.length <= 1) return list;
    const isHero = (c: CharacterRef) => c.importanceTier === "MAIN_HERO";
    const isAntagonist = (c: CharacterRef) => c.importanceTier === "SECONDARY_CORE";
    const isImportantNpc = (c: CharacterRef) =>
      c.importanceTier === "IMPORTANT_SUPPORTING_CHARACTER"
      || c.importanceTier === "RECURRING_NPC";
    if (focusForLock === "important_npc" || focusForLock === "npc") {
      return list.sort((a, b) => {
        if (isImportantNpc(a) && !isImportantNpc(b)) return -1;
        if (!isImportantNpc(a) && isImportantNpc(b)) return 1;
        if (isHero(a) && !isHero(b)) return 1;
        if (!isHero(a) && isHero(b)) return -1;
        return 0;
      });
    }
    if (focusForLock === "enemy" || focusForLock === "antagonist") {
      return list.sort((a, b) => {
        if (isAntagonist(a) && !isAntagonist(b)) return -1;
        if (!isAntagonist(a) && isAntagonist(b)) return 1;
        return 0;
      });
    }
    return list;
  })();

  // Déterminer qui est le FOCUS du panel pour dégrader les autres en "supporting".
  // Règle : sur subjectFocus=environment/aftermath/prop/reaction → TOUS les persos en supporting
  // (c'est un cutaway, aucun perso n'est vraiment le sujet).
  // Sur subjectFocus=important_npc/npc → le premier NPC/supporting du reorderedCharacters est focus.
  // Sur subjectFocus=enemy → le premier antagoniste est focus.
  // Sur subjectFocus=hero ou null → le premier perso (hero) est focus.
  // P0.1 — Détection élargie des cutaways : tout panel qui n'est PAS focalisé
  // sur le héros comme sujet principal. Inclut environment, aftermath, prop,
  // reaction, crowd, npc_group, surveillance, threat_insert.
  const cutawayFocus =
    focusForLock === "environment"
    || focusForLock === "aftermath"
    || focusForLock === "prop"
    || focusForLock === "reaction"
    || focusForLock === "group";
  // P0.1 — Le cutawayType explicite couvre encore plus de cas
  const explicitCutawayNonHero =
    input.cutawayType === "environment"
    || input.cutawayType === "environment_establishing"
    || input.cutawayType === "location_transition"
    || input.cutawayType === "prop_insert"
    || input.cutawayType === "object_insert"
    || input.cutawayType === "aftermath"
    || input.cutawayType === "movement_trace"
    || input.cutawayType === "reaction"
    || input.cutawayType === "reaction_insert"
    || input.cutawayType === "crowd"
    || input.cutawayType === "npc_group"
    || input.cutawayType === "surveillance"
    || input.cutawayType === "threat_insert";
  const isCutawayPanel = cutawayFocus || explicitCutawayNonHero;
  const focusCharacterIndex = cutawayFocus ? -1 : 0;

  const charDescs =
    reorderedCharacters.length > 0
      ? reorderedCharacters
          .map((c, i) => describeCharacter(c, i === focusCharacterIndex ? "full" : "supporting"))
          .join(" | ")
      : "";

  const blueprint = input.sceneBlueprint;
  const preset = inferPromptPreset(input);
  const environmentLock = buildEnvironmentLock(input);
  const promptWarnings: string[] = [];

  // P0-1 : budget-aware prompt composition. Chaque section porte une priorité
  // (1=critique, 2=important, 3=contextuel, 4=décoratif) afin que la troncature
  // finale coupe en priorité les éléments décoratifs et préserve intégralement
  // les verrous critiques (character lock, action, framing, blueprint focus).
  type SectionPriority = 1 | 2 | 3 | 4;
  const promptSections: Array<{ key: string; label: string; content: string; priority: SectionPriority }> = [];
  const addSection = (key: string, label: string, content: string, priority: SectionPriority = 3) => {
    if (!content.trim()) return;
    promptSections.push({ key, label, content: sanitizeSectionText(content), priority });
  };

  // ChapterLookProfile — source de vérité style (P2 important)
  if (input.chapterLookProfile) {
    addSection("chapterLookProfile", "Chapter Look Profile", buildLookProfilePromptBlock(input.chapterLookProfile), 2);
  }

  // P0.1 — Sur un cutaway (environment/aftermath/prop/reaction/crowd/npc_group),
  // on ne veut JAMAIS de "Subject lock: [Hero]" car Flux interprète ça comme une
  // directive de rendre le héros au centre même si le panel n'est pas sur lui.
  // On n'injecte le subject lock que si le panel EST focalisé sur un personnage.
  const shouldInjectSubjectLock = !isCutawayPanel && charDescs.length > 0;
  addSection(
    "characterCanonLock",
    "Character Canon Lock",
    shouldInjectSubjectLock ? `Subject lock: ${charDescs}.` : "",
    1,
  );

  // Hard traits depuis fingerprints
  if (input.characters && input.characters.length > 0) {
    const hardTraitBlocks = input.characters
      .filter((c) => c.fingerprint?.hardTraits && c.fingerprint.hardTraits.length > 0)
      .map((c) => compileHardTraitsPromptBlock(c.fingerprint!))
      .filter(Boolean);
    if (hardTraitBlocks.length > 0) {
      addSection("hardTraitsLock", "Hard Traits Lock", hardTraitBlocks.join(" | "), 1);
    }
  }

  // PanelIntentCard — beat visuel autoritaire (P1 critique)
  if (input.intentCard) {
    addSection("panelIntent", "Panel Intent / Beat", buildPanelIntentPromptBlock(input.intentCard), 1);
  }

  // SceneAnchor — continuité spatiale (P2 important)
  if (input.sceneAnchor) {
    addSection("sceneAnchor", "Scene Spatial Anchor", buildSceneAnchorPromptBlock(input.sceneAnchor), 2);
  }

  addSection(
    "narrativeObjective",
    "Narrative Objective",
    input.narrativeObjective
      ? `Narrative objective: ${input.narrativeObjective}.`
      : input.sceneContext
        ? `Continuity: ${input.sceneContext.slice(0, 220)}.`
        : "",
    3,
  );
  addSection("actionPoseEmotion", "Exact Action / Pose / Emotion", `Action: ${input.action}. Mood and lighting: ${moodDesc}.`, 1);
  addSection("cameraComposition", "Camera / Composition / Framing", `Camera and composition: ${cameraDesc}.`, 1);
  addSection(
    "environmentContext",
    "Environment / Context",
    `Environment: ${input.location} clearly visible. ${input.environmentHint?.slice(0, 220) ?? ""}${environmentLock ? ` Strict environment readability: ${environmentLock}.` : ""}`,
    2,
  );
  addSection("renderingMood", "Rendering / Inking / Mood", `Style: ${visualStyle}. ${intensityNote && layer !== "GENERAL_SAFE" ? `Content boundaries: ${intensityNote}.` : ""}`, 2);

  // DIFF-3 : termes positifs additionnels du style preset (si un preset est choisi).
  // Priorité 3 (contextuel) — premiers tronqués en cas de dépassement budget.
  const stylePresetExtras = stylePresetExtraTerms(input.stylePresetSlug);
  if (stylePresetExtras.positive.length > 0) {
    addSection(
      "stylePresetExtras",
      "Style Preset Reinforcement",
      stylePresetExtras.positive.join(", "),
      3,
    );
  }

  // A04: contexte univers (P4 décoratif — tronqué en premier si dépassement budget).
  if (input.environmentHint && input.environmentHint.length > 50) {
    addSection(
      "universeContext",
      "Universe Context",
      input.environmentHint.slice(0, 300),
      4,
    );
  }

  // IMG-1 : Manga framing directive selon le type de plan
  // Normaliser les variants pour matcher les clés du MANGA_FRAMING_MAP
  const normalizedFocus = input.subjectFocus === "important_npc" ? "npc"
    : input.subjectFocus === "antagonist" ? "enemy"
    : input.subjectFocus ?? null;
  const shotKey = input.shotType && normalizedFocus
    ? `${input.shotType}_${normalizedFocus}`
    : input.shotType && input.cutawayType
      ? `${input.shotType}_${input.cutawayType}`
      : input.shotType ?? null;
  // P0.1 — Fallback STRICT : si le focus N'EST PAS hero OU si c'est un cutaway,
  // on ne DOIT JAMAIS retomber sur `*_hero` (sinon Flux reçoit "manga heroic
  // composition, full body visible" sur un panel environment → il rend le hero).
  // On préfère renvoyer null plutôt que polluer le prompt avec du framing héros.
  const nonHeroFocus = normalizedFocus && normalizedFocus !== "hero";
  const resolvedFraming = (nonHeroFocus || isCutawayPanel)
    ? (
        (shotKey && MANGA_FRAMING_MAP[shotKey])
        || MANGA_FRAMING_MAP[`wide_${normalizedFocus}`]
        || MANGA_FRAMING_MAP[`medium_${normalizedFocus}`]
        || MANGA_FRAMING_MAP[`closeup_${normalizedFocus}`]
        // P0.1 — Sur un cutaway, utiliser le framing environment/prop/aftermath
        // plutôt que de fallback sur hero.
        || (isCutawayPanel ? MANGA_FRAMING_MAP["wide_environment"] : null)
        || null
      )
    : (
        (shotKey && MANGA_FRAMING_MAP[shotKey])
        || (input.shotType && MANGA_FRAMING_MAP[`${input.shotType}_hero`])
        || null
      );
  if (resolvedFraming) {
    addSection("mangaFraming", "Manga Panel Framing", resolvedFraming, 1);
  }

  // IMG-4 : Effets manga selon le beatType (P3 contextuel)
  if (input.beatType && BEAT_TYPE_ADDONS[input.beatType]) {
    addSection("beatEffects", "Beat FX / Manga Effects", BEAT_TYPE_ADDONS[input.beatType], 3);
  }

  // SUPPRIMÉ (H7) — détection magique auto par regex sur `action` /
  // `sceneContext`. Cette heuristique ajoutait "magical energy visible,
  // aura or glow effect, light rays, screen tone burst..." à n'importe
  // quel panel contenant un mot clef (magie, aura, énergie, pouvoir,
  // gardien, réveil, capacité, etc.). Résultat : des inserts objets, des
  // dialogues calmes ou des plans combat recevaient des effets lumineux
  // parasites et partaient en prompt contradictoire.
  //
  // Ces effets ne doivent être injectés QUE si le storyboard (IA2) les
  // demande explicitement via `panel.mustShow` / `renderMode=creature_reveal`
  // / `requiredProps`. Pas d'auto-injection.

  // STYLE-1 + IMG-3 : Style anchor (P2 important — cohérence intra-chapitre)
  if (input.chapterStyleAnchor) {
    const styleEnforcement = [
      input.chapterStyleAnchor,
      "IMPORTANT: maintain consistent art style throughout all panels",
      "same line weight, same shading technique, same character proportions as established",
    ].filter(Boolean).join(", ");
    addSection("chapterStyleAnchor", "Chapter Style Enforcement", styleEnforcement, 2);
  }

  // STYLE-1 : injecter styleRefImageUrl du StylePack comme ancre de référence légère si disponible
  if (input.stylePack?.styleRefImageUrl && !input.referenceImageUrls?.length) {
    input.referenceImageUrls = [input.stylePack.styleRefImageUrl];
    input.referencePolicy = "LIGHT";
  }

  // URGENCE 4 : Accessoires requis (P2 important — éléments clés narratifs)
  if (input.requiredProps && input.requiredProps.length > 0) {
    const propsBlock = buildRequiredPropsBlock(input.requiredProps);
    if (propsBlock) {
      addSection("requiredProps", "Required Props / Key Objects", `KEY OBJECTS: ${propsBlock}`, 2);
    }
  }

  // QUAL-1 : vocabulaire gore / dark genre spécifique (P3 contextuel)
  const darkGenreBlock = buildDarkGenreBlock(input.stylePack?.description ?? input.stylePack?.name ?? null, layer);
  if (darkGenreBlock) {
    addSection("darkGenre", "Dark Genre Style", darkGenreBlock, 3);
  }

  // URGENCE 5 : PNJ récurrents (P3 contextuel — arrière-plan)
  if (input.npcPresence && input.npcPresence.length > 0) {
    const npcBlock = input.npcPresence.slice(0, 3).join("; ");
    addSection("npcPresence", "Background NPC Characters", `BACKGROUND CHARACTERS: ${npcBlock}`, 3);
  }

  // SUPPRIMÉ (H5) — section "Composition Directive" injectée
  // automatiquement à chaque panel. Le cadrage / subject focus doit être
  // décidé en amont par l'IA2 (manga-editor-agent) via `renderMode`, pas
  // transformé en prose FR en prompt.

  if (!charDescs && input.characters && input.characters.length > 0) {
    promptWarnings.push("character_lock_missing");
  }
  if (!input.narrativeObjective && !input.sceneContext) {
    promptWarnings.push("narrative_objective_missing");
  }

  // P0-1 : assemblage priorisé du prompt final.
  // Chaque segment porte une priorité 1..4 ; la troncature à 1500 chars (cf.
  // optimizePromptForFal) retire d'abord les P4/P3/P2 en queue.
  const prioritizedParts: Array<{ priority: SectionPriority; text: string }> = [];
  for (const section of promptSections) {
    prioritizedParts.push({ priority: section.priority, text: section.content });
  }

  if (blueprint) {
    prioritizedParts.push({
      priority: 2,
      text: sanitizeSectionText(`Spatial relation: ${blueprint.composition.framingRules.join(", ")}.`),
    });
    // Sur un cutaway (environment/aftermath/prop/reaction), le foreground ne doit PAS être
    // le héros — sinon Flux remet Lyra devant malgré les autres directives. On réécrit le
    // staging pour faire passer le décor/prop/NPC en foreground et reléguer les persos en
    // background ou "off-frame". C'est CRITIQUE (P1) pour les cutaways.
    const heroInForeground = blueprint.environment.foregroundElements.some((el) =>
      reorderedCharacters.some((c) => c.importanceTier === "MAIN_HERO" && el.toLowerCase().includes(c.name.toLowerCase())),
    );
    if (cutawayFocus && heroInForeground) {
      const cutawayStagingMap: Record<string, string> = {
        environment: "foreground: architectural / environmental elements; midground: ambient layered background; background: distant setting cues. Characters, if any, appear only as silhouettes in midground or background, never centered.",
        aftermath: "foreground: debris / consequence markers; midground: altered environment; background: residual atmosphere. No character in foreground.",
        prop: "foreground: the key object/prop, fully legible and centered; midground: minimal context; background: subdued environment. No character centered in foreground.",
        reaction: "foreground: expressive NPC / non-protagonist face or body; midground: contextual environment; background: atmospheric cues. Hero not in foreground.",
      };
      prioritizedParts.push({
        priority: 1,
        text: sanitizeSectionText(`Spatial staging (cutaway): ${cutawayStagingMap[focusForLock ?? "environment"] ?? cutawayStagingMap.environment}`),
      });
    } else {
      prioritizedParts.push({
        priority: 2,
        text: sanitizeSectionText(
          `Spatial staging: foreground ${blueprint.environment.foregroundElements.join(", ")}; midground ${blueprint.environment.midgroundElements.join(", ")}; background ${blueprint.environment.backgroundElements.join(", ")}.`,
        ),
      });
    }
    // SUPPRIMÉ (H5) — le bloc `Mandatory constraints: ...` transformait
    // les contraintes en prose rentrant dans le prompt. Elles doivent
    // être validées en amont (render-spec-validator + storyboard-validator)
    // pas incrustées dans le texte envoyé à FAL.
    // Premium hard constraints (verrous critiques du blueprint).
    const pb = blueprint.promptBridge;
    if (pb.focusLine) prioritizedParts.push({ priority: 1, text: sanitizeSectionText(pb.focusLine) });
    if (pb.requiredPropLine) prioritizedParts.push({ priority: 1, text: sanitizeSectionText(pb.requiredPropLine) });
    if (pb.requiredEnemyLine) prioritizedParts.push({ priority: 1, text: sanitizeSectionText(pb.requiredEnemyLine) });
    if (pb.speakerAnchorLine) prioritizedParts.push({ priority: 2, text: sanitizeSectionText(pb.speakerAnchorLine) });
    if (pb.cutawayLine) prioritizedParts.push({ priority: 1, text: sanitizeSectionText(pb.cutawayLine) });
  }
  if (input.dialogueHint) {
    prioritizedParts.push({
      priority: 4,
      text: sanitizeSectionText(`Subtext: ${input.dialogueHint.slice(0, 120)}.`),
    });
  }
  // SUPPRIMÉ (H5) — deux tails prose globaux injectés à tous les panels :
  //   • "Readable background, strong environment, coherent manga composition..."
  //   • "Keep character continuity stable: same hair, same face, same outfit..."
  // Ces prose globales diluent le prompt, rentrent en contradiction avec
  // les inserts et contribuent au "prompt roman". La continuité visuelle
  // doit être garantie par les refs / LoRAs / visual locks, pas par de la
  // prose ajoutée à chaque prompt.

  // Tri stable par priorité croissante : P1 → P2 → P3 → P4. Les segments d'une
  // même priorité conservent leur ordre d'insertion.
  const positive = prioritizedParts
    .map((part, index) => ({ ...part, index }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map((p) => p.text)
    .filter(Boolean)
    .join(" ");

  // Negative prompt enrichi selon le layer + verrous de dérive visuelle
  // IMG-2 : négatif manga universel préfixé systématiquement
  let negative = `${MANGA_UNIVERSAL_NEGATIVE}, ${BASE_NEGATIVE}`;
  // P0.1 — Cutaway strict : interdire explicitement le vocabulaire héro-centrique
  // qui pollue les plans décor/prop/reaction/crowd/aftermath. Sans ce négatif,
  // Flux peut quand même rendre le héros au centre si un autre segment du prompt
  // mentionne son nom ou ses traits.
  if (cutawayFocus || isCutawayPanel) {
    negative += ", hero panel, hero portrait, manga hero panel, protagonist centered, main character foreground, hero close-up, face filling frame, tight hero framing, hero lock, hero showcase";
  }
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

  // DIFF-3 : termes négatifs additionnels du style preset (ex: cyberpunk → "medieval, rural").
  if (stylePresetExtras.negative.length > 0) {
    negative += `, ${stylePresetExtras.negative.join(", ")}`;
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
 *
 * @deprecated LEGACY fallback. Le chemin canonical n'a pas encore de recette
 * cover dediee — cette fonction reste donc active en prod le temps que la
 * couverture rejoigne le canonical packet. Chaque invocation est loguee.
 */
export function composeChapterCoverPrompt(input: {
  stylePack?: StylePackRef | null;
  characters?: CharacterRef[];
  chapterTitle: string;
  tone: string;
  mood: PanelMood;
  contentIntensityLayer?: string;
}): ComposedPrompt {
  warnLegacyComposer("composeChapterCoverPrompt");
  const visualStyle = resolveVisualStyle(input.stylePack);
  const moodDesc = MOOD_DESCRIPTORS[input.mood] ?? "dramatic";
  const charDescs =
    input.characters && input.characters.length > 0
      ? input.characters.map((c) => describeCharacter(c)).join(" | ")
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
