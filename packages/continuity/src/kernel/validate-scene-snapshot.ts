/**
 * P5.2 — Validation `SceneSnapshot` contre le `ContinuityKernel`.
 *
 * Extrait de `continuity-persistence-kernel.ts` :
 *   - `makeIssue` (factory locale d'erreurs)
 *   - `inferInventoryRegain` / `inferHealing` / `inferRelationshipShift`
 *     (heuristiques narratives sur le summaryText)
 *   - `validateSceneSnapshotAgainstKernel` (corps principal des règles)
 *
 * BUG-19 / BUG-18 corrections conservées intactes (cf. commentaires inline).
 */
import type {
  ContinuityIssue,
  ContinuityKernel,
  ContinuityValidationResult,
  EventLedgerEntry,
  SceneSnapshot,
} from "../types";
import {
  normalizeCharacterName,
  prohibitionIsViolated,
  textHasAny,
} from "./utils";
import { resolveCharacterIdByName } from "./delta-appliers";

function makeIssue(
  severity: ContinuityIssue["severity"],
  type: ContinuityIssue["type"],
  message: string,
  subjectId?: string | null,
): ContinuityIssue {
  return {
    severity,
    type,
    message,
    subjectId: subjectId ?? null,
    sceneId: null,
    autoRepairable: false,
  };
}

function inferInventoryRegain(summary: string) {
  return /(retrouve|récupère|recupere|ramasse|gagne|obtient|reprend)/i.test(summary)
    && !/(sans expliquer|sans montrer|sans justifier|sans raison)/i.test(summary);
}

function inferHealing(summary: string) {
  return /(soigne|guérit|guerit|bandage|repos|récupère|recupere)/i.test(summary);
}

