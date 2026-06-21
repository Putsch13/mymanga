/**
 * prompt-blocks.ts
 *
 * Blocs SUBJECT / ENVIRONMENT / SHOT / ACTION / STYLE du prompt minimal,
 * helpers de description perso, LoRA cues. Extrait de
 * `minimal-panel-prompt-builder.ts` (audit-v9).
 */

import type {
  PanelRenderCharacterVisualDna,
  PanelRenderSpec,
  PanelRenderVisibleCharacter,
} from "../../contracts/panel-render-spec";
import { buildDecorDnaAndNpcSuffix } from "./prompt-environment-npc";
import {
  humanizeAngle,
  humanizeShot,
  normalizePromptClause,
} from "./prompt-text-utils";

// ─────────────────────────────────────────────────────────────────────────────
// SUBJECT
// ─────────────────────────────────────────────────────────────────────────────

/** Plafond pour les traits configurateur (visage, mâchoire, yeux…) dans le bloc SUBJECT. */
export const CHARACTER_CONFIGURATOR_PROMPT_MAX = 140;

/**
 * Compacte les champs `PanelRenderCharacterVisualDna` issus du configurateur
 * (hors excerpt déjà injecté) pour enrichir le prompt sans explosion de tokens.
 */
export function compactConfiguratorTraitsForPrompt(
  dna: PanelRenderCharacterVisualDna | null | undefined,
  maxChars: number = CHARACTER_CONFIGURATOR_PROMPT_MAX,
): string {
  if (!dna) return "";
  const parts: string[] = [];
  const push = (v: string | null | undefined) => {
    const s = normalizePromptClause(v ?? "");
    if (s) parts.push(s);
  };
  push(dna.faceShape);
  push(dna.jawline);
  const eyePair = [dna.eyeShape, dna.eyeSize]
    .map((x) => normalizePromptClause(x ?? ""))
    .filter(Boolean)
    .join(" ");
  if (eyePair) parts.push(eyePair);
  push(dna.eyebrowStyle);
  push(dna.hairLength);
  push(dna.hairTexture);
  push(dna.noseStyle);
  push(dna.mouthStyle);
  const joined = parts.join("; ");
  if (!joined) return "";
  return joined.length > maxChars ? `${joined.slice(0, maxChars - 1)}…` : joined;
}

