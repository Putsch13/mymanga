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
  PanelRenderCharacterVisualDna,
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

/** Plafonds pour le suffixe `environmentDNA` dans le bloc ENVIRONMENT (prompt court). */
const ENV_DNA_CAPS = {
  descriptionChars: 200,
  visualAnchors: 3,
  /** Voir `LocationVisualDna.architecture` / hints persistés sur décor. */
  architecture: 3,
  atmosphere: 2,
  lighting: 2,
  recurringProps: 3,
  negativeConstraints: 2,
  totalChars: 520,
} as const;

function dnaStringList(value: unknown, max: number): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const v of value) {
      if (typeof v !== "string") continue;
      const s = normalizePromptClause(v);
      if (s) out.push(s);
      if (out.length >= max) break;
    }
    return out;
  }
  if (typeof value === "string") {
    const s = normalizePromptClause(value);
    return s ? [s.slice(0, 240)] : [];
  }
  return [];
}

function firstDnaStringList(
  dna: Record<string, unknown>,
  keys: readonly string[],
  max: number,
): string[] {
  for (const k of keys) {
    const list = dnaStringList(dna[k], max);
    if (list.length > 0) return list;
  }
  return [];
}

/**
 * Suffixe décor contrôlé depuis `spec.environmentDNA` (clés camelCase ou snake_case).
 * Inclut architecture / atmosphère issus du monde visuel ou du canon lieu, avec plafonds
 * (aligné roadmap : pas d’explosion de longueur prompt).
 */
export function formatEnvironmentDnaForPrompt(
  dna: Record<string, unknown> | null | undefined,
): string {
  if (!dna || typeof dna !== "object") return "";
  const parts: string[] = [];
  const desc =
    typeof dna.description === "string"
      ? normalizePromptClause(dna.description).slice(0, ENV_DNA_CAPS.descriptionChars)
      : "";
  if (desc) parts.push(desc);

  const anchors = firstDnaStringList(
    dna,
    ["visualAnchors", "visual_anchors", "anchors"],
    ENV_DNA_CAPS.visualAnchors,
  );
  if (anchors.length) parts.push(`Anchors: ${anchors.join("; ")}.`);

  const architecture = firstDnaStringList(
    dna,
    ["architectureHints", "architecture", "permanentArchitecture", "architecture_hints"],
    ENV_DNA_CAPS.architecture,
  );
  if (architecture.length) parts.push(`Arch: ${architecture.join("; ")}.`);

  const atmosphere = firstDnaStringList(
    dna,
    ["atmosphere", "atmosphericNotes", "atmospheric_notes"],
    ENV_DNA_CAPS.atmosphere,
  );
  if (atmosphere.length) parts.push(`Atmos: ${atmosphere.join("; ")}.`);

  const lighting = firstDnaStringList(
    dna,
    ["lighting", "lightingNotes", "light", "lightingHints", "lighting_hints"],
    ENV_DNA_CAPS.lighting,
  );
  if (lighting.length) parts.push(`Light: ${lighting.join("; ")}.`);

  const props = firstDnaStringList(
    dna,
    ["recurringProps", "recurring_props", "props", "propAnchors", "prop_anchors"],
    ENV_DNA_CAPS.recurringProps,
  );
  if (props.length) parts.push(`Props: ${props.join("; ")}.`);

  const negs = firstDnaStringList(
    dna,
    [
      "negativeConstraints",
      "negative_constraints",
      "negatives",
      "avoid",
      "forbiddenDrift",
      "forbidden_drift",
    ],
    ENV_DNA_CAPS.negativeConstraints,
  );
  if (negs.length) parts.push(`Avoid: ${negs.join("; ")}.`);

  const joined = parts.join(" ").trim();
  if (!joined) return "";
  return joined.length > ENV_DNA_CAPS.totalChars ? joined.slice(0, ENV_DNA_CAPS.totalChars) : joined;
}

/** Entités monde (créature / véhicule / faction) en tête pour ne pas les perdre derrière des PNJ crowd. */
const NPC_PROMPT_MAX = 3;
const NPC_MARKER_MAX_PER_NPC = 2;
const NPC_VISUAL_PROMPT_CHARS = 300;

const WORLD_PROP_PROMPT_MAX = 4;
const WORLD_PROP_DESC_CHARS = 100;
const WORLD_PROP_TOTAL_CHARS = 200;

