/**
 * Fusionne les blueprints riches (beat builder / LLM) avec le plan canonique.
 *
 * Premium : le **plan canonique** impose la structure (cutaway, focus acteur, cadrage,
 * obligations de présence, signaux lieu, entités, dialogue vs cutaway). Les blueprints
 * bruts **enrichissent** le contenu éditorial (purpose, DNA visuel, dialogues sur slots
 * actor-driven) sans pouvoir recréer un plan invalide (ex. 75 % cutaway via clones padding).
 */

import type { CanonicalChapterProductionPlan, CanonicalPanelPlan } from "./canonical-production-plan";
import type { PanelBlueprintOrigin, PanelBlueprintPremium, PanelBlueprintProvenance } from "../types/narrative-facts";
import { canonicalPlanToPanelBlueprints } from "./canonical-to-premium-blueprints";

function cloneBlueprint(bp: PanelBlueprintPremium): PanelBlueprintPremium {
  return structuredClone(bp) as PanelBlueprintPremium;
}

function provenanceForMerge(args: {
  origin: PanelBlueprintOrigin;
  cp: CanonicalPanelPlan;
  rules: string[];
}): PanelBlueprintProvenance {
  return {
    origin: args.origin,
    canonicalPanelId: args.cp.panelId,
    canonicalBeatId: args.cp.beatId,
    appliedRules: args.rules,
  };
}

function propKey(p: PanelBlueprintPremium["requiredProps"][number]): string {
  const id = typeof p.id === "string" && p.id.length > 0 ? p.id : "";
  if (id) return id;
  return typeof p.canonicalName === "string" ? p.canonicalName : "";
}

function mergeRequiredProps(
  canonicalProps: PanelBlueprintPremium["requiredProps"],
  rawProps: PanelBlueprintPremium["requiredProps"],
): PanelBlueprintPremium["requiredProps"] {
  const byKey = new Map<string, PanelBlueprintPremium["requiredProps"][number]>();
  for (const prop of canonicalProps ?? []) {
    const k = propKey(prop);
    if (k) byKey.set(k, prop);
  }
  for (const prop of rawProps ?? []) {
    const k = propKey(prop);
    if (k && !byKey.has(k)) byKey.set(k, prop);
  }
  return [...byKey.values()];
}

function mergeNotes(canonicalNotes: string[] | undefined, rawNotes: string[] | undefined): string[] {
  return [...new Set([...(canonicalNotes ?? []), ...(rawNotes ?? [])])];
}

function overlayCanonicalStructure(
  rawBase: PanelBlueprintPremium,
  canonical: PanelBlueprintPremium,
  provenance: PanelBlueprintProvenance,
): PanelBlueprintPremium {
  const isCanonicalCutaway = canonical.cutawayType !== "none";

  return {
    ...rawBase,

    panelId: canonical.panelId,
    beatId: canonical.beatId,
    panelIndex: canonical.panelIndex,
    pageNumber: canonical.pageNumber,
    panelNumber: canonical.panelNumber,

    shotType: canonical.shotType,
    cameraAngle: canonical.cameraAngle,
    subjectFocus: canonical.subjectFocus,
    secondaryFocus: canonical.secondaryFocus ?? null,
    cutawayType: canonical.cutawayType,
    heroCenterAllowed: canonical.heroCenterAllowed,
    criticality: canonical.criticality,
    contractualCritical: canonical.contractualCritical,
    mangaPanelFunction: canonical.mangaPanelFunction ?? rawBase.mangaPanelFunction,
    renderMode: canonical.renderMode ?? rawBase.renderMode,
    referencePolicy: canonical.referencePolicy ?? rawBase.referencePolicy,

    requiredCharacters:
      canonical.requiredCharacters?.length
        ? canonical.requiredCharacters
        : (canonical.requiredCharacterIds ?? []),
    requiredCharacterIds: [...(canonical.requiredCharacterIds ?? [])],
    mustShowCharacterIds: [...(canonical.mustShowCharacterIds ?? [])],
    mayShowCharacterIds: [...(canonical.mayShowCharacterIds ?? [])],
    requiredEntityIds: [...(canonical.requiredEntityIds ?? [])],
    mustShowEnemy: canonical.mustShowEnemy,
    requiredNpcCount: canonical.requiredNpcCount,

    requiredLocationSignals: [...(canonical.requiredLocationSignals ?? [])],
    requiredProps: mergeRequiredProps(canonical.requiredProps, rawBase.requiredProps),
    optionalProps: rawBase.optionalProps,

    dialogueCarrier: isCanonicalCutaway ? undefined : canonical.dialogueCarrier,
    speakerAnchorCharacterId: isCanonicalCutaway ? null : canonical.speakerAnchorCharacterId,
    speakerAnchorCharacterName: isCanonicalCutaway ? null : canonical.speakerAnchorCharacterName ?? null,
    dialogueLinesAnchored: isCanonicalCutaway ? undefined : canonical.dialogueLinesAnchored,

    dialogueLines: isCanonicalCutaway
      ? undefined
      : rawBase.dialogueLines?.length
        ? rawBase.dialogueLines
        : canonical.dialogueLines,

    narrationText: isCanonicalCutaway ? null : rawBase.narrationText ?? canonical.narrationText ?? null,

    sfxCues: isCanonicalCutaway ? undefined : rawBase.sfxCues ?? canonical.sfxCues,

    panelTextBundle: isCanonicalCutaway ? null : rawBase.panelTextBundle ?? canonical.panelTextBundle ?? null,

    purpose: rawBase.purpose?.trim() ? rawBase.purpose : canonical.purpose,
    sceneContextLabel: rawBase.sceneContextLabel ?? canonical.sceneContextLabel ?? null,
    readerTemplateId: rawBase.readerTemplateId ?? canonical.readerTemplateId ?? null,
    textPlacementHint: rawBase.textPlacementHint ?? canonical.textPlacementHint ?? null,
    presenceObligations: rawBase.presenceObligations ?? canonical.presenceObligations,
    characterVisualDna: rawBase.characterVisualDna ?? canonical.characterVisualDna,
    npcVisualDna: rawBase.npcVisualDna ?? canonical.npcVisualDna,
    environmentVisualDna: rawBase.environmentVisualDna ?? canonical.environmentVisualDna ?? null,
    continuityState: rawBase.continuityState ?? canonical.continuityState ?? null,
    sceneRoster: rawBase.sceneRoster ?? canonical.sceneRoster,
    requiredSubjects: rawBase.requiredSubjects ?? canonical.requiredSubjects,

    notes: mergeNotes(canonical.notes, rawBase.notes),
    provenance,
  };
}