/** Description canon riche pour le bloc SUBJECT (ADN visuel + intention pose/expression). */
export function describeCharacterWithCanon(character: PanelRenderVisibleCharacter): string {
  const dna = character.visualDNA;
  const eyeRaw = dna?.eyeColor ?? character.eyeColor;
  const hairRaw = dna?.hairColor ?? character.hairColor;
  const eyeColor = eyeRaw ? `, ${eyeRaw} eyes` : "";
  const hairColor = hairRaw ? `, ${hairRaw} hair` : "";
  const hairStyle = dna?.hairStyle ? `, ${dna.hairStyle}` : "";
  const outfit = dna?.outfitSignature ? `, wearing ${dna.outfitSignature}` : "";
  const skin = dna?.skinTone ? `, ${dna.skinTone} skin tone` : "";
  const structureLine = compactConfiguratorTraitsForPrompt(dna ?? null);
  const structureSuffix = structureLine ? `, structure: ${structureLine}` : "";
  const studioCanon =
    dna?.visualCanonExcerpt
      ? `, visual canon: ${normalizePromptClause(dna.visualCanonExcerpt).slice(0, 200)}`
      : "";
  const extraBits = [
    dna?.perceivedAge ? `reads ${normalizePromptClause(dna.perceivedAge)}` : "",
    dna?.silhouetteType ? `${normalizePromptClause(dna.silhouetteType)} build` : "",
    dna?.bodyType ? `body: ${normalizePromptClause(dna.bodyType)}` : "",
    dna?.distinctiveMarksLine ? normalizePromptClause(dna.distinctiveMarksLine) : "",
    dna?.scars?.length ? `scars: ${dna.scars.slice(0, 3).join(", ")}` : "",
    dna?.tattoos?.length ? `tattoos: ${dna.tattoos.slice(0, 2).join(", ")}` : "",
    dna?.accessoriesLine ? `accessories ${normalizePromptClause(dna.accessoriesLine)}` : "",
    dna?.accessories?.length ? `gear: ${dna.accessories.slice(0, 3).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const extra =
    extraBits.length > 0 ? `, ${extraBits.length > 140 ? `${extraBits.slice(0, 137)}…` : extraBits}` : "";
  const roleLabel = character.role === "hero" ? "protagonist" : character.role;
  const canon = character.canonSignatureText ? `, canonical detail: ${character.canonSignatureText}` : "";
  const pose = character.poseIntent ? `, pose: ${character.poseIntent}` : "";
  const expr = character.expressionIntent ? `, expression: ${character.expressionIntent}` : "";
  return `${character.name} (${roleLabel})${eyeColor}${hairColor}${hairStyle}${skin}${outfit}${structureSuffix}${studioCanon}${extra}${canon}${pose}${expr}`;
}

/** Dédoublonne les personnages visibles d'une case : un même perso (même id ou
 * même nom) ne doit JAMAIS apparaître deux fois (sinon "Lyma and Lyma" sur les
 * cases dialogue quand le cast ne contient qu'un héros). */
function dedupeVisibleCharacters(chars: PanelRenderVisibleCharacter[]): PanelRenderVisibleCharacter[] {
  const seen = new Set<string>();
  const out: PanelRenderVisibleCharacter[] = [];
  for (const c of chars) {
    const key = (
      (c as { id?: string }).id?.trim()
      || (c.name ?? "").trim().toLowerCase()
    );
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function listCharacterDescriptions(chars: PanelRenderVisibleCharacter[], max: number): string[] {
  return dedupeVisibleCharacters(chars).slice(0, max).map((c) => describeCharacterWithCanon(c));
}

function buildDialogueTwoShotSubject(chars: PanelRenderVisibleCharacter[]): string {
  const descs = listCharacterDescriptions(chars, 2);
  if (descs.length >= 2) {
    return `SUBJECT: two-character dialogue staging with ${descs[0]} and ${descs[1]}, balanced framing, neither character dominates the frame.`;
  }
  if (descs.length === 1) {
    return `SUBJECT: dialogue beat centered on ${descs[0]} with the speaking partner implied off-camera, no dominant solo hero portrait.`;
  }
  return `SUBJECT: dialogue staging between two implied characters, balanced framing, no dominant solo portrait.`;
}

function buildDialogueOverShoulderSubject(chars: PanelRenderVisibleCharacter[]): string {
  const descs = listCharacterDescriptions(chars, 2);
  if (descs.length >= 2) {
    return `SUBJECT: over-the-shoulder conversation between ${descs[0]} and ${descs[1]}, readable speaker-listener geometry, no dominant solo portrait.`;
  }
  if (descs.length === 1) {
    return `SUBJECT: over-the-shoulder dialogue framing on ${descs[0]}, off-camera counterpart implied by the composition, no dominant solo portrait.`;
  }
  return `SUBJECT: over-the-shoulder dialogue geometry, implied speaker and listener, no dominant solo portrait.`;
}

function buildGroupTensionSubject(chars: PanelRenderVisibleCharacter[]): string {
  const descs = listCharacterDescriptions(chars, 3);
  if (descs.length > 0) {
    return `SUBJECT: tense ensemble staging with ${descs.join("; ")}, body language and spacing carry the stakes, no single portrait dominates the frame.`;
  }
  return `SUBJECT: tense ensemble staging, body language and spacing carry the stakes, no single portrait dominates the frame.`;
}

function buildAftermathDialogueSubject(chars: PanelRenderVisibleCharacter[]): string {
  const descs = listCharacterDescriptions(chars, 2);
  if (descs.length > 0) {
    return `SUBJECT: post-event dialogue beat featuring ${descs.join(" and ")}, grounded recovery moment with context still visible, no triumphant hero poster pose.`;
  }
  return `SUBJECT: post-event dialogue beat, grounded recovery moment with context still visible, no triumphant hero poster pose.`;
}

export function buildPromptSubjectBlock(spec: PanelRenderSpec): string {
  if (
    spec.renderMode === "establishing_environment" ||
    spec.renderMode === "silent_transition"
  ) {
    return `SUBJECT: environment-first panel focused on place, atmosphere, and spatial context; any characters remain secondary.`;
  }
  if (spec.renderMode === "insert_object") {
    return `SUBJECT: isolated object insert, object fills frame, composition excludes people and faces.`;
  }
  if (spec.renderMode === "creature_reveal") {
    return `SUBJECT: non-human creature(s) as primary subject, species-consistent silhouette and proportions, characters (if present) relegated to observer role in midground.`;
  }
  if (spec.renderMode === "vehicle_reveal") {
    return `SUBJECT: vehicle(s) as primary readable subject, coherent scale and industrial design, wheels or hull clearly visible; characters if any stay secondary or in cockpit only.`;
  }
  if (spec.renderMode === "faction_reveal") {
    return `SUBJECT: faction members as coordinated group, uniform motifs and emblems readable, collective silhouette; not a generic anonymous crowd.`;
  }
  if (spec.renderMode === "threat_silhouette") {
    return `SUBJECT: looming silhouette / unidentified figure observed from distance, backlit or obscured, no clear facial features, atmospheric menace.`;
  }
  if (spec.renderMode === "enemy_reveal") {
    return `SUBJECT: antagonist revealed in menacing framing, identifiable posture and gear, hero absent or reduced to reaction foreground.`;
  }
  const chars = spec.visibleCharacters;
  if (spec.renderMode === "dialogue_two_shot") {
    return buildDialogueTwoShotSubject(chars);
  }
  if (spec.renderMode === "dialogue_over_shoulder") {
    return buildDialogueOverShoulderSubject(chars);
  }
  if (spec.renderMode === "character_focus") {
    if (chars.length === 0) {
      return `SUBJECT: single-character medium framing, readable posture and costume, no implied second speaker.`;
    }
    const primary = chars[0]!;
    return `SUBJECT: ${describeCharacterWithCanon(primary)} as sole focal figure in medium shot, clear pose and costume continuity; environment remains secondary.`;
  }
  if (spec.renderMode === "group_tension") {
    return buildGroupTensionSubject(chars);
  }
  if (spec.renderMode === "aftermath_dialogue") {
    return buildAftermathDialogueSubject(chars);
  }
  if (chars.length === 0) {
    return `SUBJECT: atmospheric scene read without a dominant identifiable face; staging stays grounded in the established setting.`;
  }
  const primary = chars[0]!;
  const others = chars.slice(1, 3);
  const parts: string[] = [];
  parts.push(
    `SUBJECT: ${describeCharacterWithCanon(primary)} as primary subject${spec.subjectFocus === "reaction" ? ", facial reaction emphasized" : ""}.`,
  );
  if (others.length > 0) {
    parts.push(
      `Secondary: ${others.map(describeCharacterWithCanon).join(", ")}.`,
    );
  }
  return parts.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENT
// ─────────────────────────────────────────────────────────────────────────────

export function buildPromptEnvironmentBlock(spec: PanelRenderSpec): string {
  const decorSuffix = buildDecorDnaAndNpcSuffix(spec);
  const rawLoc = typeof spec.locationName === "string" ? spec.locationName.trim() : "";
  const envLock = spec.continuityLocks.environmentLocks
    .map(normalizePromptClause)
    .find((s) => s.length > 0);
  const environmentAnchor =
    rawLoc && rawLoc.toLowerCase() !== "unknown"
      ? rawLoc
      : envLock
        ? envLock
        : "story-consistent interior/exterior";
  const density = spec.styleBible.backgroundDensity;
  const environmentLocks = spec.continuityLocks.environmentLocks
    .map(normalizePromptClause)
    .filter(Boolean)
    .slice(0, 2);
  const densityHint =
    density === "minimal"
      ? "clean minimal background"
      : density === "detailed"
        ? "richly detailed background"
        : "medium-density background";
  if (spec.renderMode === "insert_object") {
    const lockLine = environmentLocks.length > 0
      ? ` Continuity cues: ${environmentLocks.join("; ")}.`
      : "";
    return `ENVIRONMENT: blurred / simplified ${environmentAnchor}, focus entirely on object.${lockLine}${decorSuffix}`;
  }
  if (
    spec.renderMode === "reaction_closeup" ||
    spec.renderMode === "hero_closeup" ||
    spec.renderMode === "npc_closeup" ||
    spec.renderMode === "enemy_closeup" ||
    spec.renderMode === "character_focus"
  ) {
    const lockLine = environmentLocks.length > 0
      ? ` Continuity cues remain readable: ${environmentLocks.join("; ")}.`
      : "";
    return `ENVIRONMENT: ${environmentAnchor}, shallow depth, ${densityHint} kept soft behind subject.${lockLine}${decorSuffix}`;
  }
  if (spec.renderMode === "threat_silhouette") {
    const lockLine = environmentLocks.length > 0
      ? ` Continuity cues: ${environmentLocks.join("; ")}.`
      : "";
    return `ENVIRONMENT: ${environmentAnchor}, backlit atmosphere, strong contre-jour, subject reduced to shape.${lockLine}${decorSuffix}`;
  }
  if (spec.renderMode === "aftermath_dialogue") {
    const lockLine = environmentLocks.length > 0
      ? ` Continuity cues: ${environmentLocks.join("; ")}.`
      : "";
    return `ENVIRONMENT: ${environmentAnchor}, subdued lighting post-event, debris or altered state visible in background.${lockLine}${decorSuffix}`;
  }
  const lockLine = environmentLocks.length > 0
    ? ` Continuity cues: ${environmentLocks.join("; ")}.`
    : "";
  return `ENVIRONMENT: ${environmentAnchor}, ${densityHint}, consistent with chapter continuity.${lockLine}${decorSuffix}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOT
// ─────────────────────────────────────────────────────────────────────────────

export function buildPromptShotBlock(spec: PanelRenderSpec): string {
  const angle = humanizeAngle(spec.cameraAngle);
  const shot = humanizeShot(spec.shotType);
  return `SHOT: ${shot}, ${angle}, renderMode=${spec.renderMode}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION (visibility levels)
// ─────────────────────────────────────────────────────────────────────────────

const MUST_SHOW_CAP_CRITICAL = 5;
const MUST_SHOW_CAP_DEFAULT = 3;
const RENDER_MODES_EXTRA_MUST_SHOW: ReadonlySet<PanelRenderSpec["renderMode"]> = new Set([
  "creature_reveal",
  "enemy_reveal",
  "hero_closeup",
  "reaction_closeup",
]);

/**
 * AUDIT-V8 — Renderer modes orientés "personnage(s) au centre".
 * Pour ces modes, les `mustShow` qui décrivent un décor / lieu doivent
 * apparaître comme **arrière-plan visible** plutôt que comme sujet
 * obligatoire (le sujet, c'est le perso et son acting). Sinon le modèle
 * surcharge la composition (cf. diag CTO P8 : "Temple Mystérieux
 * obligatoire dans un dialogue two-shot" → image surchargée).
 */
const CHARACTER_FIRST_RENDER_MODES: ReadonlySet<PanelRenderSpec["renderMode"]> = new Set([
  "dialogue_two_shot",
  "dialogue_over_shoulder",
  "aftermath_dialogue",
  "hero_closeup",
  "reaction_closeup",
  "npc_closeup",
  "enemy_closeup",
]);

/** Heuristique : est-ce un terme de décor / lieu plutôt qu'un personnage / objet plot ? */
function looksLikeLocationCue(value: string): boolean {
  const lower = value.toLowerCase();
  // Mots-clés communs de lieux (FR + EN), trigger conservateur
  return /\b(temple|jungle|forêt|forest|port|harbor|street|rue|alley|ruelle|montagne|mountain|océan|ocean|river|rivière|sky|ciel|building|bâtiment|maison|house|tower|tour|palace|palais|castle|château|chambre|room|cave|grotte|stadium|stade|market|marché|garden|jardin|park|parc)\b/.test(
    lower,
  );
}

export function buildPromptActionBlock(spec: PanelRenderSpec): string {
  const action = normalizePromptClause(spec.actionLine) || "static beat";
  const emotion = normalizePromptClause(spec.emotionLine);
  const dialogueIntent = normalizePromptClause(spec.dialogueIntent);
  const mustShowCap = RENDER_MODES_EXTRA_MUST_SHOW.has(spec.renderMode)
    ? MUST_SHOW_CAP_CRITICAL
    : MUST_SHOW_CAP_DEFAULT;
  const mustShowAll = spec.constraints.mustShow
    .map(normalizePromptClause)
    .filter(Boolean)
    .slice(0, mustShowCap);

  // AUDIT-V8 — Visibility levels
  // Pour les panels orientés perso, on sépare :
  //   - mandatory (perso, accessoires plot) = sujet
  //   - background visible (lieu / décor) = présent mais pas dominant
  let mustShowPrimary = mustShowAll;
  let backgroundVisible: string[] = [];
  if (CHARACTER_FIRST_RENDER_MODES.has(spec.renderMode)) {
    mustShowPrimary = [];
    backgroundVisible = [];
    for (const cue of mustShowAll) {
      if (looksLikeLocationCue(cue)) backgroundVisible.push(cue);
      else mustShowPrimary.push(cue);
    }
  }

  const parts = [`ACTION: ${action}.`];
  if (mustShowPrimary.length > 0) {
    parts.push(`Mandatory visible elements: ${mustShowPrimary.join("; ")}.`);
  }
  if (backgroundVisible.length > 0) {
    // FIX-24 (MAJEUR) — Les modèles diffusion ignorent les négations
    // dans le prompt positif ("not the subject" → ils dessinent le
    // sujet quand même). On reformule en directive positive : "subtle
    // background presence". L'exclusion réelle se fait via le negative
    // prompt (déjà couvert par FORBIDDEN_BY_RENDER_MODE).
    parts.push(
      `Subtle background presence: ${backgroundVisible.join("; ")}.`,
    );
  }
  if (dialogueIntent) {
    // FIX-23 / FIX-24 — Acting note (jamais de texte littéral) +
    // suppression de la négation "no speech bubbles..." du positif. Les
    // bulles / texte sont déjà bannis dans le negative prompt
    // (`speech bubble`, `text in image`, `caption`, `subtitles`…).
    parts.push(
      `Dialogue acting: ${dialogueIntent}. Convey through gaze, posture, spacing, and mouth movement only.`,
    );
  }
  if (emotion) {
    parts.push(`Emotion: ${emotion}.`);
  }
  return parts.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE + LoRA
// ─────────────────────────────────────────────────────────────────────────────

const LORA_PROMPT_MAX_BINDINGS = 3;
const LORA_PROMPT_MAX_CHARS = 140;

/**
 * Trigger words LoRA pour le prompt positif (URLs réservées au routeur FAL).
 * Plafonné pour ne pas saturer le budget STYLE.
 */
export function formatLoraBindingsForPrompt(spec: PanelRenderSpec): string {
  const list = spec.loraBindings;
  if (!Array.isArray(list) || list.length === 0) return "";
  const bits: string[] = [];
  for (const b of list.slice(0, LORA_PROMPT_MAX_BINDINGS)) {
    const tw = normalizePromptClause(b.triggerWord);
    const nm = normalizePromptClause(b.characterName);
    if (tw && nm) bits.push(`${nm}: ${tw}`);
    else if (tw) bits.push(tw);
    else if (nm) bits.push(nm);
  }
  if (!bits.length) return "";
  let out = `LoRA cues: ${bits.join(" | ")}.`;
  if (out.length > LORA_PROMPT_MAX_CHARS) {
    out = `${out.slice(0, LORA_PROMPT_MAX_CHARS - 1)}…`;
  }
  return out;
}

/** Ancre manga permanente et FORTE. Flux/dev penche vers le photoréalisme :
 * on préfixe un signal manga/anime 2D explicite en tête du STYLE (position la
 * plus pondérée), même si `styleBible.artStyle` mentionne déjà "shōnen" (non
 * reconnu comme manga par les modèles). Garantit un rendu de case 2D, jamais
 * une "photo réelle". */
function ensureMangaAnchor(artStyle: string): string {
  return `Japanese manga panel art, anime 2D illustration, clean ink linework, screentone shading, ${artStyle}`;
}

export function buildPromptStyleBlock(spec: PanelRenderSpec): string {
  const s = spec.styleBible;
  const tones = s.toneKeywords.slice(0, 3).join(", ");
  // NOTE: les trigger words LoRA ne sont PLUS injectés ici. Ils sont
  // ajoutés une seule fois, en tête de prompt, par `injectLoraTriggerWords`
  // (default-panel-image-generator) — placement front = meilleure adhérence
  // Flux LoRA. Émettre aussi "LoRA cues:" dans STYLE créait une double
  // injection qui sur-pondérait le trigger et dégradait le rendu trained.
  return [
    `STYLE: ${ensureMangaAnchor(s.artStyle)}`,
    `palette ${s.palette}`,
    `inking ${s.inking}`,
    `linework ${s.lineWeightHint}`,
    `screentones ${s.screentoneIntensity}`,
    `panel border ${s.panelBorderStyle}`,
    tones ? `tone keywords: ${tones}` : "",
  ]
    .filter(Boolean)
    .join(", ") + ".";
}
