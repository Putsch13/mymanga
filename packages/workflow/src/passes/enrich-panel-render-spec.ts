/**
 * Enrichissement des PanelRenderSpec juste avant generatePanelImage :
 * ADN, continuité, layout, texte, LoRA — sans modifier renderMode / shotType.
 *
 * Texte panel : `panelTextPayload` + `PanelTextContract` via
 * `resolvePanelTextContractFromStoryboardPanelLike` (PR9, contrat embarqué prioritaire).
 */

import type {
  ChapterVisualMemory,
  FalRenderRoute,
  PanelRenderCharacterVisualDna,
  PanelRenderPanelTextPayload,
  PanelRenderPreviousPanelRef,
  PanelRenderSpec,
  PanelRenderVisibleCharacter,
} from "@manga-ai-studio/ai";
import type { StoryboardPanel } from "@manga-ai-studio/ai/contracts";
import type { EnvironmentVisualDna, PanelTextBundle, PanelTextContract } from "@manga-ai-studio/core";
import {
  resolvePanelTextContractFromStoryboardPanelLike,
  textContractToLegacyDialogue,
} from "@manga-ai-studio/core";
import {
  buildLoraByCharacterIdMap,
  resolvePanelLoraBindings,
  type LoraInfo,
} from "./resolve-panel-lora-bindings";

function semanticAspectFromSizePreset(preset: FalRenderRoute["sizePreset"]): "portrait" | "landscape" | "square" {
  if (preset === "portrait") return "portrait";
  if (preset === "landscape") return "landscape";
  return "square";
}

function resolveHeroCharacterId(
  panel: StoryboardPanel,
  mainCharacterIds: string[],
): string | null {
  const mains = new Set(mainCharacterIds.filter(Boolean));
  const anchorIds = panel.visualAnchors?.characterIds ?? [];
  for (const id of anchorIds) {
    if (mains.has(id)) return id;
  }
  for (const idOrName of panel.characters) {
    if (mains.has(idOrName)) return idOrName;
  }
  const firstMain = mainCharacterIds.find((id) => panel.characters.includes(id));
  return firstMain ?? null;
}

function buildMandatoryVisibleEntities(spec: PanelRenderSpec, panel: StoryboardPanel): string[] {
  const out = new Set<string>();
  for (const m of spec.constraints.mustShow) {
    if (typeof m === "string" && m.trim()) out.add(m.trim());
  }
  for (const id of panel.characters) {
    if (typeof id === "string" && id.trim()) out.add(id.trim());
  }
  for (const c of spec.visibleCharacters) {
    if (c.characterId) out.add(c.characterId);
    if (c.name) out.add(c.name);
  }
  return [...out];
}

/**
 * Fusionne `panel.environmentVisualDna` (hydraté depuis VisualWorldContract / studio)
 * dans le record passé au prompt (`formatEnvironmentDnaForPrompt` lit les mêmes clés
 * ou leurs alias : `lightingHints`, `propAnchors`, `forbiddenDrift`, `visualAnchors`).
 */
function mergeBlueprintEnvironmentVisualDna(
  record: Record<string, unknown>,
  dna: EnvironmentVisualDna | null | undefined,
): void {
  if (!dna) return;
  if (dna.visualAnchors?.length) {
    record.visualAnchors = dna.visualAnchors;
  }
  if (dna.architectureHints?.length) {
    record.architectureHints = dna.architectureHints;
  }
  if (dna.atmosphere?.length) {
    record.atmosphere = dna.atmosphere;
  }
  if (dna.lightingHints?.length) {
    record.lightingHints = dna.lightingHints;
  }
  if (dna.propAnchors?.length) {
    record.propAnchors = dna.propAnchors;
  }
  if (dna.forbiddenDrift?.length) {
    record.forbiddenDrift = dna.forbiddenDrift;
  }
  const loc = typeof dna.locationName === "string" ? dna.locationName.trim() : "";
  if (loc && !record.description) {
    record.description = loc;
  }
}

