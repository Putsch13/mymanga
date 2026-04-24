/**
 * Enrichissement des PanelRenderSpec juste avant generatePanelImage :
 * ADN, continuité, layout, texte — sans modifier renderMode / shotType (décidés en amont).
 */

import type {
  ChapterVisualMemory,
  FalRenderRoute,
  PanelRenderCharacterVisualDna,
  PanelRenderPreviousPanelRef,
  PanelRenderSpec,
  PanelRenderVisibleCharacter,
} from "@manga-ai-studio/ai";
import type { StoryboardPanel } from "@manga-ai-studio/ai/contracts";

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
    if (c.visualDNA) return c;
    const partial: PanelRenderCharacterVisualDna = {};
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
}

export function enrichPanelRenderSpecForRenderPass(input: EnrichPanelRenderSpecInput): PanelRenderSpec {
  const { spec, panel, visualMemory, mainCharacterIds, route, previousPanel } = input;
  const base = spec.layoutMeta ?? {};
  return {
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
    panelTextPayload: {
      dialogue: [...panel.dialogue],
      narration: panel.narration ?? null,
      sfx: [...(panel.sfx ?? [])],
    },
  };
}
