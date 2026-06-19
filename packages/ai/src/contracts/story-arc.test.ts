import { describe, expect, it } from "vitest";
import type { StoryArc } from "./story-arc";
import { STORY_BEAT_TYPES } from "./story-arc";
import { createEmptyContinuityState } from "./continuity-state";

describe("StoryArc contract", () => {
  it("déclare tous les types de beats attendus", () => {
    expect(STORY_BEAT_TYPES).toContain("setup");
    expect(STORY_BEAT_TYPES).toContain("combat");
    expect(STORY_BEAT_TYPES).toContain("cliffhanger");
    expect(STORY_BEAT_TYPES).toContain("transition");
    expect(STORY_BEAT_TYPES.length).toBe(9);
  });

  it("accepte un StoryArc minimal bien formé (test type-level via runtime)", () => {
    const arc: StoryArc = {
      chapterId: "ch-1",
      chapterNumber: 1,
      title: "Ouverture",
      summary: "intro",
      chapterGoal: "présenter le protagoniste",
      cliffhanger: "une silhouette apparaît",
      continuityBefore: createEmptyContinuityState(),
      continuityAfter: createEmptyContinuityState(),
      beats: [
        {
          beatId: "b1",
          order: 1,
          type: "setup",
          purpose: "installer",
          storyEvent: "Le héros arrive en ville.",
          locationId: null,
          locationName: "ville",
          charactersPresent: ["hero"],
          emotionalTurn: "curiosité",
          dialogueIntent: null,
          mustReveal: [],
          mustPreserve: [],
          mustNotInvent: [],
          dangerLevel: "low",
          continuityEffects: {
            stateChanges: [],
            itemsIntroduced: [],
            informationLearned: [],
          },
        },
      ],
    };
    expect(arc.beats[0]!.type).toBe("setup");
  });
});
