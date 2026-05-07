/**
 * Construction d'un ChapterGenerationContract à partir du plan premium persisté
 * (outline + panelBlueprints enrichis). Alimente la validation contractuelle
 * avant render / Vision QA — ne remplace pas le storyboard mais verrouille la trace.
 */

import type { PanelBlueprintPremium } from "../types/narrative-facts";
import type { ChapterCastContract } from "../types/chapter-cast-contract";
import {
  computeContractHash,
  type ChapterGenerationContract,
  type ContractBeat,
  type ContractCharacter,
  type ContractCharacterRef,
  type ContractCoverageRequirement,
  type ContractCreature,
  type ContractFaction,
  type ContractLocation,
  type ContractNpcGroup,
  type ContractProp,
  type ContractVehicle,
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
import type { VisualWorldContract } from "../visual-world/visual-world-contract";
import { bindingForBeat, linkedEntityIdsForBeat, npcIdsForBeat } from "../production/visual-world-beat-bindings";

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

/** Empreinte stable (djb2) pour les hashes de provenance — jamais « n/a ». */
function stableSourceFingerprint(label: string, payload: string): string {
  const stableJson = `${label}|${payload}`;
  let hash = 0;
  for (let i = 0; i < stableJson.length; i++) {
    const char = stableJson.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `src_${label}_${Math.abs(hash).toString(16)}`;
}

function dialogueStablePayloadFromBlueprints(blueprints: PanelBlueprintPremium[]): string {
  const rows = blueprints.map((bp) => ({
    id: bp.panelId,
    lines: (bp.dialogueLines ?? []).map((d) => ({
      cid: d.characterId ?? null,
      sp: d.speaker,
      t: d.text,
    })),
    bundle: bp.panelTextBundle?.dialogues
      ? (bp.panelTextBundle.dialogues as Array<{ speaker?: string; text?: string; characterId?: string }>).map(
          (d) => ({ cid: d.characterId ?? null, sp: d.speaker, t: d.text }),
        )
      : null,
    narration: bp.narrationText ?? bp.panelTextBundle?.narration ?? null,
  }));
  return JSON.stringify(rows);
}

function visualWorldStablePayload(vw: unknown): string {
  try {
    return typeof vw === "object" && vw !== null ? JSON.stringify(vw) : String(vw);
  } catch {
    return "visual_world_non_serializable";
  }
}

function castContractStablePayload(cast: ChapterCastContract): string {
  return JSON.stringify({
    chapterId: cast.chapterId,
    heroCharacterId: cast.heroCharacterId,
    secondaryHeroCharacterId: cast.secondaryHeroCharacterId ?? null,
    activeCharacterIds: [...cast.activeCharacterIds].filter(Boolean).sort(),
    supportCharacterIds: [...(cast.supportCharacterIds ?? [])].filter(Boolean).sort(),
    antagonistCharacterIds: [...(cast.antagonistCharacterIds ?? [])].filter(Boolean).sort(),
    npcGroupIds: (cast.npcGroups ?? []).map((g) => g.groupId).filter(Boolean).sort(),
  });
}

function deriveContractSourceHashes(
  input: BuildChapterGenerationContractInput,
): ContractSourceHashes {
  const m = input.sourceHashMaterial ?? {};
  const intentRaw =
    typeof m.chapterIntentContractJson === "string" && m.chapterIntentContractJson.trim()
      ? m.chapterIntentContractJson.trim()
      : typeof m.chapterUserIntent === "string" && m.chapterUserIntent.trim()
        ? m.chapterUserIntent.trim()
        : `placeholder_intent|${input.projectId}|${input.chapterId}`;

  const outlinePayload = JSON.stringify(
    input.outlineBeats.map((b) => ({ id: b.id, summary: b.summary, ch: b.characters ?? [] })),
  );
  const planPayload = JSON.stringify(
    input.panelBlueprints.map((bp) => ({
      id: bp.panelId,
      beat: bp.beatId,
      n: bp.panelNumber ?? null,
    })),
  );
  const charPayload = JSON.stringify(
    input.characters.map((c) => ({
      id: c.id,
      face: c.faceRefUrl ?? null,
      sil: c.silhouetteRefUrl ?? null,
      lora: c.loraUrl ?? null,
      sig: c.canonSignatureText ?? null,
      locked: Boolean(c.canonLocked),
    })),
  );
  const locPayload = JSON.stringify(
    input.locations.map((l) => ({ id: l.id, name: l.name, d: l.visualDescription ?? null })),
  );

  const vwPayload =
    typeof m.persistedVisualWorldJson === "string" && m.persistedVisualWorldJson.trim()
      ? m.persistedVisualWorldJson.trim()
      : typeof m.visualWorldJson === "string" && m.visualWorldJson.trim()
        ? m.visualWorldJson.trim()
        : typeof m.visualWorldObject !== "undefined" && m.visualWorldObject !== null
          ? visualWorldStablePayload(m.visualWorldObject)
          : `visual_world_absent|${input.projectId}|${input.chapterId}`;

  const dialoguePayload =
    typeof m.dialogueContractJson === "string" && m.dialogueContractJson.trim()
      ? m.dialogueContractJson.trim()
      : dialogueStablePayloadFromBlueprints(input.panelBlueprints);

  const castPayload =
    typeof m.castContractJson === "string" && m.castContractJson.trim()
      ? m.castContractJson.trim()
      : m.castContract
        ? castContractStablePayload(m.castContract)
        : `cast_absent|${input.projectId}|${input.chapterId}`;

  return {
    userIntentHash: stableSourceFingerprint("user_intent", intentRaw),
    approvedOutlineHash: stableSourceFingerprint("approved_outline", outlinePayload),
    productionPlanHash: stableSourceFingerprint("production_plan", planPayload),
    characterCanonHash: stableSourceFingerprint("character_canon", charPayload),
    locationCanonHash: stableSourceFingerprint("location_canon", locPayload),
    visualWorldHash: stableSourceFingerprint("visual_world", vwPayload),
    dialogueContractHash: stableSourceFingerprint("dialogue_contract", dialoguePayload),
    castContractHash: stableSourceFingerprint("cast_contract", castPayload),
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
  /**
   * Monde visuel effectif (studio persisté ou pipeline) — P0.11 / P0.13 :
   * remplit `requiredLocationId`, PNJ et créatures par beat / panel.
   */
  visualWorld?: VisualWorldContract | null;
  /**
   * Données pour hasher la provenance (P0.13) — toujours dérivées, jamais « n/a ».
   */
  sourceHashMaterial?: {
    chapterUserIntent?: string | null;
    /** JSON du contrat intention compilé (studio) — prime sur `chapterUserIntent` pour l’empreinte. */
    chapterIntentContractJson?: string | null;
    /** JSON du VisualWorld persisté studio (prioritaire sur l’objet découvert). */
    persistedVisualWorldJson?: string | null;
    /** JSON sérialisé du VisualWorldContract si déjà disponible. */
    visualWorldJson?: string | null;
    /** Objet monde visuel (sérialisé en interne pour l’empreinte). */
    visualWorldObject?: unknown;
    dialogueContractJson?: string | null;
    castContractJson?: string | null;
    castContract?: ChapterCastContract;
  };
}

export function buildChapterGenerationContractFromPremiumPlan(
  input: BuildChapterGenerationContractInput,
): ChapterGenerationContract {
  const vw = input.visualWorld ?? null;
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

  const beats: ContractBeat[] = input.outlineBeats.map((b, idx) => {
    const bb = vw ? bindingForBeat(vw, b.id) : undefined;
    const npcGroupIds = vw ? npcIdsForBeat(vw, b.id, bb?.npcGroupIds ?? []) : [];
    const creatureIds = vw ? linkedEntityIdsForBeat(vw.creatures, b.id, bb?.creatureIds ?? []) : [];
    const vehicleIds = vw ? linkedEntityIdsForBeat(vw.vehicles, b.id, bb?.vehicleIds ?? []) : [];
    const factionIds = vw ? linkedEntityIdsForBeat(vw.factions, b.id, bb?.factionIds ?? []) : [];
    const beatPropIds = bb?.primaryPropIds?.length ? [...bb.primaryPropIds] : [];
    return {
      beatId: b.id,
      beatNumber: idx + 1,
      summary: b.summary,
      emotionalIntent: typeof b.emotionalDelta === "number" ? `delta_${b.emotionalDelta}` : "neutral",
      requiredCharacterIds: Array.isArray(b.characters) ? b.characters : [],
      requiredLocationId: typeof bb?.locationId === "string" && bb.locationId.trim() ? bb.locationId.trim() : null,
      requiredProps: beatPropIds,
      requiredNpcGroups: npcGroupIds,
      requiredCreatures: creatureIds,
      requiredVehicles: vehicleIds,
      requiredFactions: factionIds,
      visualEvents: [],
      dialogueRequired: false,
    };
  });

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

  const npcGroups: ContractNpcGroup[] = vw
    ? vw.npcGroups.map((g) => ({
        groupId: g.id,
        label: g.label,
        normalizedLabel: normalizeName(g.label),
        visualDescription: [g.role, g.visualProfile, g.outfit, g.silhouette].filter(Boolean).join(" · ").slice(0, 800),
        minCount: 1,
        maxCount: 24,
        sourceBeatId: g.requiredBeatIds[0],
      }))
    : [];

  const creatures: ContractCreature[] = vw
    ? vw.creatures.map((c) => ({
        creatureId: c.id,
        label: c.label,
        normalizedLabel: normalizeName(c.label),
        visualDescription: c.visualDescription,
        sourceBeatId: c.requiredBeatIds[0],
        refUrl: null,
      }))
    : [];

  const vehicles: ContractVehicle[] = vw
    ? vw.vehicles.map((v) => ({
        vehicleId: v.id,
        label: v.label,
        normalizedLabel: normalizeName(v.label),
        visualDescription: v.visualDescription,
        sourceBeatId: v.requiredBeatIds[0],
        refUrl: null,
      }))
    : [];

  const factions: ContractFaction[] = vw
    ? vw.factions.map((f) => ({
        factionId: f.id,
        label: f.label,
        normalizedLabel: normalizeName(f.label),
        visualDescription: [...f.visualMarkers, ...f.visualMotifs, ...f.colors].filter(Boolean).join(" · ").slice(0, 800),
        sourceBeatId: f.requiredBeatIds[0],
        refUrl: null,
      }))
    : [];

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

    const binding = vw ? bindingForBeat(vw, bp.beatId) : undefined;
    const envLoc =
      typeof bp.environmentVisualDna?.locationId === "string" && bp.environmentVisualDna.locationId.trim()
        ? bp.environmentVisualDna.locationId.trim()
        : null;
    const anchorLoc =
      typeof bp.environmentAnchorId === "string" && bp.environmentAnchorId.trim()
        ? bp.environmentAnchorId.trim()
        : null;
    const bindingLoc =
      typeof binding?.locationId === "string" && binding.locationId.trim() ? binding.locationId.trim() : null;
    const resolvedLocationId = envLoc || anchorLoc || bindingLoc || null;
    const panelNpcIds = vw ? npcIdsForBeat(vw, bp.beatId, binding?.npcGroupIds ?? []) : [];
    const panelCreatureIds = vw ? linkedEntityIdsForBeat(vw.creatures, bp.beatId, binding?.creatureIds ?? []) : [];
    const panelVehicleIds = vw ? linkedEntityIdsForBeat(vw.vehicles, bp.beatId, binding?.vehicleIds ?? []) : [];
    const panelFactionIds = vw ? linkedEntityIdsForBeat(vw.factions, bp.beatId, binding?.factionIds ?? []) : [];

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
      requiredLocationId: resolvedLocationId,
      requiredLocationSignals: [...(bp.requiredLocationSignals ?? [])],
      requiredProps: (bp.requiredProps ?? []).map((p) => p.canonicalName),
      requiredNpcGroups: panelNpcIds,
      requiredCreatures: panelCreatureIds,
      requiredVehicles: panelVehicleIds,
      requiredFactions: panelFactionIds,
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
    source: deriveContractSourceHashes(input),
    characters: contractChars,
    locations: contractLocs,
    props,
    npcGroups,
    creatures,
    vehicles,
    factions,
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
