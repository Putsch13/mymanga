/**
 * P1.3 — Préflight continuité / binding visuel par panel (avant rendu image).
 * Ne remplace pas la QA structurelle ; signale les trous de DNA / décor sur panels critiques.
 */

import type { PanelBlueprintPremium } from "../types/narrative-facts";

export type PanelContinuityPreflight = {
  panelId: string;
  requiredHeroIds: string[];
  requiredNpcIds: string[];
  requiredEntityIds: string[];
  requiredLocationSignals: string[];
  requiredProps: string[];
  missing: string[];
  warnings: string[];
  blocking: boolean;
};

function characterDnaIds(bp: PanelBlueprintPremium): Set<string> {
  return new Set((bp.characterVisualDna ?? []).map((d) => d.characterId));
}

/**
 * Un panel est **bloquant** en premium uniquement s’il est critique (ou contractuellement critique),
 * impose des personnages visibles, et n’a aucune entrée `characterVisualDna` (sous-spécifié).
 */
export function computePanelContinuityPreflights(
  blueprints: PanelBlueprintPremium[],
): PanelContinuityPreflight[] {
  return blueprints.map((bp) => {
    const requiredHeroIds = [
      ...new Set([...(bp.requiredCharacterIds ?? []), ...(bp.mustShowCharacterIds ?? [])]),
    ];
    const dna = characterDnaIds(bp);
    const missing: string[] = [];
    const warnings: string[] = [];

    for (const id of requiredHeroIds) {
      if (!dna.has(id)) missing.push(`character_visual_dna_missing:${id}`);
    }

    const npcNeed = bp.requiredNpcCount ?? 0;
    const npcHave = bp.npcVisualDna?.length ?? 0;
    if (npcNeed > 0 && npcHave < npcNeed) {
      warnings.push(`npc_visual_dna: need_at_least_${npcNeed}_entries_have_${npcHave}`);
    }

    const loc = bp.requiredLocationSignals ?? [];
    if (loc.length > 0 && !bp.environmentVisualDna) {
      warnings.push("environment_visual_dna_missing_for_location_signals");
    }

    const ent = bp.requiredEntityIds ?? [];
    if (ent.length > 0) {
      warnings.push(
        `required_entity_ids:${ent.length} — vérifier injection registre / prompt (non bloquant ici)`,
      );
    }

    const critical = bp.criticality === "critical" || bp.contractualCritical === true;
    const blocking =
      critical
      && requiredHeroIds.length > 0
      && (!bp.characterVisualDna || bp.characterVisualDna.length === 0);

    return {
      panelId: bp.panelId,
      requiredHeroIds,
      requiredNpcIds: [],
      requiredEntityIds: ent,
      requiredLocationSignals: loc,
      requiredProps: (bp.requiredProps ?? []).map((p) => p.canonicalName),
      missing,
      warnings,
      blocking,
    };
  });
}

export function continuityPreflightBlockingReasons(
  preflights: PanelContinuityPreflight[],
): string[] {
  return preflights.filter((p) => p.blocking).map((p) => `${p.panelId}:critical_panel_without_character_visual_dna`);
}
