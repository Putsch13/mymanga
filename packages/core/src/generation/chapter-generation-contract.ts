/**
 * ChapterGenerationContract — Source de vérité unique pour la génération d'un chapitre premium.
 *
 * Ce contrat est construit UNE FOIS après l'approbation du plan et AVANT le storyboard.
 * Il ne doit JAMAIS être écrasé par le canonical plan ou reconstruit depuis zéro.
 *
 * Le storyboard, le render-pass et la Vision QA doivent tous utiliser CE contrat.
 * Aucun fallback silencieux n'est autorisé en mode premium.
 *
 * Règles fortes:
 *   - Le contrat est hashé et persisté avec le chapitre
 *   - Toute modification du contrat invalide les images générées
 *   - Le retry image doit conserver le même contrat (hash vérifié)
 *   - Aucun élément hors contrat ne peut apparaître dans le prompt final
 */

import type { PanelTextContract } from "./panel-text-contract";
import type { ContractCharacterVisualDna } from "../characters/merge-character-visual-dna";

export const CONTRACT_VERSION = "v1" as const;

export interface ContractCharacter {
  characterId: string;
  name: string;
  normalizedName: string;
  role: "hero" | "support" | "antagonist" | "npc" | "extra";
  visualDna: ContractCharacterVisualDna;
  faceRefUrl?: string | null;
  silhouetteRefUrl?: string | null;
  loraUrl?: string | null;
  loraTriggerWord?: string | null;
  loraScale?: number;
  canonLocked: boolean;
  forbiddenDrift: string[];
}

export interface ContractLocation {
  locationId: string;
  name: string;
  normalizedName: string;
  visualDescription: string;
  refUrl?: string | null;
  atmosphereHints: string[];
  lightingHints: string[];
  required: boolean;
}

export interface ContractProp {
  propId: string;
  label: string;
  normalizedLabel: string;
  visualDescription: string;
  sourceBeatId?: string;
  required: boolean;
}

export interface ContractNpcGroup {
  groupId: string;
  label: string;
  normalizedLabel: string;
  visualDescription: string;
  minCount: number;
  maxCount: number;
  sourceBeatId?: string;
}

export interface ContractCreature {
  creatureId: string;
  label: string;
  normalizedLabel: string;
  visualDescription: string;
  sourceBeatId?: string;
  refUrl?: string | null;
}

export interface ContractBeat {
  beatId: string;
  beatNumber: number;
  summary: string;
  emotionalIntent: string;
  requiredCharacterIds: string[];
  requiredLocationId?: string | null;
  requiredProps: string[];
  requiredNpcGroups: string[];
  requiredCreatures: string[];
  visualEvents: string[];
  dialogueRequired: boolean;
}

export interface ContractCharacterRef {
  characterId: string;
  name: string;
  role: "hero" | "support" | "antagonist" | "npc" | "extra";
  visualDna: ContractCharacterVisualDna;
  poseIntent?: string | null;
  expressionIntent?: string | null;
}

export interface ContractCoverageRequirement {
  type: "character" | "location" | "prop" | "npc_group" | "creature" | "beat";
  entityId: string;
  minimumPanelCount: number;
}

export type PanelNarrativeRole =
  | "establishing"
  | "action"
  | "reaction"
  | "dialogue"
  | "emotion"
  | "insert"
  | "transition"
  | "cliffhanger";

export interface PanelPromptConstraints {
  mustShow: string[];
  mustNotShow: string[];
  forbiddenDrift: string[];
}

export interface PanelGenerationContract {
  panelId: string;
  panelNumber: number;
  pageNumber: number;
  sourceBeatId: string;

  narrativeRole: PanelNarrativeRole;

  microAction: string;
  visualSubject: string;
  emotionalIntent?: string;

  requiredVisualEventIds: string[];
  requiredCharacters: ContractCharacterRef[];
  optionalCharacters: ContractCharacterRef[];

  requiredLocationId?: string | null;
  requiredLocationSignals: string[];
  requiredProps: string[];
  requiredNpcGroups: string[];
  requiredCreatures: string[];

  textContract: PanelTextContract;

  promptConstraints: PanelPromptConstraints;

  loraBindings?: PanelLoraBinding[];
}

export interface PanelLoraBinding {
  characterId: string;
  characterName: string;
  url: string;
  triggerWord: string;
  scale: number;
  source: "character_lora";
}

