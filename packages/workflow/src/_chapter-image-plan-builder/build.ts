import type { ImageIntentType } from "@manga-ai-studio/core";

import { resolveDominantSubjectForIntent } from "./dominant-subject";
import {
  resolveCameraIntent,
  resolveFramingIntent,
} from "./framing-camera";
import {
  forbiddenFocusForIntent,
  forbiddenFramingForIntent,
  forbiddenPromptClausesForIntent,
} from "./forbidden";
import { resolveHeroPresence } from "./hero-presence";
import { hasHero, resolveImageIntent } from "./intent-resolution";
import { prioritiesForIntent } from "./priorities";
import type {
  ChapterImagePlanBuilderInput,
  ChapterImagePlanItem,
  ChapterPanelPlanInput,
} from "./types";

function resolveSecondarySubjects(
  intent: ImageIntentType,
  panel: ChapterPanelPlanInput,
): string[] {
  const roles = panel.panelCharacterRoles ?? [];
  const subs: string[] = [];
  if (intent === "environment_establishing" && roles.length > 0) subs.push("hero");
  if (intent === "prop_insert" && roles.length > 0) subs.push("hero");
  if (intent === "guard_group_focus" && hasHero(roles)) subs.push("hero");
  if (intent === "crowd_presence" && hasHero(roles)) subs.push("hero");
  return subs;
}

export function buildChapterImagePlan(
  input: ChapterImagePlanBuilderInput,
): ChapterImagePlanItem[] {
  const items: ChapterImagePlanItem[] = [];

  for (const beat of input.beats) {
    for (const panel of beat.panels) {
      const intent = resolveImageIntent(panel, beat);
      const priorities = prioritiesForIntent(intent);
      const framingIntent = resolveFramingIntent(intent, panel);
      const cameraIntent = resolveCameraIntent(intent, panel);
      const dominantSubject = resolveDominantSubjectForIntent(intent);
      const hasHeroInPanel = hasHero(panel.panelCharacterRoles ?? []);
      const heroPresence = resolveHeroPresence(intent, hasHeroInPanel);

      const imageId = `${input.chapterId}__p${panel.pageIndex}__pnl${panel.panelIndex}`;

      items.push({
        imageId,
        projectId: input.projectId,
        chapterId: input.chapterId,
        pageIndex: panel.pageIndex,
        panelIndex: panel.panelIndex,
        beatIndex: beat.beatIndex,
        beatType: beat.beatType,
        beatId: beat.beatId,

        storyFunction: beat.storyFunction,
        imageIntentType: intent,
        dominantSubject,
        secondarySubjects: resolveSecondarySubjects(intent, panel),
        cutawayType: panel.cutawayType ?? null,

        cameraIntent,
        framingIntent,

        environmentPriority: priorities.environment,
        characterPriority: priorities.character,
        npcPriority: priorities.npc,
        propPriority: priorities.prop,
        groupPriority: priorities.group,

        requiredCharacters: panel.panelCharacterNames ?? [],
        requiredNpcs: panel.npcPresence ?? [],
        requiredProps: panel.requiredProps ?? [],
        requiredLocationSignals: panel.mustShowLocationSignals ?? [],
        requiredDialogueLines: panel.dialogueLines ?? [],
        requiredNarrativeContext: panel.narrativeContext ?? [],
        continuityAnchors: [],

        forbiddenFocus: forbiddenFocusForIntent(intent),
        forbiddenFraming: forbiddenFramingForIntent(intent),
        forbiddenPromptClauses: forbiddenPromptClausesForIntent(intent),

        targetLoras: [],
        targetCanonSources: [],
        promptLanguage: "en",
        contentRating: input.contentRating,
        mangaStyleProfile: input.mangaStyleProfile,

        heroPresenceMode: heroPresence.mode,
        heroVisualWeight: heroPresence.weight,
      });
    }
  }

  return items;
}
