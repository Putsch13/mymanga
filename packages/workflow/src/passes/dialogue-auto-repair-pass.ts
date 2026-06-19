/**
 * P5.20 — DialogueAutoRepairPass : réparation automatique des dialogues.
 *
 * Ce pass tente de réparer les problèmes de dialogue AVANT le manga QA.
 * L'objectif est de s'assurer que chaque beat avec dialogue a un speaker
 * panel valide.
 *
 * Réparations effectuées :
 * - Ajout de speakerAnchorCharacterId si dialogueLines présentes
 * - Conversion de panels avec dialogue mais sans speaker anchor
 * - Assignation de dialogueCarrier si manquant
 *
 * @module dialogue-auto-repair-pass
 */

import {
  isSpeakerPanelForDialogueBeat,
  findBeatsWithMissingSpeakerPanels,
  legacyDialogueLinesFromBlueprintPremium,
  blueprintPrimaryDialogueLineCount,
  syncBlueprintTextContractFromTextFragments,
} from "@manga-ai-studio/core";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

export interface DialogueAutoRepairInput {
  blueprints: PanelBlueprintPremium[];
  heroCharacterId?: string | null;
}

export interface DialogueAutoRepairResult {
  blueprints: PanelBlueprintPremium[];
  repairsApplied: Array<{
    panelId: string;
    beatId: string;
    repairType: string;
  }>;
  unrepairable: Array<{
    beatId: string;
    reason: string;
  }>;
}

export function runDialogueAutoRepairPass(
  input: DialogueAutoRepairInput,
): DialogueAutoRepairResult {
  const { heroCharacterId } = input;
  const repairs: DialogueAutoRepairResult["repairsApplied"] = [];
  const unrepairable: DialogueAutoRepairResult["unrepairable"] = [];
  const repairedBlueprints = [...input.blueprints];

  // Trouver les beats avec dialogue mais sans speaker panel
  const beatsWithMissingSpeaker = findBeatsWithMissingSpeakerPanels(input.blueprints);

  for (const beatId of beatsWithMissingSpeaker) {
    const beatPanels = repairedBlueprints.filter((bp) => bp.beatId === beatId);
    const panelsWithDialogue = beatPanels.filter((bp) => blueprintPrimaryDialogueLineCount(bp) > 0);

    if (panelsWithDialogue.length === 0) {
      continue;
    }

    // Essayer de réparer le premier panel avec dialogue
    let repaired = false;
    for (const panel of panelsWithDialogue) {
      const idx = repairedBlueprints.findIndex((bp) => bp.panelId === panel.panelId);
      if (idx === -1) continue;

      // Tentative 1: ajouter speakerAnchorCharacterId depuis les lignes dialogue résolues
      if (!panel.speakerAnchorCharacterId) {
        const lines = legacyDialogueLinesFromBlueprintPremium(panel);
        const firstSpeaker = lines[0]?.speaker;
        if (firstSpeaker) {
          const next = {
            ...panel,
            speakerAnchorCharacterId: firstSpeaker,
            dialogueCarrier: "speaker_visible" as const,
          };
          syncBlueprintTextContractFromTextFragments(next);
          repairedBlueprints[idx] = next;
          repairs.push({
            panelId: panel.panelId,
            beatId,
            repairType: "add_speaker_anchor_from_dialogue",
          });
          repaired = true;
          break;
        }
      }

      // Tentative 2: utiliser heroCharacterId comme speaker
      if (!panel.speakerAnchorCharacterId && heroCharacterId) {
        const next = {
          ...panel,
          speakerAnchorCharacterId: heroCharacterId,
          dialogueCarrier: "speaker_visible" as const,
        };
        syncBlueprintTextContractFromTextFragments(next);
        repairedBlueprints[idx] = next;
        repairs.push({
          panelId: panel.panelId,
          beatId,
          repairType: "add_hero_as_speaker",
        });
        repaired = true;
        break;
      }

      // Tentative 3: forcer mangaPanelFunction dialogue_speaker
      if (!isSpeakerPanelForDialogueBeat(panel)) {
        const next = {
          ...panel,
          mangaPanelFunction: "dialogue_speaker" as const,
          subjectFocus: "speaker" as const,
        };
        syncBlueprintTextContractFromTextFragments(next);
        repairedBlueprints[idx] = next;
        repairs.push({
          panelId: panel.panelId,
          beatId,
          repairType: "force_dialogue_speaker_function",
        });
        repaired = true;
        break;
      }
    }

    if (!repaired) {
      unrepairable.push({
        beatId,
        reason: "no_panel_with_dialogue_could_be_repaired",
      });
    }
  }

  console.info(
    `[dialogue-auto-repair] beatsWithMissingSpeaker=${beatsWithMissingSpeaker.length} ` +
      `repairs=${repairs.length} unrepairable=${unrepairable.length}`,
  );

  return {
    blueprints: repairedBlueprints,
    repairsApplied: repairs,
    unrepairable,
  };
}

export function formatDialogueAutoRepairLog(result: DialogueAutoRepairResult): string {
  if (result.repairsApplied.length === 0 && result.unrepairable.length === 0) {
    return "[dialogue-auto-repair] no repairs needed";
  }

  const repairSummary = result.repairsApplied
    .slice(0, 5)
    .map((r) => `${r.beatId}: ${r.repairType}`)
    .join(", ");

  return (
    `[dialogue-auto-repair] repairs=${result.repairsApplied.length} ` +
    `unrepairable=${result.unrepairable.length}` +
    (repairSummary ? ` (${repairSummary})` : "")
  );
}
