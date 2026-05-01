/**
 * Inférence du propriétaire d'un prop (héros / ennemi / garde / ambiance).
 * Extrait de prop-inference-engine pour tests et réutilisation.
 */

import type { PropNarrativeRole, PropOwnerCategory, PropVisibilityMode } from "@manga-ai-studio/core";
import { requiresVisibility } from "./prop-evidence-validator";

export type PropOwnerTemplateShape = {
  canonicalName: string;
  category: string;
  narrativeRole: PropNarrativeRole;
  defaultVisibilityMode: PropVisibilityMode;
};

export type PropOwnerInferenceContext = {
  universeType?: string | null;
  heroCharacterId?: string | null;
};

const GUARD_ENEMY_PATTERNS = [
  /garde[s]?\b/i,
  /guard[s]?\b/i,
  /soldat[s]?\b/i,
  /soldier[s]?\b/i,
  /sentinelle[s]?\b/i,
  /sentinel[s]?\b/i,
  /patrouille[s]?\b/i,
  /patrol[s]?\b/i,
  /ennemi[s]?\b/i,
  /enem(y|ies)\b/i,
  /adversaire[s]?\b/i,
  /mercenaire[s]?\b/i,
  /mercenary|mercenaries/i,
  /troupe[s]?\b/i,
  /troop[s]?\b/i,
  /armée\b/i,
  /army\b/i,
  /milice\b/i,
  /militia\b/i,
  /police\b/i,
  /vigile[s]?\b/i,
  /security guard/i,
  /agent de sécurité/i,
  /chasseur[s]?\b/i,
  /hunter[s]?\b/i,
];

const HERO_ACTION_PATTERNS = [
  /(?:le |la |l')?(?:héros?|hero|protagonist|main character)\s+(?:utilise|uses|tient|holds|brandit|wields|tire|shoots|vise|aims|dégaine|draws)/i,
  /(?:son|sa|leur)\s+(?:arme|weapon|pistolet|gun|épée|sword|lame|blade)/i,
];

const ENEMY_ACTION_PATTERNS = [
  /(?:l')?(?:ennemi|enemy|adversaire|adversary|attaquant|attacker)\s+(?:utilise|uses|tient|holds|brandit|wields|tire|shoots|vise|aims|dégaine|draws)/i,
  /(?:les |l')?(?:ennemis|enemies|adversaires|adversaries|attaquants|attackers)\s+/i,
];

/**
 * @param isMilitaryEquipment — dérivé du catalogue militaire côté moteur d'inférence (évite import circulaire).
 */
export function inferPropOwnerCategory(
  template: PropOwnerTemplateShape,
  text: string,
  context: PropOwnerInferenceContext,
  isMilitaryEquipment: boolean,
): PropOwnerCategory {
  const lower = text.toLowerCase();
  const isWeapon = template.category === "weapon" || template.narrativeRole === "threat";

  if (ENEMY_ACTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return "enemy";
  }

  if (HERO_ACTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return "hero";
  }

  if ((isWeapon || isMilitaryEquipment) && GUARD_ENEMY_PATTERNS.some((pattern) => pattern.test(text))) {
    if (/ennemi|enemy|adversaire|adversary|attaquant|attacker/i.test(lower)) {
      return "enemy";
    }
    return "guard";
  }

  if (isWeapon && context.universeType === "military") {
    return "guard";
  }

  if (template.narrativeRole === "worldbuilding" && template.defaultVisibilityMode === "background_support") {
    return "ambient";
  }

  if (context.heroCharacterId && requiresVisibility(text)) {
    return "hero";
  }

  return "unassigned";
}

/**
 * Rattache un prop (ex. `VisualWorldPropDna`) à un personnage ou un lieu du roster.
 * Complète les IDs déjà présents sur le prop avec un score de confiance.
 */
export function resolvePropOwner(input: {
  prop: unknown;
  characters: Array<Record<string, unknown>>;
  locations?: Array<Record<string, unknown>>;
}): {
  ownerCharacterId?: string;
  locationId?: string;
  confidence: number;
} {
  const p = input.prop as Record<string, unknown> | null;
  if (!p || typeof p !== "object") {
    return { confidence: 0 };
  }
  const oc = typeof p.ownerCharacterId === "string" && p.ownerCharacterId.trim() ? p.ownerCharacterId.trim() : undefined;
  const lid = typeof p.locationId === "string" && p.locationId.trim() ? p.locationId.trim() : undefined;

  const charIds = new Set<string>();
  for (const c of input.characters) {
    const id = typeof c.id === "string" ? c.id : typeof c.characterId === "string" ? c.characterId : "";
    if (id) charIds.add(id);
  }
  const locIds = new Set<string>();
  for (const l of input.locations ?? []) {
    const id = typeof l.id === "string" ? l.id : "";
    if (id) locIds.add(id);
  }

  if (oc) {
    const known = charIds.has(oc);
    return { ownerCharacterId: oc, confidence: known ? 0.95 : 0.55 };
  }
  if (lid) {
    const known = locIds.has(lid);
    return { locationId: lid, confidence: known ? 0.9 : 0.5 };
  }
  return { confidence: 0.25 };
}