export interface ContractSourceHashes {
  userIntentHash: string;
  approvedOutlineHash: string;
  productionPlanHash: string;
  characterCanonHash: string;
  locationCanonHash: string;
}

export interface ProjectRagContextContract {
  mode: "vector" | "text_fallback" | "disabled";
  query: string;
  retrievedDocs: Array<{
    id: string;
    entityType: string;
    entityId?: string | null;
    title?: string | null;
    content: string;
    metadata?: unknown;
    relevanceRank: number;
  }>;
  groundedCharacters: string[];
  groundedLocations: string[];
  groundedNpcs: string[];
  groundedProps: string[];
  warnings: string[];
}

export interface ChapterGenerationContract {
  contractVersion: typeof CONTRACT_VERSION;
  projectId: string;
  chapterId: string;
  chapterNumber: number;

  source: ContractSourceHashes;

  characters: ContractCharacter[];
  locations: ContractLocation[];
  props: ContractProp[];
  npcGroups: ContractNpcGroup[];
  creatures: ContractCreature[];

  beats: ContractBeat[];
  panels: PanelGenerationContract[];

  ragContext?: ProjectRagContextContract;

  forbiddenOutOfContractTerms: string[];
  requiredCoverage: ContractCoverageRequirement[];

  contractHash: string;
  createdAt: string;
}

export function computeContractHash(contract: Omit<ChapterGenerationContract, "contractHash" | "createdAt">): string {
  const stableJson = JSON.stringify({
    v: contract.contractVersion,
    p: contract.projectId,
    c: contract.chapterId,
    src: contract.source,
    chars: contract.characters.map(c => c.characterId).sort(),
    locs: contract.locations.map(l => l.locationId).sort(),
    beats: contract.beats.map(b => b.beatId).sort(),
    panels: contract.panels.length,
  });

  let hash = 0;
  for (let i = 0; i < stableJson.length; i++) {
    const char = stableJson.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `contract_${Math.abs(hash).toString(16)}`;
}

export function validateChapterGenerationContract(
  contract: ChapterGenerationContract,
  options: { premiumOnly: boolean }
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (contract.contractVersion !== CONTRACT_VERSION) {
    issues.push(`invalid_contract_version:${contract.contractVersion}`);
  }

  if (!contract.projectId || !contract.chapterId) {
    issues.push("missing_project_or_chapter_id");
  }

  const heroCount = contract.characters.filter(c => c.role === "hero").length;
  if (heroCount === 0) {
    issues.push("no_hero_character_in_contract");
  }
  if (heroCount > 1) {
    issues.push(`multiple_heroes_in_contract:${heroCount}`);
  }

  if (contract.beats.length === 0) {
    issues.push("no_beats_in_contract");
  }

  if (contract.panels.length === 0) {
    issues.push("no_panels_in_contract");
  }

  for (const panel of contract.panels) {
    if (!panel.sourceBeatId) {
      issues.push(`panel_missing_source_beat:${panel.panelId}`);
    }

    if (!panel.microAction || panel.microAction.length < 10) {
      issues.push(`panel_generic_micro_action:${panel.panelId}`);
    }

    const beatExists = contract.beats.some(b => b.beatId === panel.sourceBeatId);
    if (!beatExists) {
      issues.push(`panel_invalid_source_beat:${panel.panelId}:${panel.sourceBeatId}`);
    }

    if (panel.narrativeRole === "dialogue" && !panel.textContract.hasText) {
      issues.push(`dialogue_panel_without_text:${panel.panelId}`);
    }
  }

  if (options.premiumOnly) {
    for (const char of contract.characters) {
      if (char.role === "hero" && !char.faceRefUrl && !char.loraUrl) {
        issues.push(`hero_without_visual_ref:${char.characterId}`);
      }
      if (char.canonLocked && !char.faceRefUrl && !char.loraUrl && !char.silhouetteRefUrl) {
        issues.push(`canon_locked_without_ref:${char.characterId}`);
      }
    }

    if (contract.ragContext?.mode === "disabled" && contract.chapterNumber > 1) {
      issues.push("rag_disabled_for_continuity_chapter");
    }
  }

  return { valid: issues.length === 0, issues };
}

export function assertValidChapterGenerationContract(
  contract: ChapterGenerationContract,
  options: { premiumOnly: boolean }
): void {
  const { valid, issues } = validateChapterGenerationContract(contract, options);
  if (!valid) {
    throw new Error(`invalid_chapter_generation_contract:${issues.join(",")}`);
  }
}
