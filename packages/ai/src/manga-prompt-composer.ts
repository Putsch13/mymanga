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
  TEEN: "mild action, no explicit content, teen appropriate",
  MATURE_DRAMA: "mature themes allowed, no explicit nudity, dark drama",
  MATURE_VISUAL: "mature visual content, artistic nudity allowed, dark themes",
  ADULT_EXPLICIT: "adult content, explicit artistic nudity, dark romance, mature themes",
  RESTRICTED_BLOCKED_VISUAL: "BLOCKED",
};

const BASE_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, " +
  "watermark, text overlay, low quality, duplicate character, poorly drawn face, " +
  "missing fingers, extra fingers, fused characters, inconsistent art style, empty background, vague background, plain backdrop, studio background, floating character, disconnected characters, no environment interaction, washed image, overblur";

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

  const entityKind = c.entityKind?.trim().toLowerCase();
  if (entityKind && entityKind !== "human" && entityKind !== "named_npc") {
    parts.push(entityKind);
    if (c.speciesLabel) parts.push(c.speciesLabel);
    if (c.appearance) parts.push(c.appearance);
    if (c.bodyDetails) parts.push(c.bodyDetails);
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
  let negative = BASE_NEGATIVE;
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
