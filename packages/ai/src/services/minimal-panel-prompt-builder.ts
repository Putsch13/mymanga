/**
 * minimal-panel-prompt-builder — construit un prompt image COURT,
 * structuré, non contradictoire à partir d'un PanelRenderSpec.
 *
 * Règles fortes :
 *   - le prompt final tient entre 700 et 1200 chars max
 *   - il est construit directement en anglais (pas de traduction FR->EN)
 *   - un `establishing_environment` ne contient PAS "tight face / hero closeup"
 *   - un `insert_object` ne contient PAS "full character portrait"
 *   - un `reaction_closeup` ne contient PAS "wide establishing"
 *   - pas de texte dans l'image si styleBible.noTextInsideImage
 *
 * Remplace le chemin critique de composeMangaPanelPrompt (manga-prompt-composer.ts).
 */

import type {
  PanelRenderSpec,
  PanelRenderVisibleCharacter,
} from "../contracts/panel-render-spec";

export interface BuiltPromptResult {
  positive: string;
  negative: string;
  blocks: {
    subject: string;
    environment: string;
    shot: string;
    action: string;
    style: string;
    negative: string;
  };
  length: number;
}

const MIN_LENGTH = 700;
const MAX_LENGTH = 1200;

export function buildMinimalPanelPrompt(spec: PanelRenderSpec): BuiltPromptResult {
  const subject = buildPromptSubjectBlock(spec);
  const environment = buildPromptEnvironmentBlock(spec);
  const shot = buildPromptShotBlock(spec);
  const action = buildPromptActionBlock(spec);
  const style = buildPromptStyleBlock(spec);
  const negative = buildPromptNegativeBlock(spec);

  const positiveSections = [subject, environment, shot, action, style].filter(Boolean);
  let positive = positiveSections.join("\n");
  positive = clampLength(positive, MAX_LENGTH);
  if (positive.length < MIN_LENGTH) {
    positive = padWithStyleHints(positive, spec);
  }
  return {
    positive,
    negative,
    blocks: { subject, environment, shot, action, style, negative },
    length: positive.length,
  };
}