function resolveEnvironmentDna(
  panel: StoryboardPanel,
  memory: ChapterVisualMemory,
): Record<string, unknown> | null {
  const record: Record<string, unknown> = {};

  const anchorId = panel.visualAnchors?.environmentAnchorId;
  if (anchorId) {
    const env = memory.environments.get(anchorId);
    if (env) {
      record.anchorId = env.anchorId;
      record.locationId = env.locationId;
      record.locationName = env.locationName;
      record.refUrl = env.refUrl;
      record.defaultWeight = env.defaultWeight;
    }
  }

  const locName = panel.locationName?.trim();
  if (locName && !record.locationName) {
    for (const env of memory.environments.values()) {
      if (env.locationName === locName) {
        record.anchorId = env.anchorId;
        record.locationId = env.locationId;
        record.locationName = env.locationName;
        record.refUrl = env.refUrl;
        record.defaultWeight = env.defaultWeight;
        break;
      }
    }
  }

  mergeBlueprintEnvironmentVisualDna(record, panel.environmentVisualDna);

  return Object.keys(record).length > 0 ? record : null;
}

export type StoryboardPanelWithOptionalTextBundle = StoryboardPanel & {
  panelTextBundle?: PanelTextBundle | null;
};

/**
 * Construit le payload texte render + lignes dialogue pour résolution LoRA,
 * à partir du storyboard et optionnellement d’un `panelTextBundle` collé
 * sur l’objet panel (compat forward sans élargir encore le type contrat IA).
 */
export function buildPanelRenderTextPayloadFromStoryboardPanel(
  panel: StoryboardPanel,
): {
  panelTextPayload: PanelRenderPanelTextPayload;
  dialogueForSpeakers: Array<{ speaker: string; text: string }>;
  textContract: PanelTextContract;
} {
  const p = panel as StoryboardPanelWithOptionalTextBundle & {
    dialogues?: Array<{ speaker: string; text: string }> | null;
  };
  const textContract = resolvePanelTextContractFromStoryboardPanelLike({
    panelId: panel.panelId,
    textContract: p.textContract,
    dialogue: Array.isArray(panel.dialogue) && panel.dialogue.length > 0 ? panel.dialogue : null,
    dialogues:
      (!panel.dialogue || panel.dialogue.length === 0) && Array.isArray(p.dialogues) && p.dialogues.length > 0
        ? p.dialogues
        : null,
    narration: panel.narration ?? null,
    sfx: panel.sfx ?? null,
    panelTextBundle: p.panelTextBundle ?? null,
  });
  const dialogueForSpeakers = textContractToLegacyDialogue(textContract);
  return {
    panelTextPayload: {
      dialogue: dialogueForSpeakers,
      narration: textContract.narration ?? null,
      sfx: textContract.sfx.map((e) => e.text),
    },
    dialogueForSpeakers,
    textContract,
  };
}

function resolvePreviousPanelRef(
  spec: PanelRenderSpec,
  previousPanel: StoryboardPanel | null,
  memory: ChapterVisualMemory,
): PanelRenderPreviousPanelRef | null {
  const fromSpec = spec.imageReferences.panelRefs[0];
  if (fromSpec) {
    return { panelId: fromSpec.panelId, url: fromSpec.url, weight: fromSpec.weight };
  }
  const anchorId = previousPanel?.panelId;
  if (!anchorId) return null;
  const hit = memory.recentPanels.find((p) => p.panelId === anchorId);
  if (hit) return { panelId: hit.panelId, url: hit.refUrl, weight: hit.defaultWeight };
  return { panelId: anchorId, url: null };
}

function enrichVisibleVisualDna(chars: PanelRenderVisibleCharacter[]): PanelRenderVisibleCharacter[] {
  return chars.map((c) => {
    const partial: PanelRenderCharacterVisualDna = { ...(c.visualDNA ?? {}) };
    if (c.eyeColor) partial.eyeColor = c.eyeColor;
    if (c.hairColor) partial.hairColor = c.hairColor;
    const keys = Object.keys(partial).length;
    return keys > 0 ? { ...c, visualDNA: partial } : c;
  });
}