/**
 * Props monde / beat (`VisualWorldPropDna` / `RequiredProp` mappés).
 */
export function formatWorldPropsVisualDnaForPrompt(spec: PanelRenderSpec): string {
  const list = spec.propVisualDna ?? spec.worldPropsVisualDna;
  if (!Array.isArray(list) || list.length === 0) return "";
  const chunks: string[] = [];
  for (const p of list.slice(0, WORLD_PROP_PROMPT_MAX)) {
    const name = normalizePromptClause(p.canonicalName) || "object";
    const desc = normalizePromptClause(p.visualDescription).slice(0, WORLD_PROP_DESC_CHARS);
    const bit = desc && desc.toLowerCase() !== name.toLowerCase() ? `${name} (${desc})` : name;
    const policy = "visibilityPolicy" in p && p.visibilityPolicy ? String(p.visibilityPolicy) : "";
    const sym =
      "symbolicMeaning" in p && typeof p.symbolicMeaning === "string" && p.symbolicMeaning.trim().length > 0
        ? p.symbolicMeaning.trim().slice(0, 48)
        : "";
    const tail = [policy ? `vis:${policy}` : null, sym ? `sym:${sym}` : null].filter(Boolean).join(" ");
    chunks.push(tail ? `${bit} [${tail}]` : bit);
  }
  if (!chunks.length) return "";
  let s = `Key props: ${chunks.join(" | ")}.`;
  if (s.length > WORLD_PROP_TOTAL_CHARS) {
    s = `${s.slice(0, WORLD_PROP_TOTAL_CHARS - 1)}…`;
  }
  return s;
}

function npcWorldPresenceSortKey(category: string | null | undefined): number {
  const c = (category ?? "").trim().toLowerCase();
  if (c === "creature") return 0;
  if (c === "vehicle") return 1;
  if (c === "faction") return 2;
  return 3;
}

function worldEntityKindLabel(category: string | null | undefined): "Creature" | "Vehicle" | "Faction" | null {
  const c = (category ?? "").trim().toLowerCase();
  if (c === "creature") return "Creature";
  if (c === "vehicle") return "Vehicle";
  if (c === "faction") return "Faction";
  return null;
}

/**
 * Figures monde hors cast principal (`npcVisualDna`) : PNJ de groupe, créatures,
 * véhicules, factions (issus du VisualWorldContract, hydratation blueprint).
 * Texte court pour le bloc ENVIRONMENT ; plafonné. Les créatures / véhicules /
 * factions passent avant les PNJ crowd pour le budget caractères.
 */
