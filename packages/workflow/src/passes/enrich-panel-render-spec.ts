/**
 * Enrichissement des PanelRenderSpec juste avant generatePanelImage :
 * ADN, continuité, layout, texte, LoRA — sans modifier renderMode / shotType.
 *
 * Texte panel : `panelTextPayload` est dérivé via `buildPanelTextContractFromFragments`
 * (même règles que le contrat de génération chapitre) pour éviter la divergence
 * dialogue / narration / SFX entre chemins parallèles.
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
import type { PanelTextBundle, PanelTextContract } from "@manga-ai-studio/core";
import {
  buildPanelTextContractFromFragments,
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

function resolveEnvironmentDna(
  panel: StoryboardPanel,
  memory: ChapterVisualMemory,
): Record<string, unknown> | null {
  const anchorId = panel.visualAnchors?.environmentAnchorId;
  if (anchorId) {
    const env = memory.environments.get(anchorId);
    if (env) {
      return {
        anchorId: env.anchorId,
        locationId: env.locationId,
        locationName: env.locationName,
        refUrl: env.refUrl,
        defaultWeight: env.defaultWeight,
      };
    }
  }
  const locName = panel.locationName?.trim();
  if (locName) {
    for (const env of memory.environments.values()) {
      if (env.locationName === locName) {
        return {
          anchorId: env.anchorId,
          locationId: env.locationId,
          locationName: env.locationName,
          refUrl: env.refUrl,
          defaultWeight: env.defaultWeight,
        };
      }
    }
  }
  return null;
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
  const p = panel as StoryboardPanelWithOptionalTextBundle;
  const textContract = buildPanelTextContractFromFragments({
    panelId: panel.panelId,
    dialogueLines: panel.dialogue?.length ? panel.dialogue : null,
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
