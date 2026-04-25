/**
 * BeatNarrativeContract — Contrat narratif par beat.
 *
 * Ce fichier définit le contrat narratif que chaque beat doit respecter.
 * Avant le render, on vérifie que les panels couvrent bien les éléments
 * requis par le contrat (personnages, lieux, entités, actions, dialogue, sfx).
 *
 * Objectif : ne plus perdre des éléments narratifs importants (ex: "Nelo",
 * "magicien", "Tokyo") entre l'intent utilisateur et les panels générés.
 */

import type { PanelBlueprintPremium, ProductionOutline } from "@manga-ai-studio/core";

export interface BeatNarrativeContract {
  beatId: string;
  location: string;
  requiredCharacters: string[];
  requiredEntities: string[];
  requiredProps: string[];
  requiredActions: string[];
  dialogueLines: Array<{ speakerId: string; speakerName: string; text: string }>;
  sfx: string[];
  mustShow: string[];
}

export interface NarrativeContractViolation {
  beatId: string;
  type:
    | "missing_location"
    | "missing_character"
    | "missing_entity"
    | "missing_prop"
    | "missing_action"
    | "missing_dialogue"
    | "missing_sfx";
  expected: string;
  found: string[];
}

export interface BuildNarrativeContractsInput {
  outline: ProductionOutline;
  chapterUserIntent?: string | null;
  chapterSummary?: string | null;
  chapterLocationName?: string | null;
}

function extractKeywords(text: string): string[] {
  const normalized = text.toLowerCase();
  const words = normalized.split(/[\s,;.!?()]+/).filter((w) => w.length > 2);
  return words;
}

function extractEntitiesFromIntent(intent: string): string[] {
  const patterns = [
    /\b(magicien|sorcier|mage|wizard|sorcerer)\b/gi,
    /\b(ennemi|enemy|adversaire|opponent)\b/gi,
    /\b(monstre|creature|monster|beast)\b/gi,
    /\b(soldat|soldier|garde|guard|warrior)\b/gi,
    /\b(robot|machine|automate)\b/gi,
  ];

  const found: string[] = [];
  for (const pattern of patterns) {
    const matches = intent.match(pattern);
    if (matches) {
      found.push(...matches.map((m) => m.toLowerCase()));
    }
  }
  return [...new Set(found)];
}

