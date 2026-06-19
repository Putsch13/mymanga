/**
 * LEGACY FALLBACK ONLY.
 * Must not be used by the premium generation path as the primary NPC source.
 * Premium must use VisualWorldContract + VisualWorldComposer (npcGroups).
 */

import {
  detectNpcGroupsFromText,
  mergeBlueprintAndTextNpcGroups,
  type LegacyNpcGroupForCast,
} from "./legacy-npc-regex-from-text";

export type { LegacyNpcGroupForCast } from "./legacy-npc-regex-from-text";

export function mergeNpcGroupsFromBlueprintsAndStoryTextRegex(input: {
  npcGroupsFromBlueprints: LegacyNpcGroupForCast[];
  chapterSummary: string | null;
  chapterUserIntent: string | null;
  beatTexts: Array<string | null | undefined>;
}): { merged: LegacyNpcGroupForCast[]; map: Map<string, LegacyNpcGroupForCast> } {
  const npcGroupsFromText = detectNpcGroupsFromText([
    input.chapterSummary,
    input.chapterUserIntent,
    ...input.beatTexts,
  ]);
  return mergeBlueprintAndTextNpcGroups(input.npcGroupsFromBlueprints, npcGroupsFromText);
}
