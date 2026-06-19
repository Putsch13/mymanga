import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock les dépendances externes
vi.mock("@manga-ai-studio/ai", () => ({
  runStoryArchitectAgent: vi.fn().mockResolvedValue({
    storyArc: {
      chapterId: "ch-1",
      chapterNumber: 1,
      title: "Test Chapter",
      summary: "Test summary",
      chapterGoal: "Test goal",
      cliffhanger: "Test cliffhanger",
      beats: [
        {
          beatId: "ch-1-beat-1",
          order: 1,
          type: "setup",
          purpose: "intro",
          storyEvent: "Lux et Kai entrent dans le temple",
          locationId: "temple-1",
          locationName: "temple",
          charactersPresent: ["Lux", "Kai"],
          emotionalTurn: "curiosité",
          dialogueIntent: null,
          mustReveal: [],
          mustPreserve: [],
          mustNotInvent: [],
          dangerLevel: "low",
          continuityEffects: { stateChanges: [], itemsIntroduced: [], informationLearned: [] },
        },
      ],
      continuityBefore: { lastKnownLocations: [], lastKnownEvents: [], characterStates: {}, worldState: {} },
      continuityAfter: { lastKnownLocations: [], lastKnownEvents: [], characterStates: {}, worldState: {} },
    },
    warnings: [],
  }),
  runStoryArchitectAgentLlm: vi.fn().mockResolvedValue({
    storyArc: {
      chapterId: "ch-1",
      chapterNumber: 1,
      title: "Test Chapter",
      summary: "Test summary",
      chapterGoal: "Test goal",
      cliffhanger: "Test cliffhanger",
      beats: [
        {
          beatId: "ch-1-beat-1",
          order: 1,
          type: "setup",
          purpose: "intro",
          storyEvent: "Lux et Kai entrent dans le temple",
          locationId: "temple-1",
          locationName: "temple",
          charactersPresent: ["Lux", "Kai"],
          emotionalTurn: "curiosité",
          dialogueIntent: null,
          mustReveal: [],
          mustPreserve: [],
          mustNotInvent: [],
          dangerLevel: "low",
          continuityEffects: { stateChanges: [], itemsIntroduced: [], informationLearned: [] },
        },
      ],
      continuityBefore: { lastKnownLocations: [], lastKnownEvents: [], characterStates: {}, worldState: {} },
      continuityAfter: { lastKnownLocations: [], lastKnownEvents: [], characterStates: {}, worldState: {} },
    },
    warnings: [],
  }),
}));

vi.mock("@manga-ai-studio/core", () => ({
  isPremiumStrictMode: vi.fn().mockReturnValue(false),
}));

vi.mock("../persistence/story-persistence", () => ({
  saveStoryArc: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../pipeline-feature-flags", () => ({
  isPipelineV3PremiumOnlyEnabled: vi.fn().mockReturnValue(false),
  isPipelineV3StoryArchitectLlmEnabled: vi.fn().mockReturnValue(false),
}));

import { runStoryPass } from "./story-pass";
import { runStoryArchitectAgent, runStoryArchitectAgentLlm } from "@manga-ai-studio/ai";

describe("runStoryPass (TODO-14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passe le narrativeContract au Story Architect", async () => {
    const narrativeContract = {
      requiredCharacters: ["lux_id", "kai_id"],
      requiredLocations: ["temple"],
      requiredEvents: [
        {
          id: "e1",
          label: "entrée dans le temple",
          type: "action",
          requiredDialogue: false,
          locationHint: "temple",
        },
      ],
      forbiddenInventions: ["personnage inventé"],
    };

    await runStoryPass({
      chapterId: "ch-1",
      chapterNumber: 1,
      title: "Test",
      userIntent: "Lux et lui entrent dans le temple.",
      mainCharacters: [
        { id: "lux_id", name: "Lux", roleType: "hero" },
        { id: "kai_id", name: "Kai", roleType: "secondary_hero" },
      ],
      narrativeContract,
    });

    expect(runStoryArchitectAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        narrativeContract: expect.objectContaining({
          requiredCharacters: ["lux_id", "kai_id"],
          requiredLocations: ["temple"],
        }),
      }),
    );
  });

  it("passe null si narrativeContract n'est pas fourni", async () => {
    await runStoryPass({
      chapterId: "ch-1",
      chapterNumber: 1,
      title: "Test",
      userIntent: "Lux explore la forêt.",
    });

    expect(runStoryArchitectAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        narrativeContract: null,
      }),
    );
  });

  it("inclut les requiredEvents avec leurs propriétés dans le contrat", async () => {
    const narrativeContract = {
      requiredCharacters: ["lux_id"],
      requiredLocations: ["forêt"],
      requiredEvents: [
        {
          id: "evt-dialogue-1",
          label: "Lux avertit les pêcheurs",
          type: "dialogue",
          requiredDialogue: true,
          locationHint: "port",
        },
      ],
      forbiddenInventions: [],
    };

    await runStoryPass({
      chapterId: "ch-1",
      chapterNumber: 1,
      title: "Test",
      userIntent: "Lux avertit les pêcheurs du danger.",
      narrativeContract,
    });

    expect(runStoryArchitectAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        narrativeContract: expect.objectContaining({
          requiredEvents: expect.arrayContaining([
            expect.objectContaining({
              id: "evt-dialogue-1",
              requiredDialogue: true,
              type: "dialogue",
            }),
          ]),
        }),
      }),
    );
  });
});
