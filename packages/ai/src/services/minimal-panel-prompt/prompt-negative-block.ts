/**
 * prompt-negative-block.ts
 *
 * Bloc "negative" (interdictions) du prompt premium + détecteurs de
 * contradictions / négations / hard-locks invalides.
 *
 * Extrait de `minimal-panel-prompt-builder.ts` pour clarifier les
 * frontières entre :
 *   - composition positive (`buildMinimalPanelPrompt`)
 *   - composition négative + assertions strictes (ce fichier)
 *
 * Aucune nouvelle règle : c'est un déplacement à l'identique.
 */
import type { PanelRenderSpec } from "../../contracts/panel-render-spec";

/**
 * Tokens INTERDITS à inclure dans un prompt positif selon le `renderMode`
 * cible (cohérence panel/composition). Les valeurs ici NE sont pas
 * automatiquement ajoutées au negative — elles sont utilisées par
 * `detectContradictoryTokens` pour identifier les violations dans le
 * positif construit, et seulement les `mustNotShow` du contract sont
 * ajoutées au negative (les bans `FORBIDDEN_BY_RENDER_MODE` sont reportés
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
  vehicle_reveal: [
    "tight face",
    "hero portrait",
    "face filling frame",
    "hero only close-up",
    "empty street without vehicle",
    "no vehicle visible",
    "environment only",
  ],
  faction_reveal: [
    "single random passerby",
    "hero portrait filling frame",
    "no uniform cues",
    "generic crowd without emblems",
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
    spec.renderMode === "combat_aftermath" &&
    spec.constraints.mustShow.some((m) => entityObligationHints.test(m))
      ? (["characters absent from frame", "empty battlefield"] as const)
      : [];
  // SPRINT 6 — bloc négatif enrichi (audit v7).
  // Avant : 13 tokens essentiellement "anti-3D + anti-bulle". Insuffisant
  // contre les artefacts récurrents (mains à 6 doigts, doubles silhouettes,
  // typographie hallucinée, anatomie cassée, sceau Adobe Stock…).
  const baseNegatives = [
    // Famille modèle
    "3d render",
    "photorealistic",
    "octane render",
    "unreal engine",
    // Style à exclure
    "chibi",
    "deformed art style",
    "low quality",
    "blurry lineart",
    "noisy artifacts",
    "sketch unfinished",
    "amateur drawing",
    // Marquage / identité
    "watermark",
    "signature",
    "logo",
    "stock photo overlay",
    "shutterstock",
    "getty images",
    "adobe stock",
    // Texte (jamais dans l'image — le moteur de bulles fait le job)
    "text in image",
    "speech bubble",
    "caption",
    "subtitles",
    "labels on objects",
    "letters as image content",
    // Anatomie cassée
    "deformed hands",
    "extra fingers",
    "extra limbs",
    "missing fingers",
    "fused fingers",
    "twisted arms",
    "broken anatomy",
    "wrong proportions",
    "asymmetric eyes",
    "lazy eye",
    // Identité
    "duplicate face",
    "duplicate character",
    "two heroes side by side",
    "clone characters",
    // Compression / qualité
    "jpeg compression",
    "color banding",
    "moiré pattern",
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