function extractLocationsFromIntent(intent: string): string[] {
  const patterns = [
    /\b(Tokyo|Paris|London|New York|Los Angeles)\b/gi,
    /\b(forêt|forest|jungle|bois)\b/gi,
    /\b(ville|city|town|village)\b/gi,
    /\b(rue|street|avenue|boulevard)\b/gi,
    /\b(temple|shrine|église|church)\b/gi,
    /\b(château|castle|palace|palais)\b/gi,
    /\b(montagne|mountain|colline|hill)\b/gi,
    /\b(plage|beach|océan|ocean|mer|sea)\b/gi,
  ];

  const found: string[] = [];
  for (const pattern of patterns) {
    const matches = intent.match(pattern);
    if (matches) {
      found.push(...matches.map((m) => m.toLowerCase()));
    }
  }
  return [...new Set(found)];
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function buildNarrativeContractsFromOutline(
  input: BuildNarrativeContractsInput,
): BeatNarrativeContract[] {
  const { outline, chapterUserIntent, chapterSummary, chapterLocationName } = input;
  const contracts: BeatNarrativeContract[] = [];

  const intentText = `${chapterUserIntent ?? ""} ${chapterSummary ?? ""}`;
  const globalEntities = extractEntitiesFromIntent(intentText);
  const globalLocations = extractLocationsFromIntent(intentText);

  const beats = Array.isArray(outline.beats) ? outline.beats : [];

  for (const beat of beats) {
    const involvedCharacters = asStringArray((beat as { involvedCharacters?: unknown }).involvedCharacters);
    const characterIds = asStringArray((beat as { characterIds?: unknown }).characterIds);
    const beatCharacters = asStringArray((beat as { characters?: unknown }).characters);
    const beatText = `${asString(beat.summary)} ${asString(beat.whyThisBeatExists)} ${asString(beat.dramaticChange)}`;
    const beatEntities = extractEntitiesFromIntent(beatText);
    const beatLocations = extractLocationsFromIntent(beatText);

    const structuredChars =
      involvedCharacters.length > 0 || characterIds.length > 0
        ? [...involvedCharacters, ...characterIds]
        : beatCharacters;

    const contract: BeatNarrativeContract = {
      beatId: asString(beat.beatId) || `beat_${contracts.length + 1}`,
      location: chapterLocationName ?? beatLocations[0] ?? globalLocations[0] ?? "",
      requiredCharacters: [...new Set(structuredChars)],
      requiredEntities: [...new Set([...beatEntities, ...(involvedCharacters.length === 0 ? globalEntities : [])])],
      requiredProps: [],
      requiredActions: [],
      dialogueLines: [],
      sfx: [],
      mustShow: [],
    };

    if (/combat|attack|fight|attaque|battle/.test(beatText.toLowerCase())) {
      contract.sfx.push("IMPACT", "FWASH");
      contract.requiredActions.push("combat_action");
    }

    if (/dialogue|parle|dit|speak|talk|conversation/.test(beatText.toLowerCase())) {
      contract.requiredActions.push("dialogue_exchange");
    }

    contracts.push(contract);
  }

  return contracts;
}

export function validatePanelsAgainstContracts(
  blueprints: PanelBlueprintPremium[],
  contracts: BeatNarrativeContract[],
): NarrativeContractViolation[] {
  const violations: NarrativeContractViolation[] = [];

  for (const contract of contracts) {
    const beatPanels = blueprints.filter((bp) => bp.beatId === contract.beatId);

    if (beatPanels.length === 0) {
      continue;
    }

    const panelLocations = beatPanels
      .flatMap((bp) => bp.requiredLocationSignals ?? [])
      .map((l) => l.toLowerCase());

    const panelCharacters = beatPanels
      .flatMap((bp) => [
        ...(bp.requiredCharacterIds ?? []),
        ...(bp.requiredCharacters ?? []),
        ...(bp.mustShowCharacterIds ?? []),
        ...(bp.mayShowCharacterIds ?? []),
        ...(bp.speakerAnchorCharacterId ? [bp.speakerAnchorCharacterId] : []),
        ...(bp.speakerAnchorCharacterName ? [bp.speakerAnchorCharacterName] : []),
        ...((bp.dialogueLines ?? []).map((d) => d.speaker)),
      ])
      .map((c) => c.toLowerCase());

    const panelText = beatPanels
      .map((bp) => bp.purpose ?? "")
      .join(" ")
      .toLowerCase();

    if (contract.location && !panelLocations.some((l) => l.includes(contract.location.toLowerCase()))) {
      const locationInText = panelText.includes(contract.location.toLowerCase());
      if (!locationInText) {
        violations.push({
          beatId: contract.beatId,
          type: "missing_location",
          expected: contract.location,
          found: panelLocations,
        });
      }
    }

    for (const char of contract.requiredCharacters) {
      const charLower = char.toLowerCase();
      const found = panelCharacters.some((c) => c.includes(charLower)) || panelText.includes(charLower);
      if (!found) {
        violations.push({
          beatId: contract.beatId,
          type: "missing_character",
          expected: char,
          found: panelCharacters,
        });
      }
    }

    for (const entity of contract.requiredEntities) {
      const entityLower = entity.toLowerCase();
      const found = panelText.includes(entityLower);
      if (!found) {
        violations.push({
          beatId: contract.beatId,
          type: "missing_entity",
          expected: entity,
          found: [],
        });
      }
    }

    if (contract.sfx.length > 0) {
      const panelSfx = beatPanels.flatMap((bp) => bp.sfxCues ?? []);
      if (panelSfx.length === 0) {
        violations.push({
          beatId: contract.beatId,
          type: "missing_sfx",
          expected: contract.sfx.join(", "),
          found: [],
        });
      }
    }
  }

  return violations;
}

export function runNarrativeContractQa(args: {
  blueprints: PanelBlueprintPremium[];
  outline: ProductionOutline;
  chapterUserIntent?: string | null;
  chapterSummary?: string | null;
  chapterLocationName?: string | null;
}): { ok: boolean; violations: NarrativeContractViolation[]; contracts: BeatNarrativeContract[] } {
  const contracts = buildNarrativeContractsFromOutline({
    outline: args.outline,
    chapterUserIntent: args.chapterUserIntent,
    chapterSummary: args.chapterSummary,
    chapterLocationName: args.chapterLocationName,
  });

  const violations = validatePanelsAgainstContracts(args.blueprints, contracts);

  return {
    ok: violations.length === 0,
    violations,
    contracts,
  };
}