export function formatNpcVisualDnaForPrompt(spec: PanelRenderSpec): string {
  const list = spec.npcVisualDna;
  if (!Array.isArray(list) || list.length === 0) return "";
  const sorted = [...list].sort(
    (a, b) => npcWorldPresenceSortKey(a.category) - npcWorldPresenceSortKey(b.category),
  );
  const chunks: string[] = [];
  for (const n of sorted.slice(0, NPC_PROMPT_MAX)) {
    const name =
      normalizePromptClause(n.displayName ?? "")
      || normalizePromptClause(String(n.continuityId ?? "").replace(/^npc[-_]?/i, ""))
      || "figure";
    const cat = normalizePromptClause(n.category ?? "");
    const markers = Array.isArray(n.visualMarkers)
      ? n.visualMarkers
          .map((m) => normalizePromptClause(String(m)))
          .filter(Boolean)
          .slice(0, NPC_MARKER_MAX_PER_NPC)
          .join(", ")
      : "";
    const tierBits = [
      n.threatLevel && n.category === "creature" ? `threat:${n.threatLevel}` : null,
      n.vehicleScale && n.category === "vehicle" ? `scale:${n.vehicleScale}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const kind = worldEntityKindLabel(n.category);
    let line: string;
    if (kind) {
      const tierSuffix = tierBits ? ` [${tierBits}]` : "";
      const core = markers ? `${name} (${markers})` : name;
      line = `${kind}: ${core}${tierSuffix}`;
    } else {
      const bits = [name, cat || null, markers || null].filter(Boolean) as string[];
      line = bits.join("; ");
    }
    if (line.trim()) chunks.push(line);
  }
  if (!chunks.length) return "";
  let s = `World presence: ${chunks.join(" | ")}.`;
  if (s.length > NPC_VISUAL_PROMPT_CHARS) {
    s = `${s.slice(0, NPC_VISUAL_PROMPT_CHARS - 1)}…`;
  }
  return s;
}

/** Suffixe décor : `environmentDNA` + props beat + présence monde (PNJ / créatures / véhicules / factions, PR6–PR7). */
function buildDecorDnaAndNpcSuffix(spec: PanelRenderSpec): string {
  const dnaRaw = formatEnvironmentDnaForPrompt(spec.environmentDNA);
  const propRaw = formatWorldPropsVisualDnaForPrompt(spec);
  const npcRaw = formatNpcVisualDnaForPrompt(spec);
  const parts: string[] = [];
  if (dnaRaw) parts.push(`DNA: ${dnaRaw}`);
  if (propRaw) parts.push(propRaw);
  if (npcRaw) parts.push(npcRaw);
  if (!parts.length) return "";
  return ` ${parts.join(" ")}`;
}

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
    return `SUBJECT: environment-first panel focused on place, atmosphere, and spatial context; any characters remain secondary.`;
  }
  if (spec.renderMode === "insert_object") {
    return `SUBJECT: isolated object insert, object fills frame, composition excludes people and faces.`;
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

export function buildPromptShotBlock(spec: PanelRenderSpec): string {
  const angle = humanizeAngle(spec.cameraAngle);
  const shot = humanizeShot(spec.shotType);
  return `SHOT: ${shot}, ${angle}, renderMode=${spec.renderMode}.`;
}

const MUST_SHOW_CAP_CRITICAL = 5;
const MUST_SHOW_CAP_DEFAULT = 3;
const RENDER_MODES_EXTRA_MUST_SHOW: ReadonlySet<PanelRenderSpec["renderMode"]> = new Set([
  "creature_reveal",
  "enemy_reveal",
  "hero_closeup",
  "reaction_closeup",
]);

export function buildPromptActionBlock(spec: PanelRenderSpec): string {
  const action = normalizePromptClause(spec.actionLine) || "static beat";
  const emotion = normalizePromptClause(spec.emotionLine);
  const dialogueIntent = normalizePromptClause(spec.dialogueIntent);
  const mustShowCap = RENDER_MODES_EXTRA_MUST_SHOW.has(spec.renderMode)
    ? MUST_SHOW_CAP_CRITICAL
    : MUST_SHOW_CAP_DEFAULT;
  const mustShow = spec.constraints.mustShow
    .map(normalizePromptClause)
    .filter(Boolean)
    .slice(0, mustShowCap);
  const parts = [`ACTION: ${action}.`];
  if (mustShow.length > 0) {
    parts.push(`Mandatory visible elements: ${mustShow.join("; ")}.`);
  }
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

export function buildPromptStyleBlock(spec: PanelRenderSpec): string {
  const s = spec.styleBible;
  const tones = s.toneKeywords.slice(0, 3).join(", ");
  const core = [
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
  const lora = formatLoraBindingsForPrompt(spec);
  return lora ? `${core} ${lora}` : core;
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
  character_focus: [
    "wide establishing shot",
    "environment only",
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
    "environment only",
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
    "empty room",
    "environment only",
    "hero only close-up",
    "no creature visible",
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
  const entityObligationHints = /creature|monster|beast|dragon|demon|enemy body|corpse|casualt/i;
  const extraAftermathBans =
    spec.renderMode === "combat_aftermath"
    && spec.constraints.mustShow.some((m) => entityObligationHints.test(m))
      ? (["characters absent from frame", "empty battlefield"] as const)
      : [];
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
  const full = Array.from(
    new Set([...baseNegatives, ...drift, ...mustNot, ...modeBans, ...extraAftermathBans]),
  );
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

/**
 * P0.5 — Tokens de négation problématiques dans le prompt positif.
 *
 * Ces patterns indiquent une intention de ne pas montrer quelque chose
 * d'une manière trop directe/contradictoire. Par exemple :
 *
 *   BAD: "wide view of the port, no hero portrait"
 *   GOOD: positivePrompt: "wide view of the port, environment focus"
 *         negativePrompt: "hero portrait, close-up face"
 *
 * NOTE: On tolère "no dominant solo portrait" dans les blocs SUBJECT
 * structurés (dialogue/group) car c'est une directive de style intentionnelle,
 * pas une négation contradictoire. Les patterns ci-dessous ciblent les
 * négations ambiguës hors contexte SUBJECT: structuré.
 */
const NEGATION_PATTERNS_IN_POSITIVE = [
  // "no hero" ou "no character" en début ou milieu de phrase (hors SUBJECT:)
  /(?<!SUBJECT:.{0,100})\bno\s+(?:hero|main\s+character)\s+(?:portrait|close-?up|in\s+frame)/i,
  // "without any characters/faces" — ambigu
  /\bwithout\s+any\s+(?:characters?|faces?|people)/i,
  // "avoid showing" suivi d'un sujet
  /\bavoid\s+showing\s+(?:hero|character|face|portrait)/i,
  // "not showing/featuring" explicitement
  /\bnot\s+(?:showing|featuring)\s+(?:hero|character|face)/i,
  // "excludes characters" hors contexte composition
  /(?<!composition\s+)\bexcludes?\s+(?:hero|main\s+character|protagonist)/i,
  // "no face visible" ou "no faces in shot"
  /\bno\s+(?:face|faces)\s+(?:visible|in\s+(?:shot|frame))/i,
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
 * P0.5 — Détecte les négations inappropriées dans le prompt positif.
 *
 * Un prompt positif ne doit JAMAIS contenir de négations comme :
 *   "no hero portrait", "without faces", "avoid characters"
 *
 * Ces éléments doivent être dans le negative prompt.
 * Retourne la liste des matches trouvés (vide si OK).
 */
export function detectNegationsInPositive(positive: string): string[] {
  const matches: string[] = [];
  for (const pattern of NEGATION_PATTERNS_IN_POSITIVE) {
    const match = positive.match(pattern);
    if (match) {
      matches.push(match[0]);
    }
  }
  return matches;
}

/**
 * P0.5 — Erreur levée quand le prompt positif contient des négations.
 */
export class NegationInPositivePromptError extends Error {
  readonly panelId: string;
  readonly renderMode: PanelRenderSpec["renderMode"];
  readonly negations: string[];
  constructor(
    panelId: string,
    renderMode: PanelRenderSpec["renderMode"],
    negations: string[],
  ) {
    super(
      `negation_in_positive_prompt panel=${panelId} renderMode=${renderMode} — ` +
        `le prompt positif contient des négations qui devraient être dans le negative: ${negations.join(", ")}. ` +
        `Réécrivez le prompt pour exprimer ce que vous VOULEZ, pas ce que vous ne voulez pas.`,
    );
    this.name = "NegationInPositivePromptError";
    this.panelId = panelId;
    this.renderMode = renderMode;
    this.negations = negations;
  }
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
  // P0.5 — détecter les négations dans le prompt positif
  const negations = detectNegationsInPositive(built.positive);
  if (negations.length > 0) {
    throw new NegationInPositivePromptError(spec.panelId, spec.renderMode, negations);
  }
  return built;
}

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
  const structureLine = compactCharacterVisualDnaForPrompt(dna ?? null);
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

function listCharacterNames(chars: PanelRenderVisibleCharacter[], max: number): string[] {
  return chars.slice(0, max).map((c) => c.name);
}

/**
 * P0 — Retourne les descriptions complètes avec visual DNA pour les prompts multi-personnages.
 */
function listCharacterDescriptions(chars: PanelRenderVisibleCharacter[], max: number): string[] {
  return chars.slice(0, max).map((c) => describeCharacterWithCanon(c));
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

/** PR4 — alias CTO : props visibles plafonnées (voir `WORLD_PROP_PROMPT_MAX`). */
export function compactPropDnaForPrompt(spec: PanelRenderSpec): string {
  return formatWorldPropsVisualDnaForPrompt(spec);
}

/** PR4 — alias CTO : groupes PNJ / entités monde plafonnés (`NPC_PROMPT_MAX`). */
export function compactNpcDnaForPrompt(spec: PanelRenderSpec): string {
  return formatNpcVisualDnaForPrompt(spec);
}

/** PR4 — alias CTO : décor compact (`ENV_DNA_CAPS`). */
export function compactEnvironmentDnaForPrompt(
  dna: Record<string, unknown> | null | undefined,
): string {
  return formatEnvironmentDnaForPrompt(dna);
}

/** PR4 — alias CTO : traits configurateur dans le budget `CHARACTER_CONFIGURATOR_PROMPT_MAX`. */
export function compactCharacterVisualDnaForPrompt(
  dna: PanelRenderCharacterVisualDna | null | undefined,
  maxChars?: number,
): string {
  return compactConfiguratorTraitsForPrompt(dna, maxChars);
}
