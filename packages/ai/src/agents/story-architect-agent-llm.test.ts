import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyContinuityState } from "../contracts/continuity-state";
import type { StoryArc } from "../contracts/story-arc";
import {
  runStoryArchitectAgentLlm,
  validatePremiumStoryArcConstraints,
  PremiumStoryArchitectOpenAiRequiredError,
} from "./story-architect-agent-llm";

const baseInput = {
  chapterId: "ch1",
  chapterNumber: 1,
  title: "T1",
  userIntent: "Test intent",
  summary: "Summary",
  targetBeatCount: 6,
  mainCharacters: [{ id: "h1", name: "Hero", roleType: "hero" }],
  locations: [{ id: "l1", name: "Café" }],
};

describe("runStoryArchitectAgentLlm — premiumOnly fail-hard", () => {
  const origKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_PIPELINE_V3_PREMIUM_ONLY", "");
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (origKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = origKey;
    }
  });

  it("premiumOnly + clé absente => throw", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(
      runStoryArchitectAgentLlm({ ...baseInput, premiumOnly: true }),
    ).rejects.toThrow(PremiumStoryArchitectOpenAiRequiredError);
  });

  it("sans premiumOnly + clé absente => stub avec warning", async () => {
    delete process.env.OPENAI_API_KEY;
    const out = await runStoryArchitectAgentLlm({ ...baseInput, premiumOnly: false });
    expect(out.warnings.some((w) => w.includes("OPENAI_API_KEY"))).toBe(true);
    expect(out.storyArc.beats.length).toBeGreaterThanOrEqual(4);
  });

  it("premium strict sans premiumOnly => refuse le chemin stub", async () => {
    vi.stubEnv("NEXT_PUBLIC_PIPELINE_V3_PREMIUM_ONLY", "true");
    delete process.env.OPENAI_API_KEY;
    await expect(runStoryArchitectAgentLlm({ ...baseInput, premiumOnly: false })).rejects.toThrow(
      /premium_story_architect_stub_forbidden_under_strict_env/,
    );
  });
});

describe("validatePremiumStoryArcConstraints", () => {
  const baseArc = (beats: StoryArc["beats"]): StoryArc => ({
    chapterId: "ch1",
    chapterNumber: 1,
    title: "T",
    summary: "S",
    chapterGoal: "G",
    cliffhanger: "C",
    continuityBefore: createEmptyContinuityState(),
    continuityAfter: createEmptyContinuityState(),
    beats,
  });

  it("rejette un personnage absent de la fiche", () => {
    const arc = baseArc([
      {
        beatId: "b1",
        order: 1,
        type: "setup",
        purpose: "p",
        storyEvent: "e",
        locationId: null,
        locationName: "L",
        charactersPresent: ["Inconnu"],
        emotionalTurn: "t",
        dialogueIntent: null,
        mustReveal: [],
        mustPreserve: [],
        mustNotInvent: [],
        dangerLevel: "low",
        continuityEffects: { stateChanges: [], itemsIntroduced: [], informationLearned: [] },
      },
    ]);
    expect(() =>
      validatePremiumStoryArcConstraints(arc, {
        ...baseInput,
        mainCharacters: [{ id: "h1", name: "Hero", roleType: "hero" }],
      }),
    ).toThrow(/premium_story_architect_invented_character/);
  });

  it("accepte un combat si l’intent le mentionne", () => {
    const arc = baseArc([
      {
        beatId: "b1",
        order: 1,
        type: "combat",
        purpose: "p",
        storyEvent: "e",
        locationId: null,
        locationName: "L",
        charactersPresent: ["Hero"],
        emotionalTurn: "t",
        dialogueIntent: null,
        mustReveal: [],
        mustPreserve: [],
        mustNotInvent: [],
        dangerLevel: "high",
        continuityEffects: { stateChanges: [], itemsIntroduced: [], informationLearned: [] },
      },
    ]);
    expect(() =>
      validatePremiumStoryArcConstraints(arc, {
        ...baseInput,
        userIntent: "Un duel au sabre dans la rue",
        mainCharacters: [{ id: "h1", name: "Hero", roleType: "hero" }],
      }),
    ).not.toThrow();
  });
});
