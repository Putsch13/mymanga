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
   * Props `visual_world_contract` visibles (`mustBeVisible`) : exiger `propVisualDna`
   * aligné sur le blueprint (PR3).
   */
  strictPropVisualBinding?: boolean;
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
 * `visibleCharacterIds`, `speakerCharacterId`, lignes `dialogueLines[].characterId`,
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
  const strictChar = options?.strictCharacterDnaBinding === true;
  return blueprints.map((bp) => {
    const heroIdSet = new Set<string>();
    for (const id of bp.requiredCharacterIds ?? []) {
      if (typeof id === "string" && id.trim()) heroIdSet.add(id.trim());
    }
    for (const id of bp.mustShowCharacterIds ?? []) {
      if (typeof id === "string" && id.trim()) heroIdSet.add(id.trim());
    }
    for (const id of bp.requiredCharacters ?? []) {
      if (typeof id === "string" && id.trim()) heroIdSet.add(id.trim());
    }
    for (const id of bp.visibleCharacterIds ?? []) {
      if (typeof id === "string" && id.trim()) heroIdSet.add(id.trim());
    }
    const speakerChar = typeof bp.speakerCharacterId === "string" ? bp.speakerCharacterId.trim() : "";
    if (speakerChar) heroIdSet.add(speakerChar);
    for (const line of bp.dialogueLines ?? []) {
      const cid = typeof line.characterId === "string" ? line.characterId.trim() : "";
      if (cid) heroIdSet.add(cid);
    }
    const requiredHeroIds = [...heroIdSet];
    const speakerAnchorId =
      bp.dialogueCarrier === "speaker_visible" && bp.speakerAnchorCharacterId?.trim()
        ? bp.speakerAnchorCharacterId.trim()
        : null;
    const idsRequiringCharacterDna = [
      ...new Set([...requiredHeroIds, ...(speakerAnchorId ? [speakerAnchorId] : [])]),
    ];
    const dna = characterDnaIds(bp);
    const missing: string[] = [];
    const warnings: string[] = [];
    const critical = bp.criticality === "critical" || bp.contractualCritical === true;

    for (const id of idsRequiringCharacterDna) {
      if (!dna.has(id)) missing.push(`character_visual_dna_missing:${id}`);
    }

    const npcNeed = bp.requiredNpcCount ?? 0;
    const npcHave = bp.npcVisualDna?.length ?? 0;
    const npcDnaInsufficient = npcNeed > 0 && npcHave < npcNeed;
    if (npcDnaInsufficient && (strictChar || critical)) {
      missing.push(`npc_visual_dna_insufficient:need_${npcNeed}_have_${npcHave}`);
    } else if (npcDnaInsufficient) {
      warnings.push(`npc_visual_dna: need_at_least_${npcNeed}_entries_have_${npcHave}`);
    }

    const loc = bp.requiredLocationSignals ?? [];
    const establishingLike =
      bp.mangaPanelFunction === "establishing"
      || bp.cutawayType === "environment_establishing"
      || bp.cutawayType === "environment"
      || bp.subjectFocus === "environment";
    const missingEnvironmentDna =
      !bp.environmentVisualDna
      && (loc.length > 0 || establishingLike);

    const propIdsNeedingVisual = (bp.requiredProps ?? []).filter(
      (p) => p.source === "visual_world_contract" && p.mustBeVisible === true,
    );
    const propVisualById = new Set((bp.propVisualDna ?? []).map((p) => p.id));
    for (const p of propIdsNeedingVisual) {
      if (!propVisualById.has(p.id)) {
        missing.push(`prop_visual_dna_missing:${p.id}`);
      }
    }

    if (missingEnvironmentDna && loc.length > 0) {
      warnings.push("environment_visual_dna_missing_for_location_signals");
    } else if (missingEnvironmentDna && establishingLike) {
      warnings.push("environment_visual_dna_missing_for_establishing_panel");
    }

    const ent = bp.requiredEntityIds ?? [];
    if (ent.length > 0) {
      warnings.push(
        `required_entity_ids:${ent.length} — vérifier injection registre / prompt (non bloquant ici)`,
      );
    }

    const missingCharacterDna = missing.filter((reason) =>
      reason.startsWith("character_visual_dna_missing:"),
    );
    const missingPropVisualDna = missing.filter((reason) => reason.startsWith("prop_visual_dna_missing:"));
    const missingSpeakerAnchorDna =
      bp.dialogueCarrier === "speaker_visible"
      && Boolean(speakerAnchorId)
      && !dna.has(speakerAnchorId!);
    const npcDnaMissingLine = missing.some((m) => m.startsWith("npc_visual_dna_insufficient:"));
    // Environment DNA ET prop DNA sont des ENRICHISSEMENTS visuels, pas des
    // prérequis structurels. Le pipeline rend le prop depuis son nom canonique +
    // la description du beat. Bloquer la génération là-dessus est trop strict
    // pour le flux conversationnel (les props auto-détectés n'ont pas toujours
    // de DNA). On garde l'info dans `missing` mais en NON-bloquant (warning).
    if (missingPropVisualDna.length > 0) {
      warnings.push(`prop_visual_dna_missing:${missingPropVisualDna.length}_props`);
    }
    const blocking =
      (critical && missingCharacterDna.length > 0)
      || missingSpeakerAnchorDna
      || (strictChar && missingCharacterDna.length > 0)
      || npcDnaMissingLine;

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

export type CharacterCanonPackCheck = {
  characterId: string;
  roleType?: string | null;
  hasCanonPack: boolean;
  canonPackCompleteness: number;
};

/**
 * Premium: verify that hero / deuteragonist characters meet the minimum CanonPack
 * **score** (same formula as the studio %). Blocking uses `canonPackCompleteness`
 * only — not `hasCanonPack`, so a perso sans ligne `CharacterCanonPack` mais avec
 * champs rempli (score ≥ seuil) passe le launch.
 */
export function canonPackPreflightBlockingReasons(
  characters: CharacterCanonPackCheck[],
  options?: { minCompleteness?: number },
): string[] {
  const threshold = options?.minCompleteness ?? 0.5;
  const heroRoles = new Set(["hero", "protagonist", "main_character", "deuteragonist", "héros", "protagoniste"]);
  const blockers: string[] = [];

  for (const c of characters) {
    const role = (c.roleType ?? "").toLowerCase();
    const isMainCast = heroRoles.has(role);
    if (!isMainCast) continue;
    if (c.canonPackCompleteness < threshold) {
      blockers.push(`canon_pack_incomplete:${c.characterId}`);
    }
  }

  return blockers;
}

export function continuityPreflightBlockingReasons(
  preflights: PanelContinuityPreflight[],
): string[] {
  return preflights.filter((p) => p.blocking).map((p) => {
    if (
      p.anchorSpeakerCharacterId
      && p.missing.includes(`character_visual_dna_missing:${p.anchorSpeakerCharacterId}`)
    ) {
      return `${p.panelId}:speaker_visible_missing_character_visual_dna:${p.anchorSpeakerCharacterId}`;
    }
    const propMissing = p.missing.filter((m) => m.startsWith("prop_visual_dna_missing:"));
    if (propMissing.length > 0) {
      const ids = propMissing.map((m) => m.slice("prop_visual_dna_missing:".length));
      return `${p.panelId}:critical_panel_missing_prop_visual_dna:${ids.join(",")}`;
    }
    const npcInsufficient = p.missing.find((m) => m.startsWith("npc_visual_dna_insufficient:"));
    if (npcInsufficient) {
      return `${p.panelId}:${npcInsufficient}`;
    }
    const missingIds = p.missing
      .filter((m) => m.startsWith("character_visual_dna_missing:"))
      .map((m) => m.slice("character_visual_dna_missing:".length));
    if (missingIds.length > 0) {
      return `${p.panelId}:critical_panel_missing_character_visual_dna:${missingIds.join(",")}`;
    }
    if (p.missingEnvironmentDna) {
      return `${p.panelId}:missing_environment_visual_dna`;
    }
    return `${p.panelId}:critical_panel_missing_character_visual_dna`;
  });
}