// FIX-9 (MOD) — La détection initiale était trop restrictive : sur une
// histoire romantique (Lux et lui), chaque scène de tension affective
// déclenchait un faux warning "no relationship shift detected" parce
// que les verbes typiques (embrasse, rejette, déclar…) n'étaient pas
// listés. On élargit le set : romance, dispute, jalousie, rupture,
// déclaration, etc. — tout ce qui DÉPLACE concrètement le lien.
export function inferRelationshipShift(summary: string) {
  return /(pardonne|trahit|avoue|confesse|alliance|tr[êe]ve|promet|embrasse|rejette|repousse|r[ée]concilie|jalou|dispute|serment|rompt|rupture|d[ée]clar(?:e|ation)?|enlace|prend dans ses bras|lui tient la main|s'éloigne de lui|s'éloigne d'elle|fuit la relation)/i.test(summary);
}

export function validateSceneSnapshotAgainstKernel(input: {
  kernel: ContinuityKernel;
  sceneSnapshot: SceneSnapshot;
}): ContinuityValidationResult {
  const issues: ContinuityIssue[] = [];
  const warnings: string[] = [];
  const proposedEvents: EventLedgerEntry[] = [];
  const summaryText = `${input.sceneSnapshot.summary} ${input.sceneSnapshot.dramaticGoal ?? ""}`;

  for (const character of input.sceneSnapshot.characters) {
    const previous = input.kernel.characterStates.find(
      (state) => state.characterId === character.characterId,
    );
    if (!previous) continue;
    const structuredDelta = input.sceneSnapshot.structuredContinuity?.characterDeltas.find(
      (delta) =>
        normalizeCharacterName(delta.characterName)
        === normalizeCharacterName(character.identity.stableName ?? character.characterId),
    );

    // BUG-19 fix : on accumulait `objectsLost` de tous les events passés
    // mais on ignorait `objectsGained`. Un objet perdu au chapitre 3 puis
    // légitimement regagné via un event propre au chapitre 5 déclenchait
    // une fausse timeline_violation au chapitre 6 si le personnage en
    // disposait toujours. On nette maintenant la liste en soustrayant les
    // gains d'events qui suivent la dernière perte de chaque item.
    //
    // FIX-5 (CRITIQUE) : on normalisait sur l'ordre du tableau (DESC
    // en prod via loadContinuityKernel ; ASC dans certains tests qui
    // pushent à la main). Le résultat : `gainIdx < lossIdx` interprétait
    // DESC comme ASC et flaguait des regains légitimes. On trie
    // maintenant explicitement les events filtrés en ordre chronologique
    // ASC (chapterNumber, puis sceneNumber) pour avoir une convention
    // déterministe quel que soit l'ordre d'entrée.
    const characterEvents = input.kernel.eventLog.filter((event) =>
      event.actorIds.includes(character.characterId),
    );
    const chronologicalEvents = [...characterEvents].sort((a, b) => {
      if (a.chapterNumber !== b.chapterNumber) {
        return a.chapterNumber - b.chapterNumber;
      }
      const sceneA = a.sceneNumber ?? 0;
      const sceneB = b.sceneNumber ?? 0;
      return sceneA - sceneB;
    });
    const lastLossIndexByItem = new Map<string, number>();
    const lastGainIndexByItem = new Map<string, number>();
    chronologicalEvents.forEach((event, idx) => {
      for (const item of event.objectsLost) {
        lastLossIndexByItem.set(item, idx);
      }
      for (const item of event.objectsGained) {
        lastGainIndexByItem.set(item, idx);
      }
    });
    const lostItems = [...lastLossIndexByItem.entries()]
      .filter(([item, lossIdx]) => {
        const gainIdx = lastGainIndexByItem.get(item);
        // ASC : un item est réellement perdu si la perte est plus
        // récente que le gain (lossIdx > gainIdx) ou jamais regagné.
        return gainIdx === undefined || lossIdx > gainIdx;
      })
      .map(([item]) => item);
    const explicitGains = structuredDelta?.gainedItems ?? [];
    const regainedWithoutEvent = character.currentState.possessions.filter(
      (item) =>
        lostItems.includes(item)
        && !explicitGains.includes(item)
        && !inferInventoryRegain(summaryText),
    );
    if (regainedWithoutEvent.length > 0) {
      issues.push(
        makeIssue(
          "critical",
          "timeline_violation",
          `${character.identity.stableName ?? character.characterId} récupère ${regainedWithoutEvent.join(", ")} sans événement explicite.`,
          character.characterId,
        ),
      );
    }

    const explicitHealed = structuredDelta?.injuriesHealed ?? [];
    if (
      previous.currentState.injuries.length > 0
      && character.currentState.injuries.length === 0
      && explicitHealed.length === 0
      && !inferHealing(summaryText)
    ) {
      issues.push(
        makeIssue(
          "major",
          "injury_loss",
          `${character.identity.stableName ?? character.characterId} perd une blessure visible sans justification.`,
          character.characterId,
        ),
      );
    }

    const deathFlags = input.kernel.eventLog.filter(
      (event) =>
        event.actorIds.includes(character.characterId)
        && event.irreversible
        && event.eventType === "death",
    );
    if (deathFlags.length > 0) {
      issues.push(
        makeIssue(
          "critical",
          "timeline_violation",
          `${character.identity.stableName ?? character.characterId} réapparaît malgré un événement irréversible de mort.`,
          character.characterId,
        ),
      );
    }

    if (
      previous.currentState.emotion
      && !character.currentState.emotion
      && /(panique|colère|rage|deuil|terreur)/i.test(previous.currentState.emotion)
    ) {
      warnings.push(
        `${character.identity.stableName ?? character.characterId}: état émotionnel fort disparu sans transition claire.`,
      );
    }
  }

  const anchorOverlap = input.sceneSnapshot.location.visualAnchors.filter((anchor) =>
    input.sceneSnapshot.sceneBlueprintHints.visualAnchors.some(
      (hint) =>
        hint.toLowerCase().includes(anchor.toLowerCase())
        || anchor.toLowerCase().includes(hint.toLowerCase()),
    ),
  );
  if (input.sceneSnapshot.location.visualAnchors.length > 0 && anchorOverlap.length === 0) {
    issues.push(
      makeIssue(
        "major",
        "lore_violation",
        `Le lieu ${input.sceneSnapshot.location.name} perd ses anchors visuels persistants.`,
      ),
    );
  }

  // BUG-18 fix : `textHasAny(summaryText, [rule])` faisait un simple includes()
  // sans contexte. Un text comme "la cité sans magie reste calme" déclenchait
  // une violation critique parce qu'il contenait la sous-chaîne "magie"
  // alors même que la prose la niait explicitement. On filtre désormais les
  // matches précédés d'une négation proche (fenêtre de 40 chars).
  const prohibitions = input.kernel.worldState.structuralProhibitions;
  if (prohibitions.some((rule) => prohibitionIsViolated(summaryText, rule))) {
    issues.push(
      makeIssue("critical", "lore_violation", "La scène viole une interdiction structurelle du monde."),
    );
  }
  // `textHasAny` import est conservé pour rester aligné sur l'API du
  // module utils (et pour de futures règles) : un linter `noUnusedImports`
  // pourrait sinon le marquer.
  void textHasAny;

  for (const edge of input.sceneSnapshot.relationshipGraph) {
    const hasExplicitRelationshipDelta = input.sceneSnapshot.structuredContinuity?.characterDeltas.some(
      (delta) =>
        (delta.relationshipChanges ?? []).some(
          (change) =>
            resolveCharacterIdByName(input.sceneSnapshot.characters, change.targetCharacterName)
            === edge.targetCharacterId,
        ),
    );
    if (
      /(enemy|rival|haine|hostile)/i.test(edge.relationType)
      && /(confession|romance|tendre|intime)/i.test(summaryText)
      && !hasExplicitRelationshipDelta
      && !inferRelationshipShift(summaryText)
    ) {
      warnings.push(
        `Relation ${edge.sourceCharacterId} -> ${edge.targetCharacterId} change trop brutalement.`,
      );
    }
  }

  return {
    accepted: issues.every((issue) => issue.severity !== "critical"),
    issues,
    warnings,
    proposedEvents,
  };
}
