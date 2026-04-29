/**
 * Construction d'un ChapterGenerationContract à partir du plan premium persisté
 * (outline + panelBlueprints enrichis). Alimente la validation contractuelle
 * avant render / Vision QA — ne remplace pas le storyboard mais verrouille la trace.
 */

import type { PanelBlueprintPremium } from "../types/narrative-facts";
import {
  computeContractHash,
  type ChapterGenerationContract,
  type ContractBeat,
  type ContractCharacter,
  type ContractCharacterRef,
  type ContractCoverageRequirement,
  type ContractLocation,
  type ContractNpcGroup,
  type ContractProp,
  type PanelGenerationContract,
  type PanelNarrativeRole,
  type PanelPromptConstraints,
  type ContractSourceHashes,
} from "./chapter-generation-contract";
import {
  buildPanelTextContractFromFragments,
  type PanelTextContract,
} from "./panel-text-contract";
import type { ContractCharacterVisualDna } from "../characters/merge-character-visual-dna";

export interface PipelineCharacterLike {
  id: string;
  name: string;
  roleType?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  hairStyle?: string | null;
  skinTone?: string | null;
  outfitSignature?: string | null;
  accessories?: string[] | null;
  bodyType?: string | null;
  ageApparent?: string | null;
  distinctiveMarks?: string[] | null;
  canonSignatureText?: string | null;
  forbiddenVisualDrift?: string[] | null;
  canonLocked?: boolean;
  faceRefUrl?: string | null;
  silhouetteRefUrl?: string | null;
  loraUrl?: string | null;
  loraTriggerWord?: string | null;
  loraScale?: number | null;
}

