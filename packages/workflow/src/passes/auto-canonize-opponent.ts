/**
 * Auto-canonisation d'opposants pour les beats de conflit sans entité résolue.
 */

import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import type {
  VisualEntity,
  VisualEntityConsistency,
  VisualEntityCreatedFrom,
  VisualEntityRole,
  VisualEntityScale,
  VisualEntityVisualDna,
} from "./visual-entity-registry";
import { pickRequiredOpponentForBeat } from "./visual-entity-registry";
import { blueprintTextBlob } from "./premium-manga-cutaway";

const SUSPENSE_ONLY_PATTERNS = [
  /\b(suspense|tension|foreshadow|ambient|atmospheric)\b/i,
  /\b(menace\s+indirecte|indirect\s+threat|approaching\s+danger)\b/i,
  /\b(shadow\s+looms|darkness\s+spreads|something\s+watches)\b/i,
];

const REQUIRES_RESOLVED_OPPONENT_PATTERNS = [
  /\b(enemy|ennemi|opponent|adversary|antagonist)\b/i,
  /\b(attack|attaque|strikes?|frapp|charge)\b/i,
  /\b(combat|fight|battle|affrontement|duel)\b/i,
  /\b(confront|face[sd]?\s+(the|l[ea]))\b/i,
  /\b(visible\s+threat|clear\s+enemy|opponent\s+reveal)\b/i,
];

/**
 * Retourne `true` si le beat exige un opposant résolu et visible.
 * Retourne `false` pour un beat de suspense / menace indirecte où aucun
 * adversaire n'est montré concrètement.
 */
export function beatRequiresResolvedOpponent(beatPanels: PanelBlueprintPremium[]): boolean {
  const blobs = beatPanels.map((bp) => blueprintTextBlob(bp));
  const combined = blobs.join(" ");

  for (const pat of SUSPENSE_ONLY_PATTERNS) {
    if (pat.test(combined)) {
      const hasExplicitEnemy = beatPanels.some((bp) => bp.mustShowEnemy);
      if (!hasExplicitEnemy) {
        return false;
      }
    }
  }

  for (const pat of REQUIRES_RESOLVED_OPPONENT_PATTERNS) {
    if (pat.test(combined)) return true;
  }

  return beatPanels.some((bp) => bp.mustShowEnemy);
}

function inferOpponentKindFromBeat(beatPanels: PanelBlueprintPremium[]): string | null {
  const blobs = beatPanels.map((bp) => blueprintTextBlob(bp)).join(" ");

  if (/\b(soldier|soldiers|garde?s?|army|armée|troops?)\b/i.test(blobs)) return "hostile soldiers";
  if (/\b(robot|android|machine|mecha|drone)\b/i.test(blobs)) return "hostile machine";
  if (/\b(creature|beast|monster|monstre|bête)\b/i.test(blobs)) return "threatening creature";
  if (/\b(demon|démon|spirit|spectre|wraith)\b/i.test(blobs)) return "malevolent spirit";
  if (/\b(assassin|ninja|merc|mercenary)\b/i.test(blobs)) return "assassin";
  if (/\b(bandit|thief|brigand|voleur)\b/i.test(blobs)) return "bandit";
  if (/\b(villain|vilain|méchant)\b/i.test(blobs)) return "villain";
  if (/\b(boss|seigneur|lord|master)\b/i.test(blobs)) return "boss antagonist";
  if (/\b(rival|opponent)\b/i.test(blobs)) return "rival";

  return null;
}

function inferOpponentNameFromBeat(args: {
  beatId: string;
  beatPanels: PanelBlueprintPremium[];
}): string | null {
  const blobs = args.beatPanels.map((bp) => blueprintTextBlob(bp)).join(" ");

  const namedMatch = blobs.match(/\b([A-Z][a-z]{2,})(?:\s+[A-Z][a-z]+)?\s+(?:attacks?|menace|confront|charge|strikes?)/i);
  if (namedMatch) {
    return namedMatch[1]!;
  }

  const kind = inferOpponentKindFromBeat(args.beatPanels);
  if (kind) {
    return `${kind} (${args.beatId})`;
  }

  return `Unknown threat (${args.beatId})`;
}

export interface EnsureOpponentEntityArgs {
  beatId: string;
  beatPanels: PanelBlueprintPremium[];
  visualEntities: VisualEntity[];
  projectId: string;
}

export interface EnsureOpponentEntityResult {
  entity: VisualEntity | null;
  autoCreated: boolean;
}

/**
 * Retourne un opposant existant ou en crée un auto-canonisé si le beat l'exige.
 * L'entité auto-créée est ajoutée dans `visualEntities` (mutation).
 */
export function ensureOpponentEntityForBeat(args: EnsureOpponentEntityArgs): EnsureOpponentEntityResult {
  const existing = pickRequiredOpponentForBeat({
    beatId: args.beatId,
    beatPanels: args.beatPanels,
    visualEntities: args.visualEntities,
  });

  if (existing) {
    return { entity: existing, autoCreated: false };
  }

  const inferredName = inferOpponentNameFromBeat({
    beatId: args.beatId,
    beatPanels: args.beatPanels,
  });

  if (!inferredName) {
    return { entity: null, autoCreated: false };
  }

  const inferredKind = inferOpponentKindFromBeat(args.beatPanels) ?? "unknown opponent";

  const autoEntity: VisualEntity = {
    id: `auto_opponent_${args.beatId}`,
    projectId: args.projectId,
    name: inferredName,
    aliases: [inferredName],
    userDefinedKind: inferredKind,
    semanticTags: ["opponent", "auto-canonized", "chapter-threat"],
    role: "antagonist" as VisualEntityRole,
    scale: "individual" as VisualEntityScale,
    isOpponent: true,
    isSentient: true,
    isNamed: false,
    isFaction: false,
    canAppearAsGroup: inferredKind.includes("soldiers") || inferredKind.includes("bandits"),
    groupCountHint: undefined,
    canonicalDescription: `Auto-canonized opponent inferred from ${args.beatId}. Preserve this design consistently after first appearance.`,
    visualDna: {
      silhouette: "threatening manga antagonist silhouette",
      colors: ["dark", "high contrast"],
      props: [],
      symbols: [],
      forbiddenDrift: [
        "random redesign",
        "cute chibi design",
        "photorealistic style",
        "modern unrelated outfit",
      ],
    } as VisualEntityVisualDna,
    referenceImageUrls: [],
    consistencyLevel: "medium" as VisualEntityConsistency,
    createdFrom: "auto_canonized" as VisualEntityCreatedFrom,
    beatIds: [args.beatId],
  };

  args.visualEntities.push(autoEntity);

  console.info(
    `[pipeline:v3:entity-canon] auto_created=1 entity=${autoEntity.id} kind=${inferredKind} policy=CANONIZE_FROM_FIRST_APPEARANCE`,
  );

  return { entity: autoEntity, autoCreated: true };
}
