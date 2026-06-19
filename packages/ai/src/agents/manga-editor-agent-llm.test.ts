import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { runMangaEditorAgentLlm } from "./manga-editor-agent-llm";
import type { StoryArc } from "../contracts/story-arc";
import { createEmptyContinuityState } from "../contracts/continuity-state";

function makeStoryArc(): StoryArc {
  return {
    chapterId: "ch-1",
    chapterNumber: 1,
    title: "Chapter One",
    summary: "The hero investigates a strange event",
    chapterGoal: "Discover the truth behind the accident",
    cliffhanger: "A new enemy appears",
    continuityBefore: createEmptyContinuityState(),
    continuityAfter: createEmptyContinuityState(),
    beats: [
      {
        beatId: "b1",
        order: 1,
        type: "setup",
        purpose: "introduce hero",
        storyEvent: "hero walks to school",
        locationId: null,
        locationName: "street",
        charactersPresent: ["hero-1"],
        emotionalTurn: "calm",
        dialogueIntent: null,
        mustReveal: [],
        mustPreserve: [],
        mustNotInvent: [],
        dangerLevel: "low",
        continuityEffects: { stateChanges: [], itemsIntroduced: [], informationLearned: [] },
      },
      {
        beatId: "b2",
        order: 2,
        type: "reveal",
        purpose: "find clue",
        storyEvent: "hero notices a letter",
        locationId: null,
        locationName: "classroom",
        charactersPresent: ["hero-1"],
        emotionalTurn: "curious",
        dialogueIntent: null,
        mustReveal: ["the letter"],
        mustPreserve: [],
        mustNotInvent: ["combat"],
        dangerLevel: "low",
        continuityEffects: { stateChanges: [], itemsIntroduced: ["letter"], informationLearned: [] },
      },
    ],
  };
}

describe("runMangaEditorAgentLlm", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });
  afterEach(() => {
    if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
  });

  it("fallback sur stub déterministe sans OPENAI_API_KEY, remonte un warning dédié", async () => {
    const res = await runMangaEditorAgentLlm({
      storyArc: makeStoryArc(),
      heroCharacterIds: ["hero-1"],
    });
    expect(res.storyboardPlan.pages.length).toBeGreaterThan(0);
    expect(res.warnings).toContain("manga_editor.llm.degraded=OPENAI_API_KEY_missing");
  });

  it("le StoryboardPlan fallback reste structurellement valide (chaque panel a un sourceBeatId connu)", async () => {
    const arc = makeStoryArc();
    const res = await runMangaEditorAgentLlm({ storyArc: arc, heroCharacterIds: ["hero-1"] });
    const validBeatIds = new Set(arc.beats.map((b) => b.beatId));
    for (const page of res.storyboardPlan.pages) {
      for (const panel of page.panels) {
        expect(validBeatIds.has(panel.sourceBeatId)).toBe(true);
      }
    }
  });
});