export interface EnrichPanelRenderSpecInput {
  spec: PanelRenderSpec;
  panel: StoryboardPanel;
  visualMemory: ChapterVisualMemory;
  mainCharacterIds: string[];
  route: FalRenderRoute;
  previousPanel: StoryboardPanel | null;
  /** LoRA actifs par personnage (URL + trigger) — typiquement depuis le job DB. */
  loraByCharacterId?: Map<string, LoraInfo>;
}

function mergeEnvironmentForbiddenIntoConstraints(
  constraints: PanelRenderSpec["constraints"],
  env: StoryboardPanel["environmentVisualDna"],
): PanelRenderSpec["constraints"] {
  const fromEnv = env?.forbiddenDrift;
  if (!Array.isArray(fromEnv) || fromEnv.length === 0) return constraints;
  const seen = new Set(constraints.forbiddenDrift.map((s) => s.toLowerCase()));
  const merged = [...constraints.forbiddenDrift];
  for (const raw of fromEnv) {
    const x = typeof raw === "string" ? raw.trim() : "";
    if (!x) continue;
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(x);
  }
  return { ...constraints, forbiddenDrift: merged };
}

export function enrichPanelRenderSpecForRenderPass(input: EnrichPanelRenderSpecInput): PanelRenderSpec {
  const { spec, panel, visualMemory, mainCharacterIds, route, previousPanel } = input;
  const base = spec.layoutMeta ?? {};

  const { panelTextPayload, dialogueForSpeakers } = buildPanelRenderTextPayloadFromStoryboardPanel(panel);

  const speakerCharacterIds: string[] = [];
  for (const line of dialogueForSpeakers) {
    const speaker = typeof line.speaker === "string" ? line.speaker.trim() : "";
    if (!speaker) continue;
    const hit = spec.visibleCharacters.find(
      (v) => v.name.toLowerCase() === speaker.toLowerCase() || v.characterId === speaker,
    );
    if (hit) speakerCharacterIds.push(hit.characterId);
  }

  const loraMap = input.loraByCharacterId ?? new Map<string, LoraInfo>();
  const loraResult = resolvePanelLoraBindings({
    panelId: spec.panelId,
    visibleCharacters: spec.visibleCharacters.map((c) => ({
      characterId: c.characterId,
      name: c.name,
      role: c.role,
    })),
    loraByCharacterId: loraMap,
    speakerCharacterIds,
    focusCharacterId: spec.heroCharacterId ?? resolveHeroCharacterId(panel, mainCharacterIds),
  });

  const merged: PanelRenderSpec = {
    ...spec,
    constraints: mergeEnvironmentForbiddenIntoConstraints(spec.constraints, panel.environmentVisualDna),
    visibleCharacters: enrichVisibleVisualDna(spec.visibleCharacters),
    layoutMeta: {
      layoutHint: base.layoutHint ?? panel.layoutHint ?? null,
      targetAspectRatio:
        base.targetAspectRatio ?? panel.targetAspectRatio ?? semanticAspectFromSizePreset(route.sizePreset),
      slotType: base.slotType ?? panel.slotType ?? route.panelCategory,
    },
    heroCharacterId: resolveHeroCharacterId(panel, mainCharacterIds),
    mandatoryVisibleEntities: buildMandatoryVisibleEntities(spec, panel),
    environmentDNA: resolveEnvironmentDna(panel, visualMemory),
    previousPanelRef: resolvePreviousPanelRef(spec, previousPanel, visualMemory),
    panelTextPayload,
    loraBindings: loraResult.loraBindings.length > 0 ? loraResult.loraBindings : spec.loraBindings,
  };

  return merged;
}

export { buildLoraByCharacterIdMap } from "./resolve-panel-lora-bindings";