export interface PipelineLocationLike {
  id: string;
  name: string | null;
  visualDescription?: string | null;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function padMicroAction(purpose: string): string {
  const t = purpose.trim();
  if (t.length >= 10) return t;
  return `${t} — scène manga premium`.slice(0, 120);
}

function mapRole(
  charId: string,
  heroId: string | null,
  focusIds: string[],
): ContractCharacter["role"] {
  if (heroId && charId === heroId) return "hero";
  if (focusIds.includes(charId)) {
    return "support";
  }
  return "npc";
}

function mapPanelNarrativeRole(bp: PanelBlueprintPremium): PanelNarrativeRole {
  const hasBlueprintDialogue =
    Array.isArray(bp.dialogueLines) && bp.dialogueLines.some((d) => d.text?.trim());
  const bundleDialogues = bp.panelTextBundle?.dialogues;
  const hasBundleDialogue =
    Array.isArray(bundleDialogues) && bundleDialogues.some((d) => d.text?.trim());
  const hasNarration =
    Boolean(bp.narrationText?.trim()) || Boolean(bp.panelTextBundle?.narration?.trim());
  if (hasBlueprintDialogue || hasBundleDialogue) return "dialogue";
  if (hasNarration) return "emotion";
  if (bp.cutawayType && bp.cutawayType !== "none") return "insert";
  if (bp.subjectFocus === "environment") return "establishing";
  return "action";
}

function panelTextFromBlueprint(panelId: string, bp: PanelBlueprintPremium): PanelTextContract {
  return buildPanelTextContractFromFragments({
    panelId,
    dialogueLines: bp.dialogueLines ?? null,
    narration: bp.narrationText ?? null,
    panelTextBundle: bp.panelTextBundle ?? null,
  });
}

function emptySourceHashes(): ContractSourceHashes {
  return {
    userIntentHash: "n/a",
    approvedOutlineHash: "n/a",
    productionPlanHash: "n/a",
    characterCanonHash: "n/a",
    locationCanonHash: "n/a",
  };
}

export interface BuildChapterGenerationContractOutlineBeat {
  id: string;
  summary: string;
  characters?: string[];
  emotionalDelta?: number;
}

export interface BuildChapterGenerationContractInput {
  projectId: string;
  chapterId: string;
  chapterNumber: number;
  outlineBeats: BuildChapterGenerationContractOutlineBeat[];
  panelBlueprints: PanelBlueprintPremium[];
  heroCharacterId: string | null;
  focusCharacterIds: string[];
  characters: PipelineCharacterLike[];
  locations: PipelineLocationLike[];
}

export function buildChapterGenerationContractFromPremiumPlan(
  input: BuildChapterGenerationContractInput,
): ChapterGenerationContract {
  const charById = new Map(input.characters.map((c) => [c.id, c]));
  const contractChars: ContractCharacter[] = input.characters.map((c) => {
    const visualDna: ContractCharacterVisualDna = {
      hairColor: c.hairColor ?? null,
      eyeColor: c.eyeColor ?? null,
      hairStyle: c.hairStyle ?? null,
      skinTone: c.skinTone ?? null,
      outfitSignature: c.outfitSignature ?? null,
      distinctiveTraits: [
        ...(Array.isArray(c.accessories) ? c.accessories : []),
        ...(Array.isArray(c.distinctiveMarks) ? c.distinctiveMarks : []),
      ].filter(Boolean),
      silhouette: null,
      ageAppearance: c.ageApparent ?? null,
      bodyType: c.bodyType ?? null,
    };
    return {
      characterId: c.id,
      name: c.name,
      normalizedName: normalizeName(c.name),
      role: mapRole(c.id, input.heroCharacterId, input.focusCharacterIds),
      visualDna,
      faceRefUrl: c.faceRefUrl ?? null,
      silhouetteRefUrl: c.silhouetteRefUrl ?? null,
      loraUrl: c.loraUrl ?? null,
      loraTriggerWord: c.loraTriggerWord ?? null,
      loraScale: c.loraScale ?? undefined,
      canonLocked: Boolean(c.canonLocked),
      forbiddenDrift: Array.isArray(c.forbiddenVisualDrift)
        ? c.forbiddenVisualDrift.filter((x): x is string => typeof x === "string")
        : [],
      source: "current_chapter",
      confidence: 1,
    };
  });

  const contractLocs: ContractLocation[] = input.locations.map((loc) => ({
    locationId: loc.id,
    name: loc.name ?? loc.id,
    normalizedName: normalizeName(loc.name ?? loc.id),
    visualDescription: typeof loc.visualDescription === "string" && loc.visualDescription.trim()
      ? loc.visualDescription.trim()
      : `Location ${loc.name ?? loc.id}`,
    refUrl: null,
    atmosphereHints: [],
    lightingHints: [],
    required: true,
    source: "location_canon",
    confidence: 0.9,
  }));

  const beats: ContractBeat[] = input.outlineBeats.map((b, idx) => ({
    beatId: b.id,
    beatNumber: idx + 1,
    summary: b.summary,
    emotionalIntent: typeof b.emotionalDelta === "number" ? `delta_${b.emotionalDelta}` : "neutral",
    requiredCharacterIds: Array.isArray(b.characters) ? b.characters : [],
    requiredLocationId: null,
    requiredProps: [],
    requiredNpcGroups: [],
    requiredCreatures: [],
    visualEvents: [],
    dialogueRequired: false,
  }));

  const propsByKey = new Map<string, ContractProp>();
  for (const bp of input.panelBlueprints) {
    for (const rp of bp.requiredProps ?? []) {
      const key = `${bp.beatId}:${rp.canonicalName}`;
      if (propsByKey.has(key)) continue;
      propsByKey.set(key, {
        propId: `prop_${bp.beatId}_${normalizeName(rp.canonicalName)}`,
        label: rp.canonicalName,
        normalizedLabel: normalizeName(rp.canonicalName),
        visualDescription: rp.canonicalName,
        sourceBeatId: bp.beatId,
        required: Boolean(rp.mustBeVisible ?? true),
        source: "current_chapter",
        sourceText: rp.canonicalName,
        confidence: typeof rp.confidence === "number" ? rp.confidence : 0.85,
      });
    }
  }
  const props = [...propsByKey.values()];

  const npcGroups: ContractNpcGroup[] = [];

  const panels: PanelGenerationContract[] = input.panelBlueprints.map((bp, idx) => {
    const narrativeRole = mapPanelNarrativeRole(bp);
    const textContract = panelTextFromBlueprint(bp.panelId, bp);
    const requiredChars: ContractCharacterRef[] = [];

    const ids = [
      ...(bp.mustShowCharacterIds ?? []),
      ...(bp.requiredCharacterIds ?? []),
    ];
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    for (const id of uniqueIds) {
      const row = charById.get(id);
      if (!row) continue;
      requiredChars.push({
        characterId: row.id,
        name: row.name,
        role: mapRole(row.id, input.heroCharacterId, input.focusCharacterIds),
        visualDna: {
          hairColor: row.hairColor ?? null,
          eyeColor: row.eyeColor ?? null,
          hairStyle: row.hairStyle ?? null,
          skinTone: row.skinTone ?? null,
          outfitSignature: row.outfitSignature ?? null,
        },
      });
    }

    const mustShow = [
      ...(bp.mustShowCharacterIds ?? []),
      ...(bp.requiredLocationSignals ?? []),
      ...((bp.requiredProps ?? []).map((p) => p.canonicalName)),
    ];

    const promptConstraints: PanelPromptConstraints = {
      mustShow,
      mustNotShow: [],
      forbiddenDrift: requiredChars.flatMap((c) => {
        const full = charById.get(c.characterId);
        return Array.isArray(full?.forbiddenVisualDrift)
          ? full!.forbiddenVisualDrift!.filter((x): x is string => typeof x === "string")
          : [];
      }),
    };

    return {
      panelId: bp.panelId,
      panelNumber: bp.panelNumber ?? idx + 1,
      pageNumber: typeof bp.pageNumber === "number" ? bp.pageNumber : 1,
      sourceBeatId: bp.beatId,
      narrativeRole,
      microAction: padMicroAction(bp.purpose || "panel manga"),
      visualSubject: String(bp.subjectFocus ?? bp.purpose ?? "scene").slice(0, 200),
      emotionalIntent: undefined,
      requiredVisualEventIds: [],
      requiredCharacters: requiredChars,
      optionalCharacters: [],
      requiredLocationId: null,
      requiredLocationSignals: [...(bp.requiredLocationSignals ?? [])],
      requiredProps: (bp.requiredProps ?? []).map((p) => p.canonicalName),
      requiredNpcGroups: [],
      requiredCreatures: [],
      textContract,
      promptConstraints,
    };
  });

  const requiredCoverage: ContractCoverageRequirement[] = [];

  const forbiddenOutOfContractTerms: string[] = [];

  const base: Omit<ChapterGenerationContract, "contractHash" | "createdAt"> = {
    contractVersion: "v1",
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterNumber: input.chapterNumber,
    source: emptySourceHashes(),
    characters: contractChars,
    locations: contractLocs,
    props,
    npcGroups,
    creatures: [],
    beats,
    panels,
    forbiddenOutOfContractTerms,
    requiredCoverage,
  };

  const contractHash = computeContractHash(base);
  return {
    ...base,
    contractHash,
    createdAt: new Date().toISOString(),
  };
}
