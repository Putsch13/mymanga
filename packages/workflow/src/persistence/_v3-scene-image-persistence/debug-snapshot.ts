import { buildReaderPanelSlots, type GenerationDebugSnapshot } from "@manga-ai-studio/core";
import type {
  StoryboardPageV3 as StoryboardPage,
  StoryboardPanelV3 as StoryboardPanel,
} from "@manga-ai-studio/ai";
import type { SceneImageStatus } from "@manga-ai-studio/core";
import type { ResolvedPanelTextContract } from "./text-contract";
import type { PreparedPanelStorageMeta, V3RenderedPanelRecord } from "./types";

export function buildPanelDebugSnapshot(args: {
  panel: StoryboardPanel;
  page: StoryboardPage;
  record: V3RenderedPanelRecord;
  status: Extract<SceneImageStatus, "completed" | "failed" | "pending">;
  durableImageUrl: string | null;
  providerImageUrl: string | null;
  storageMeta: PreparedPanelStorageMeta;
  text: ResolvedPanelTextContract;
}): GenerationDebugSnapshot {
  const { panel, page, record, status, durableImageUrl, providerImageUrl, storageMeta, text } = args;

  const pageSlots = buildReaderPanelSlots({
    template: page.layoutTemplate,
    readingDirection: "rtl",
    panelIds: page.panels.map((pagePanel) => pagePanel.panelId),
  });
  const panelSlot = pageSlots.find((slot) => slot.panelId === panel.panelId) ?? null;

  return {
    version: "v2",
    panelId: panel.panelId,
    pageNumber: page.pageNumber,
    panelNumberInPage: panel.panelNumberInPage,
    readerLayout: {
      templateId: panel.readerTemplateId ?? `${page.layoutTemplate}_rtl`,
      readingDirection: "rtl",
      panelSlotArea: panelSlot?.area ?? null,
      panelSlotOrder: panelSlot?.order ?? null,
    },
    roster: [
      ...panel.characters.map((characterId) => ({
        entityId: characterId,
        entityType: "character" as const,
        displayName:
          record.spec.visibleCharacters.find((character) => character.characterId === characterId)?.name
          ?? characterId,
        presence: "must_show" as const,
        continuityNotes: panel.continuityNotes,
      })),
      ...(panel.npcs ?? []).map((npc) => ({
        entityId: npc.continuityId ?? npc.displayName ?? "npc",
        entityType: npc.category === "antagonist_enemy" ? ("enemy" as const) : ("npc" as const),
        displayName: npc.displayName ?? npc.continuityId ?? null,
        presence: "support" as const,
        continuityNotes: panel.continuityNotes,
      })),
    ],
    characterVisualDna: panel.characterVisualDna ?? [],
    npcVisualDna: panel.npcVisualDna ?? [],
    ...(Array.isArray(panel.creatureVisualDna) && panel.creatureVisualDna.length > 0
      ? { creatureVisualDna: panel.creatureVisualDna }
      : {}),
    ...(Array.isArray(panel.vehicleVisualDna) && panel.vehicleVisualDna.length > 0
      ? { vehicleVisualDna: panel.vehicleVisualDna }
      : {}),
    ...(Array.isArray(panel.factionVisualDna) && panel.factionVisualDna.length > 0
      ? { factionVisualDna: panel.factionVisualDna }
      : {}),
    environmentVisualDna:
      panel.environmentVisualDna
      ?? {
        locationName: record.spec.locationName,
        anchorId: panel.visualAnchors.environmentAnchorId ?? null,
        forbiddenDrift: record.spec.constraints.forbiddenDrift ?? [],
      },
    continuity: panel.continuityState ?? {
      previousPanelId: panel.visualAnchors.previousPanelAnchorId ?? null,
      previousEnvironmentAnchorId: panel.visualAnchors.environmentAnchorId ?? null,
      notes: panel.continuityNotes,
      mustPersist: panel.mustShow,
      mustAvoid: panel.mustNotShow,
    },
    text: {
      dialogues: text.legacyDialogueLines,
      narration: text.narrationPersist,
      sfx: text.sfxPersist,
      reservedZones: [],
      preferredAnchorZones: panel.textPlacementHint?.preferredAnchorZones ?? [],
      overflowStrategy: panel.textPlacementHint?.overflowStrategy ?? "caption_strip",
    },
    prompt: {
      positive: record.prompt.positive,
      negative: record.prompt.negative,
      provider: record.provider ?? null,
      model: record.model ?? null,
      routeModelId: record.route.modelId,
      referencePolicy: record.route.referencePolicy,
      seed: record.seed ?? null,
    },
    result: {
      status,
      imageUrl: durableImageUrl,
      providerImageUrl,
      storageBucket: storageMeta.bucket,
      storageKey: storageMeta.storageKey,
      error: record.error ?? null,
    },
  };
}