/**
 * @param rawBlueprints — ordre cohérent avec les beats (ex. flatMap des beats enrichis)
 * @param canonicalPlan — plan canonique déjà validé (QA rythme / pages)
 */
export function mergeRawBlueprintsWithCanonicalRhythm(
  rawBlueprints: PanelBlueprintPremium[],
  canonicalPlan: CanonicalChapterProductionPlan,
): PanelBlueprintPremium[] {
  if (rawBlueprints.length === 0) {
    return canonicalPlanToPanelBlueprints(canonicalPlan);
  }

  const canonicalBlueprints = canonicalPlanToPanelBlueprints(canonicalPlan);
  const canonicalByPanelId = new Map(canonicalBlueprints.map((bp) => [bp.panelId, bp] as const));

  const queues = new Map<string, PanelBlueprintPremium[]>();
  for (const bp of rawBlueprints) {
    const list = queues.get(bp.beatId) ?? [];
    list.push(bp);
    queues.set(bp.beatId, list);
  }
  const scratch = new Map<string, PanelBlueprintPremium[]>();
  for (const [beatId, list] of queues) {
    scratch.set(beatId, [...list]);
  }

  const lastConsumedByBeat = new Map<string, PanelBlueprintPremium>();

  return canonicalPlan.panels.map((cp) => {
    const canonical = canonicalByPanelId.get(cp.panelId);
    if (!canonical) {
      throw new Error(`merge_raw_blueprints_with_canonical_rhythm:no_canonical_for_panel:${cp.panelId}`);
    }

    const q = scratch.get(cp.beatId);
    let raw: PanelBlueprintPremium | null = null;
    if (q && q.length > 0) {
      raw = q.shift()!;
      lastConsumedByBeat.set(cp.beatId, raw);
    }

    let base: PanelBlueprintPremium;
    let origin: PanelBlueprintOrigin;
    let appliedRules: string[];
    if (raw) {
      base = cloneBlueprint(raw);
      origin = "author_raw_merged";
      appliedRules = ["merge_raw_with_canonical_rhythm"];
    } else {
      const last = lastConsumedByBeat.get(cp.beatId);
      if (last) {
        base = cloneBlueprint(last);
        const note = "rhythm_padding:cloned_from_last_panel_in_beat";
        base.notes = [...(base.notes ?? []), note];
        origin = "rhythm_padding_clone";
        appliedRules = ["merge_raw_with_canonical_rhythm", "rhythm_padding_clone_within_beat"];
      } else {
        base = cloneBlueprint(canonical);
        base.dialogueLines = undefined;
        base.panelTextBundle = base.panelTextBundle
          ? { ...base.panelTextBundle, dialogues: undefined }
          : null;
        origin = "rhythm_padding_canonical_fallback";
        appliedRules = ["merge_raw_with_canonical_rhythm", "rhythm_padding_canonical_slot_fallback"];
      }
    }

    return overlayCanonicalStructure(
      base,
      canonical,
      provenanceForMerge({ origin, cp, rules: appliedRules }),
    );
  });
}
