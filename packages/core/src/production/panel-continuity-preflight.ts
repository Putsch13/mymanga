/**
 * P1.3 — Préflight continuité / binding visuel par panel (avant rendu image).
 * Ne remplace pas la QA structurelle ; signale les trous de DNA / décor sur panels critiques.
 */

import type { PanelBlueprintPremium } from "../types/narrative-facts";

export type PanelContinuityPreflightOptions = {
  /**
   * Mode premium strict : tout panel avec `requiredLocationSignals` non vide
   * doit avoir `environmentVisualDna` (aligné hydrate VW + estimate/launch).
   * Par défaut : seuls les panels `critical` / `contractualCritical` bloquent sur décor absent.
   */
  strictEnvironmentLocationBinding?: boolean;
  /**
   * Mode premium strict : tout `requiredCharacterIds` ∪ `mustShowCharacterIds` ∪
   * `requiredCharacters` (alias legacy / merge canonique) ∪
   * locuteur `speaker_visible` doit avoir une entrée `characterVisualDna` (pas seulement
   * les panels `critical` / `contractualCritical`).
   * De plus : si `requiredNpcCount` > 0, le nombre d’entrées `npcVisualDna` doit être ≥ ce compte
   * (sinon blocage, aligné « pas de PNJ critique sans visual DNA »).
   */
  strictCharacterDnaBinding?: boolean;
};

export type PanelContinuityPreflight = {
  panelId: string;
  requiredHeroIds: string[];
  /** Locuteur ancré quand `dialogueCarrier === "speaker_visible"` — doit avoir une entrée DNA. */
  anchorSpeakerCharacterId: string | null;
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
 * Préflight continuité : DNA personnage pour les IDs requis + must-show + `requiredCharacters`,
 * locuteur ancré (`speaker_visible` + `speakerAnchorCharacterId`), décor
 * (`environmentVisualDna`) lorsque le beat impose des signaux lieu, et
 * en mode strict le **nombre** d’entrées `npcVisualDna` vs `requiredNpcCount`.
 * Bloque les panels critiques incomplets, et tout panel avec bulle locuteur
 * visible sans DNA pour l’ancre parlante.
 */
export function computePanelContinuityPreflights(
  blueprints: PanelBlueprintPremium[],
  options?: PanelContinuityPreflightOptions,
): PanelContinuityPreflight[] {
  const strictEnv = options?.strictEnvironmentLocationBinding === true;
  const strictChar = options?.strictCharacterDnaBinding === true;
  return blueprints.map((bp) => {
    const requiredHeroIds = [
      ...new Set([
        ...(bp.requiredCharacterIds ?? []),
        ...(bp.mustShowCharacterIds ?? []),
        ...(bp.requiredCharacters ?? []),
      ]),
    ];
    const speakerAnchorId =
      bp.dialogueCarrier === "speaker_visible" && bp.speakerAnchorCharacterId?.trim()
        ? bp.speakerAnchorCharacterId.trim()
        : null;
    const idsRequiringCharacterDna = [...new Set([...requiredHeroIds, ...(speakerAnchorId ? [speakerAnchorId] : [])])];
    const dna = characterDnaIds(bp);
    const missing: string[] = [];
    const warnings: string[] = [];

    for (const id of idsRequiringCharacterDna) {
      if (!dna.has(id)) missing.push(`character_visual_dna_missing:${id}`);
    }

    const npcNeed = bp.requiredNpcCount ?? 0;
    const npcHave = bp.npcVisualDna?.length ?? 0;
    const npcDnaInsufficient = npcNeed > 0 && npcHave < npcNeed;
    if (npcDnaInsufficient) {
      if (strictChar) {
        missing.push(`npc_visual_dna_insufficient:need_${npcNeed}_have_${npcHave}`);
      } else {
        warnings.push(`npc_visual_dna: need_at_least_${npcNeed}_entries_have_${npcHave}`);
      }
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
      idsRequiringCharacterDna.length > 0
      && idsRequiringCharacterDna.some((id) => !dna.has(id));
    const missingCharacterForCritical =
      idsRequiringCharacterDna.length > 0
      && (missingDnaForRequired || !bp.characterVisualDna || bp.characterVisualDna.length === 0);
    const missingSpeakerAnchorDna =
      bp.dialogueCarrier === "speaker_visible"
      && Boolean(speakerAnchorId)
      && !dna.has(speakerAnchorId!);
    const missingAnyRequiredCharacterDna =
      idsRequiringCharacterDna.length > 0
      && idsRequiringCharacterDna.some((id) => !dna.has(id));
    const strictNpcDnaGap = strictChar && npcDnaInsufficient;
    const blocking =
      (critical && (missingCharacterForCritical || missingEnvironmentDna))
      || missingSpeakerAnchorDna
      || (strictEnv && missingEnvironmentDna)
      || (strictChar && missingAnyRequiredCharacterDna)
      || strictNpcDnaGap;

    return {
      panelId: bp.panelId,
      requiredHeroIds,
      anchorSpeakerCharacterId: speakerAnchorId,
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
      return `${p.panelId}:missing_environment_visual_dna`;
    }
    if (
      p.anchorSpeakerCharacterId
      && p.missing.includes(`character_visual_dna_missing:${p.anchorSpeakerCharacterId}`)
    ) {
      return `${p.panelId}:speaker_visible_missing_character_visual_dna:${p.anchorSpeakerCharacterId}`;
    }
    const npcInsufficient = p.missing.find((m) => m.startsWith("npc_visual_dna_insufficient:"));
    if (npcInsufficient) {
      return `${p.panelId}:${npcInsufficient}`;
    }
    const missingIds = p.missing
      .filter((m) => m.startsWith("character_visual_dna_missing:"))
      .map((m) => m.slice("character_visual_dna_missing:".length));
    if (missingIds.length > 0) {
      return `${p.panelId}:missing_character_visual_dna:ids=${missingIds.join(",")}`;
    }
    return `${p.panelId}:missing_character_visual_dna`;
  });
}