export function buildPromptSubjectBlock(spec: PanelRenderSpec): string {
  if (
    spec.renderMode === "establishing_environment" ||
    spec.renderMode === "silent_transition"
  ) {
    return `SUBJECT: environment-first panel, no dominant face, no hero portrait.`;
  }
  if (spec.renderMode === "insert_object") {
    return `SUBJECT: isolated object insert, object fills frame, no character body or face in shot.`;
  }
  if (spec.renderMode === "creature_reveal") {
    return `SUBJECT: non-human creature(s) as primary subject, species-consistent silhouette and proportions, characters (if present) relegated to observer role in midground.`;
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
  if (spec.renderMode === "group_tension") {
    return buildGroupTensionSubject(chars);
  }
  if (spec.renderMode === "aftermath_dialogue") {
    return buildAftermathDialogueSubject(chars);
  }
  if (chars.length === 0) {
    return `SUBJECT: environment only, no identifiable character.`;
  }
  const primary = chars[0]!;
  const others = chars.slice(1, 3);
  const parts: string[] = [];
  parts.push(
    `SUBJECT: ${describeCharacter(primary)} as primary subject${spec.subjectFocus === "reaction" ? ", facial reaction emphasized" : ""}.`,
  );
  if (others.length > 0) {
    parts.push(
      `Secondary: ${others.map(describeCharacter).join(", ")}.`,
    );
  }
  return parts.join(" ");
}

export function buildPromptEnvironmentBlock(spec: PanelRenderSpec): string {
  const loc = spec.locationName?.trim() || "neutral setting";
  const density = spec.styleBible.backgroundDensity;
  const densityHint =
    density === "minimal"
      ? "clean minimal background"
      : density === "detailed"
        ? "richly detailed background"
        : "medium-density background";
  if (spec.renderMode === "insert_object") {
    return `ENVIRONMENT: blurred / simplified ${loc}, focus entirely on object.`;
  }
  if (
    spec.renderMode === "reaction_closeup" ||
    spec.renderMode === "hero_closeup" ||
    spec.renderMode === "npc_closeup" ||
    spec.renderMode === "enemy_closeup"
  ) {
    return `ENVIRONMENT: ${loc}, shallow depth, ${densityHint} kept soft behind subject.`;
  }
  if (spec.renderMode === "threat_silhouette") {
    return `ENVIRONMENT: ${loc}, backlit atmosphere, strong contre-jour, subject reduced to shape.`;
  }
  if (spec.renderMode === "aftermath_dialogue") {
    return `ENVIRONMENT: ${loc}, subdued lighting post-event, debris or altered state visible in background.`;
  }
  return `ENVIRONMENT: ${loc}, ${densityHint}, consistent with chapter continuity.`;
}

export function buildPromptShotBlock(spec: PanelRenderSpec): string {
  const angle = humanizeAngle(spec.cameraAngle);
  const shot = humanizeShot(spec.shotType);
  return `SHOT: ${shot}, ${angle}, renderMode=${spec.renderMode}.`;
}

export function buildPromptActionBlock(spec: PanelRenderSpec): string {
  const action = normalizePromptClause(spec.actionLine) || "static beat";
  const emotion = normalizePromptClause(spec.emotionLine);
  const dialogueIntent = normalizePromptClause(spec.dialogueIntent);
  const parts = [`ACTION: ${action}.`];
  if (dialogueIntent) {
    parts.push(
      `Dialogue subtext: ${dialogueIntent}. Convey it through gaze, posture, spacing, and mouth movement only; no speech bubbles or text in image.`,
    );
  }
  if (emotion) {
    parts.push(`Emotion: ${emotion}.`);
  }
  return parts.join(" ");
}

export function buildPromptStyleBlock(spec: PanelRenderSpec): string {
  const s = spec.styleBible;
  const tones = s.toneKeywords.slice(0, 3).join(", ");
  return [
    `STYLE: ${s.artStyle}`,
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

/**
 * Matrice stricte d'interdictions par `renderMode`. Un panel en mode X
 * ne DOIT jamais contenir les tokens listés dans son entrée — ni dans
 * le positif (assertion au build), ni dans le négatif (ajoutés
 * automatiquement pour verrouiller le modèle).
 *
 * Règles alignées avec la directive H6 de l'audit hardening premium.
 */
export const FORBIDDEN_BY_RENDER_MODE: Record<PanelRenderSpec["renderMode"], string[]> = {
  establishing_environment: [
    "tight face",
    "hero portrait",
    "eyes only",
    "face filling frame",
    "extreme close-up",
    "close-up portrait",
  ],
  silent_transition: [
    "tight face",
    "hero portrait",
    "face filling frame",
  ],
  reaction_closeup: [
    "wide establishing shot",
    "wide establishing",
    "full background detail",
    "characters small in frame",
    "environmental panel",
    "crowd composition",
  ],
  hero_closeup: [
    "wide establishing shot",
    "full environment visible",
    "characters small in frame",
    "crowd composition",
  ],
  npc_closeup: [
    "wide establishing shot",
    "full environment visible",
    "crowd composition",
  ],
  enemy_closeup: [
    "wide establishing shot",
    "full environment visible",
    "crowd composition",
  ],
  insert_object: [
    "close-up portrait",
    "face filling frame",
    "hero close-up",
    "hero portrait",
    "full character portrait",
    "full body character",
    "group shot",
    "subject lock [hero]",
  ],
  dialogue_two_shot: [
    "prop insert as primary subject",
    "object insert as primary subject",
    "extreme close-up on object",
  ],
  dialogue_over_shoulder: [
    "prop insert as primary subject",
    "object insert as primary subject",
  ],
  surveillance_reveal: [
    "hero close-up",
    "face filling frame",
  ],
  group_tension: [
    "extreme close-up",
    "isolated object insert",
  ],
  combat_exchange: [
    "environment cutaway",
    "characters small in frame",
    "serene atmosphere",
    "static pose",
  ],
  combat_aftermath: [
    "active combat pose",
    "mid-swing weapon",
  ],
  enemy_reveal: [
    "characters small in frame",
    "wide establishing shot",
    "hero close-up",
  ],
  creature_reveal: [
    "tight face",
    "hero portrait",
    "face filling frame",
    "close-up portrait",
    "hero close-up",
  ],
  threat_silhouette: [
    "clear facial features",
    "face filling frame",
    "hero close-up",
    "well-lit subject",
  ],
  aftermath_dialogue: [
    "active combat pose",
    "mid-swing weapon",
    "wide establishing shot",
  ],
};

export function buildPromptNegativeBlock(spec: PanelRenderSpec): string {
  const baseNegatives = [
    "3d render",
    "photorealistic",
    "chibi",
    "watermark",
    "signature",
    "text in image",
    "speech bubble",
    "caption",
    "logo",
    "blurry lineart",
    "deformed hands",
    "extra fingers",
    "duplicate face",
  ];
  const drift = spec.constraints.forbiddenDrift;
  const mustNot = spec.constraints.mustNotShow;
  const modeBans = FORBIDDEN_BY_RENDER_MODE[spec.renderMode] ?? [];
  const full = Array.from(new Set([...baseNegatives, ...drift, ...mustNot, ...modeBans]));
  return full.join(", ");
}

/**
 * Erreur levée quand un `PanelRenderSpec` produit un prompt positif qui
 * contient des tokens explicitement interdits par son `renderMode`.
 * Aucun fallback silencieux : on fail loud pour forcer un rework amont.
 */
export class ContradictoryPanelPromptError extends Error {
  readonly renderMode: PanelRenderSpec["renderMode"];
  readonly violations: string[];
  constructor(renderMode: PanelRenderSpec["renderMode"], violations: string[]) {
    super(
      `Contradictory panel prompt for renderMode=${renderMode}: forbidden tokens present: ${violations.join(", ")}`,
    );
    this.name = "ContradictoryPanelPromptError";
    this.renderMode = renderMode;
    this.violations = violations;
  }
}

/**
 * Retourne la liste des tokens interdits présents dans le prompt positif.
 * Vide si OK. La détection est case-insensitive et ignore la ponctuation
 * immédiatement adjacente.
 */
export function detectContradictoryTokens(
  spec: PanelRenderSpec,
  positive: string,
): string[] {
  const bans = FORBIDDEN_BY_RENDER_MODE[spec.renderMode] ?? [];
  const haystack = positive.toLowerCase();
  const hits: string[] = [];
  for (const ban of bans) {
    const needle = ban.toLowerCase();
    if (haystack.includes(needle)) hits.push(ban);
  }
  return hits;
}

/**
 * COMMIT P7.C — interdiction du hard lock textuel sans refs.
 *
 * Le legacy injectait `Subject lock: [Miya], hard_lock` dans les prompts
 * pour "forcer" la cohérence du héros — mais sans refs visuelles, ça
 * n'est qu'une incantation textuelle. Résultat : le modèle ignore et
 * dérive. Pire : ça donne une fausse impression que le lock est
 * garanti.
 *
 * Maintenant : si `Subject lock` / `hard_lock` / `hard lock` apparaît
 * dans le positif ET que le spec n'a pas de `characterRefs` réelles,
 * on throw. Pas d'invocation magique sans refs.
 */
export class HardLockWithoutReferencesError extends Error {
  readonly panelId: string;
  readonly renderMode: PanelRenderSpec["renderMode"];
  constructor(panelId: string, renderMode: PanelRenderSpec["renderMode"]) {
    super(
      `hard_lock_without_references panel=${panelId} renderMode=${renderMode} — ` +
        `le prompt contient 'Subject lock' / 'hard_lock' mais aucune characterRef n'est attachée. ` +
        `Interdit (P7.C). Le lock doit être visuel (refs), pas textuel.`,
    );
    this.name = "HardLockWithoutReferencesError";
    this.panelId = panelId;
    this.renderMode = renderMode;
  }
}

const HARD_LOCK_TOKENS = [
  "subject lock",
  "hard_lock",
  "hard lock",
  "character lock: hard",
];

export function detectHardLockInvocationWithoutRefs(
  spec: PanelRenderSpec,
  positive: string,
): boolean {
  const hasRefs = (spec.imageReferences?.characterRefs?.length ?? 0) > 0;
  if (hasRefs) return false;
  const hay = positive.toLowerCase();
  return HARD_LOCK_TOKENS.some((t) => hay.includes(t));
}

/**
 * Build + assertion stricte. Utiliser sur le chemin premium v3 pour
 * refuser les specs qui produisent un prompt contradictoire (ex: un
 * insert_object avec "hero portrait" dans le subject/action blocks).
 */
export function buildMinimalPanelPromptStrict(
  spec: PanelRenderSpec,
): BuiltPromptResult {
  const built = buildMinimalPanelPrompt(spec);
  const violations = detectContradictoryTokens(spec, built.positive);
  if (violations.length > 0) {
    throw new ContradictoryPanelPromptError(spec.renderMode, violations);
  }
  // COMMIT P7.C — plus d'incantation textuelle de hard_lock sans refs.
  if (detectHardLockInvocationWithoutRefs(spec, built.positive)) {
    throw new HardLockWithoutReferencesError(spec.panelId, spec.renderMode);
  }
  return built;
}

function describeCharacter(c: PanelRenderVisibleCharacter): string {
  const role = c.role === "hero" ? "protagonist" : c.role;
  const pose = c.poseIntent ? `, pose: ${c.poseIntent}` : "";
  const expr = c.expressionIntent ? `, expression: ${c.expressionIntent}` : "";
  return `${c.name} (${role})${pose}${expr}`;
}

function buildDialogueTwoShotSubject(chars: PanelRenderVisibleCharacter[]): string {
  const names = listCharacterNames(chars, 2);
  if (names.length >= 2) {
    return `SUBJECT: two-character dialogue staging with ${names[0]} and ${names[1]}, balanced framing, neither character dominates the frame.`;
  }
  if (names.length === 1) {
    return `SUBJECT: dialogue beat centered on ${names[0]} with the speaking partner implied off-camera, no dominant solo hero portrait.`;
  }
  return `SUBJECT: dialogue staging between two implied characters, balanced framing, no dominant solo portrait.`;
}

function buildDialogueOverShoulderSubject(chars: PanelRenderVisibleCharacter[]): string {
  const names = listCharacterNames(chars, 2);
  if (names.length >= 2) {
    return `SUBJECT: over-the-shoulder conversation between ${names[0]} and ${names[1]}, readable speaker-listener geometry, no dominant solo portrait.`;
  }
  if (names.length === 1) {
    return `SUBJECT: over-the-shoulder dialogue framing on ${names[0]}, off-camera counterpart implied by the composition, no dominant solo portrait.`;
  }
  return `SUBJECT: over-the-shoulder dialogue geometry, implied speaker and listener, no dominant solo portrait.`;
}

function buildGroupTensionSubject(chars: PanelRenderVisibleCharacter[]): string {
  const names = listCharacterNames(chars, 3);
  if (names.length > 0) {
    return `SUBJECT: tense ensemble staging with ${names.join(", ")}, body language and spacing carry the stakes, no single portrait dominates the frame.`;
  }
  return `SUBJECT: tense ensemble staging, body language and spacing carry the stakes, no single portrait dominates the frame.`;
}

function buildAftermathDialogueSubject(chars: PanelRenderVisibleCharacter[]): string {
  const names = listCharacterNames(chars, 2);
  if (names.length > 0) {
    return `SUBJECT: post-event dialogue beat featuring ${names.join(" and ")}, grounded recovery moment with context still visible, no triumphant hero poster pose.`;
  }
  return `SUBJECT: post-event dialogue beat, grounded recovery moment with context still visible, no triumphant hero poster pose.`;
}

function listCharacterNames(chars: PanelRenderVisibleCharacter[], max: number): string[] {
  return chars.slice(0, max).map((c) => c.name);
}

function normalizePromptClause(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").replace(/[.]+$/g, "").trim();
}

function humanizeShot(s: PanelRenderSpec["shotType"]): string {
  switch (s) {
    case "wide":
      return "wide shot";
    case "medium":
      return "medium shot";
    case "closeup":
      return "closeup";
    case "extreme_closeup":
      return "extreme closeup";
    case "over_shoulder":
      return "over-the-shoulder";
  }
}

function humanizeAngle(a: PanelRenderSpec["cameraAngle"]): string {
  switch (a) {
    case "eye_level":
      return "eye-level angle";
    case "low":
      return "low angle";
    case "high":
      return "high angle";
    case "dutch":
      return "dutch angle";
    case "birds_eye":
      return "bird's eye view";
    case "worm":
      return "worm's eye view";
  }
}

function clampLength(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function padWithStyleHints(s: string, spec: PanelRenderSpec): string {
  const hints = [
    "consistent character design",
    "coherent environment with previous panels",
    "clean manga panel composition",
    "professional storyboard framing",
    `location continuity: ${spec.locationName}`,
  ];
  let out = s;
  for (const h of hints) {
    if (out.length >= MIN_LENGTH) break;
    out += `\nHINT: ${h}.`;
  }
  return out;
}
