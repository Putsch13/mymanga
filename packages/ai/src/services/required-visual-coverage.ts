/**
 * required-visual-coverage — extraction déterministe des obligations
 * visuelles d'un chapitre à partir de son `StoryArc`.
 *
 * Pour chaque beat, on scanne :
 *   - `storyEvent` / `purpose` / `emotionalTurn` / `mustReveal` /
 *     `continuityEffects.itemsIntroduced`
 * et on détecte les entités visuelles qui DOIVENT apparaître dans au
 * moins un panel dédié (pas un simple background) :
 *   - créatures / animaux fantastiques / monstres
 *   - silhouettes / ombres / observateurs
 *   - objets clefs (moniteur, scellé, arme, manuscrit, talisman, ...)
 *   - ennemis nommés / menaces humaines
 *
 * La détection est volontairement verbatim / heuristique FR+EN : ce
 * n'est PAS un agent LLM. Chaque règle se déclenche sur un pattern
 * regex normalisé, et produit une entrée `RequiredVisualCoverage` avec
 * le beatId source et un `expectedRenderMode` / `expectedSubjectFocus`
 * strict. C'est le validator qui échoue si le storyboard ne couvre pas.
 *
 * Règle produit (directive H12) :
 *   "Si un beat introduit un élément visuel important et qu'aucun
 *    panel ne le couvre : launch refusée."
 */

import type { StoryArc, StoryBeat } from "../contracts/story-arc";
import type {
  StoryboardRenderMode,
  StoryboardSubjectFocus,
} from "../contracts/storyboard-plan";

export type RequiredVisualCoverageEntityType =
  | "character"
  | "creature"
  | "prop"
  | "enemy"
  | "threat_silhouette"
  | "surveillance"
  | "location";

export interface RequiredVisualCoverage {
  /** Libellé normalisé (minuscule, sans accent) */
  entity: string;
  entityType: RequiredVisualCoverageEntityType;
  sourceBeatId: string;
  requiresDedicatedPanel: boolean;
  /**
   * Modes de rendu acceptables pour considérer l'obligation remplie.
   * Un panel qui n'est ni dans cette liste ni dans `acceptedSubjectFocuses`
   * NE couvre PAS cette obligation.
   */
  acceptedRenderModes: StoryboardRenderMode[];
  acceptedSubjectFocuses: StoryboardSubjectFocus[];
  /**
   * Tokens à matcher dans `panel.mustShow` ou `panel.actionLine`
   * (case-insensitive) pour considérer que le panel cible bien l'entité.
   * Si vide, la présence d'un `renderMode` / `subjectFocus` dans la
   * liste acceptée suffit.
   */
  tokensHint: string[];
  /** Peuplé par le validator : panelIds qui remplissent l'obligation. */
  fulfilledByPanelIds: string[];
}

interface ExtractionRule {
  pattern: RegExp;
  entityType: RequiredVisualCoverageEntityType;
  acceptedRenderModes: StoryboardRenderMode[];
  acceptedSubjectFocuses: StoryboardSubjectFocus[];
  tokensHint: string[];
  describeEntity: (match: string) => string;
}

/**
 * Règles d'extraction. L'ordre importe : les règles plus spécifiques
 * (créature nommée, objet clef nommé) passent avant les règles génériques
 * (silhouette, ombre). Chaque match crée UNE coverage obligatoire.
 */
const RULES: ExtractionRule[] = [
  {
    pattern:
      /\b(animaux fantastiques|creatures fantastiques|cr[eé]ature[s]?|monstre[s]?|b[eê]te[s]?|fantastic creatures?|monsters?|beasts?)\b/i,
    entityType: "creature",
    acceptedRenderModes: ["creature_reveal", "group_tension"],
    acceptedSubjectFocuses: ["creature", "group"],
    tokensHint: ["creature", "créature", "monster", "monstre"],
    describeEntity: (m) => m.toLowerCase(),
  },
  {
    pattern:
      /\b(silhouette[s]?|ombre[s]? menace|shadow figure|observer|observateur|watch(?:er|ing))\b/i,
    entityType: "threat_silhouette",
    acceptedRenderModes: ["threat_silhouette", "surveillance_reveal"],
    acceptedSubjectFocuses: ["threat", "environment"],
    tokensHint: ["silhouette", "ombre", "shadow"],
    describeEntity: (m) => m.toLowerCase(),
  },
  {
    pattern:
      /\b(moniteur[s]? de surveillance|camera[s]? de surveillance|surveillance monitor[s]?|security camera[s]?|CCTV)\b/i,
    entityType: "surveillance",
    acceptedRenderModes: ["surveillance_reveal", "insert_object"],
    acceptedSubjectFocuses: ["environment", "prop"],
    tokensHint: ["monitor", "camera", "surveillance", "moniteur"],
    describeEntity: () => "surveillance_monitor",
  },
  {
    pattern:
      /\b(manuscrit|parchemin|grimoire|rune scroll|artefact|talisman|sceau|key item|objet cl[eé])\b/i,
    entityType: "prop",
    acceptedRenderModes: ["insert_object"],
    acceptedSubjectFocuses: ["prop"],
    tokensHint: ["artefact", "manuscrit", "scroll", "talisman", "sceau"],
    describeEntity: (m) => m.toLowerCase(),
  },
  {
    pattern: /\b(ennemi[s]?|adversaire[s]?|antagoniste[s]?|enemy|enemies|antagonist[s]?)\b/i,
    entityType: "enemy",
    acceptedRenderModes: ["enemy_reveal", "enemy_closeup", "combat_exchange"],
    acceptedSubjectFocuses: ["enemy"],
    tokensHint: ["enemy", "ennemi", "antagoniste"],
    describeEntity: (m) => m.toLowerCase(),
  },
];

function normalizeKey(entityType: string, label: string): string {
  return `${entityType}:${label.toLowerCase().trim()}`;
}

function collectTextSources(beat: StoryBeat): string {
  return [
    beat.storyEvent ?? "",
    beat.purpose ?? "",
    beat.emotionalTurn ?? "",
    ...(beat.mustReveal ?? []),
    ...(beat.continuityEffects?.itemsIntroduced ?? []),
  ].join(" | ");
}

/**
 * Extrait les obligations visuelles d'un StoryArc.
 *
 * Déterministe : même input → même output (utile pour des tests
 * unitaires stricts).
 */
export function extractRequiredVisualCoverage(
  storyArc: StoryArc,
): RequiredVisualCoverage[] {
  const out = new Map<string, RequiredVisualCoverage>();
  for (const beat of storyArc.beats ?? []) {
    const text = collectTextSources(beat);
    if (!text.trim()) continue;
    for (const rule of RULES) {
      const match = rule.pattern.exec(text);
      if (!match) continue;
      const label = rule.describeEntity(match[0] ?? "");
      const key = normalizeKey(rule.entityType, `${beat.beatId}|${label}`);
      if (out.has(key)) continue;
      out.set(key, {
        entity: label,
        entityType: rule.entityType,
        sourceBeatId: beat.beatId,
        requiresDedicatedPanel: true,
        acceptedRenderModes: [...rule.acceptedRenderModes],
        acceptedSubjectFocuses: [...rule.acceptedSubjectFocuses],
        tokensHint: [...rule.tokensHint],
        fulfilledByPanelIds: [],
      });
    }
  }
  return Array.from(out.values());
}
