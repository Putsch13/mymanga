import type { CanonicalBeatPlan } from "../canonical-production-plan";
import type { NormalizedBeat } from "../normalize-outline";
import {
  filterOutResolvedNpcGroupRefs,
  type NpcGroupRefForResolution,
} from "../resolve-character-refs";

export function buildBeatPlan(
  beat: NormalizedBeat,
  panelIds: string[],
  knownNpcGroups?: readonly NpcGroupRefForResolution[],
  knownCharacters?: readonly {
    id: string;
    name?: string | null;
    displayName?: string | null;
  }[],
): CanonicalBeatPlan {
  let unresolvedRefs = beat.unresolvedCharacterRefs ?? [];
  if (
    unresolvedRefs.length > 0 &&
    ((knownNpcGroups?.length ?? 0) > 0 || (knownCharacters?.length ?? 0) > 0)
  ) {
    unresolvedRefs = filterOutResolvedNpcGroupRefs(
      unresolvedRefs,
      (knownNpcGroups ?? []) as NpcGroupRefForResolution[],
      (knownCharacters ?? []).map((c) => ({
        id: c.id,
        name: c.name ?? undefined,
        displayName: c.displayName ?? undefined,
      })),
    );
  }

  return {
    beatId: beat.beatId,
    beatIndex: beat.beatIndex,
    summary: beat.summary,
    narrativeFunction: beat.narrativeFunction,
    dramaticChange: beat.dramaticChange,
    involvedCharacters: beat.involvedCharacters,
    environmentContext: beat.environmentContext,
    targetPanelCount: beat.estimatedPanels,
    actualPanelCount: panelIds.length,
    panelIds,
    hasDialogue: beat.hasDialogue,
    hasAction: beat.hasAction,
    hasEmotion: beat.hasEmotion,
    hasTension: beat.hasTension,
    unresolvedCharacterRefs: unresolvedRefs,
  };
}
