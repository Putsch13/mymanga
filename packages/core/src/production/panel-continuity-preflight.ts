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
  /** Beat / panel impose un décor explicite mais `environmentVisualDna` est absent. */
  missingEnvironmentDna: boolean;
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
    const missingEnvironmentDna = loc.length > 0 && !bp.environmentVisualDna;
    if (missingEnvironmentDna) {
      warnings.push("environment_visual_dna_missing_for_location_signals");
    }

    const ent = bp.requiredEntityIds ?? [];
    if (ent.length > 0) {
      warnings.push(
        `required_entity_ids:${ent.length} — vérifier injection registre / prompt (non bloquant ici)`,
      );
    }

    const critical = bp.criticality === "critical" || bp.contractualCritical === true;
    const missingDnaForRequired =
      requiredHeroIds.length > 0
      && requiredHeroIds.some((id) => !dna.has(id));
    const missingCharacterForCritical =
      requiredHeroIds.length > 0
      && (missingDnaForRequired || !bp.characterVisualDna || bp.characterVisualDna.length === 0);
    const blocking =
      critical
      && (missingCharacterForCritical || missingEnvironmentDna);

    return {
      panelId: bp.panelId,
      requiredHeroIds,
      requiredNpcIds: [],
      requiredEntityIds: ent,
      requiredLocationSignals: loc,
      requiredProps: (bp.requiredProps ?? []).map((p) => p.canonicalName),
      missing,
      warnings,
      missingEnvironmentDna,
      blocking,
    };
  });
}

export function continuityPreflightBlockingReasons(
  preflights: PanelContinuityPreflight[],
): string[] {
  return preflights.filter((p) => p.blocking).map((p) => {
    if (p.missingEnvironmentDna) {
      return `${p.panelId}:critical_panel_missing_environment_visual_dna`;
    }
    const missingIds = p.missing
      .filter((m) => m.startsWith("character_visual_dna_missing:"))
      .map((m) => m.slice("character_visual_dna_missing:".length));
    if (missingIds.length > 0) {
      return `${p.panelId}:critical_panel_without_character_visual_dna:ids=${missingIds.join(",")}`;
    }
    return `${p.panelId}:critical_panel_without_character_visual_dna`;
  });
}
