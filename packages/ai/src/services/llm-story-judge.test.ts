/**
 * P1.1 — Tests du LLM story judge.
 * Golden tests pour vérifier le scoring sur différents types d'outlines.
 */
import { describe, expect, it, afterEach } from "vitest";
import {
  judgeStoryOutlineWithLLM,
  runHeuristicFallback,
  StoryQualityRubricSchema,
  type JudgeStoryOutlineInput,
} from "./llm-story-judge";
import type { GeneratedChapterBundle } from "../chapter/shared-types";
import type { ChapterDramaticSpine } from "./story-spine";

function makeBundle(overrides: {
  scenes?: Array<{ summary: string }>;
  cliffhanger?: string | null;
} = {}): GeneratedChapterBundle {
  const scenes = (overrides.scenes ?? [
    { summary: "Hero discovers the threat" },
    { summary: "Hero prepares for battle" },
    { summary: "Climactic confrontation begins" },
  ]).map((s, i) => ({
    id: `scene-${i}`,
    title: `Scene ${i}`,
    summary: s.summary,
    location: "unknown",
    characters: [] as string[],
    purpose: "test",
    continuityPayload: {
      source: "test" as const,
      confidence: 1,
      sceneEvents: [],
      characterDeltas: [],
      injuries: [],
      possessions: [],
      knowledge: [],
      obligations: [],
    },
    dialogue: [],
  }));

  return {
    generationDiagnostics: {
      operationalStatus: "ok",
      degradedModes: [],
      outline: { degradedStatus: "none", usedFallback: false },
      dialogue: { degradedStatus: "none", usedFallback: false, fallbackSceneIds: [], reasonsByScene: [] },
    },
    creativeDirection: { chapterGoal: "Test", tone: "action", whyNow: "Test" },
    plotOptions: [],
    outline: {
      chapter_title: "Test Chapter",
      chapter_goal: "Test",
      tone: "action",
      beats: [],
      cliffhanger: "cliffhanger" in overrides ? overrides.cliffhanger : "Will the hero survive?",
      continuity_notes: [],
    },
    script: { scenes },
    storyboard: { pageCount: 1, pages: [] },
    memory: { narrativeSummary: "", structuredState: {} },
  } as unknown as GeneratedChapterBundle;
}

function makeSpine(overrides: {
  beats?: Array<{ eventType: string; description?: string }>;
} = {}): ChapterDramaticSpine {
  const defaultBeats = [
    { eventType: "setup", sceneIndex: 0, description: "Hero introduced" },
    { eventType: "escalation", sceneIndex: 1, description: "Hero faces challenge" },
    { eventType: "confrontation", sceneIndex: 2, description: "Final confrontation" },
  ];
  return {
    beats: (overrides.beats ?? defaultBeats).map((b, i) => ({
      eventType: b.eventType as "setup" | "escalation" | "confrontation" | "reveal" | "interruption",
      sceneIndex: i,
      description: b.description ?? "Beat description",
    })),
    reversals: [],
    payoffTargets: [],
    cliffhangerPrep: null,
    premiumScore: 5,
    pacingIssues: [],
    weakScenes: [],
    deadPanels: [],
    payoffWeaknesses: [],
    hookOpportunities: [],
  };
}

function makeInput(overrides: {
  bundle?: Partial<Parameters<typeof makeBundle>[0]>;
  spine?: Partial<Parameters<typeof makeSpine>[0]>;
  genreMode?: JudgeStoryOutlineInput["genreMode"];
  chapterNumber?: number;
} = {}): JudgeStoryOutlineInput {
  return {
    bundle: makeBundle(overrides.bundle),
    spine: makeSpine(overrides.spine),
    genreMode: overrides.genreMode ?? "shonen_combat",
    chapterNumber: overrides.chapterNumber ?? 1,
  };
}

describe("P1.1 — LLM Story Judge", () => {
  describe("StoryQualityRubricSchema", () => {
    it("valide une rubric complète", () => {
      const validRubric = {
        causality: { score: 8, issues: [] },
        characterFunction: { score: 7, issues: ["Minor issue"] },
        escalation: { score: 9, issues: [] },
        setupPayoff: { score: 6, issues: [] },
        cliffhanger: { score: 8, issues: [], suggestedRewrite: undefined },
        overall: 8,
        verdict: "pass" as const,
      };

      const result = StoryQualityRubricSchema.safeParse(validRubric);
      expect(result.success).toBe(true);
    });

    it("rejette un score hors range", () => {
      const invalidRubric = {
        causality: { score: 15, issues: [] },
        characterFunction: { score: 7, issues: [] },
        escalation: { score: 9, issues: [] },
        setupPayoff: { score: 6, issues: [] },
        cliffhanger: { score: 8, issues: [] },
        overall: 8,
        verdict: "pass",
      };

      const result = StoryQualityRubricSchema.safeParse(invalidRubric);
      expect(result.success).toBe(false);
    });

    it("rejette un verdict invalide", () => {
      const invalidRubric = {
        causality: { score: 8, issues: [] },
        characterFunction: { score: 7, issues: [] },
        escalation: { score: 9, issues: [] },
        setupPayoff: { score: 6, issues: [] },
        cliffhanger: { score: 8, issues: [] },
        overall: 8,
        verdict: "invalid_verdict",
      };

      const result = StoryQualityRubricSchema.safeParse(invalidRubric);
      expect(result.success).toBe(false);
    });
  });

  describe("runHeuristicFallback", () => {
    it("golden: outline incohérent (trop peu de scenes/beats) = fail ou repair", () => {
      const weakInput = makeInput({
        bundle: {
          scenes: [{ summary: "Something happens" }],
          cliffhanger: null,
        },
        spine: {
          beats: [{ eventType: "setup" }],
        },
      });

      const rubric = runHeuristicFallback(weakInput);

      expect(rubric.verdict).not.toBe("pass");
      expect(rubric.overall).toBeLessThan(7);
    });

    it("golden: outline moyen (structure présente mais simple) = repair", () => {
      const mediumInput = makeInput({
        bundle: {
          scenes: [
            { summary: "Setup" },
            { summary: "Development" },
          ],
          cliffhanger: "What next?",
        },
        spine: {
          beats: [
            { eventType: "setup", description: "Hero introduced" },
            { eventType: "escalation", description: "Challenge arises" },
          ],
        },
      });

      const rubric = runHeuristicFallback(mediumInput);

      expect(["pass", "repair"]).toContain(rubric.verdict);
    });

    it("golden: outline fort (structure complète) = pass", () => {
      const strongInput = makeInput({
        bundle: {
          scenes: [
            { summary: "The hero receives a mysterious letter" },
            { summary: "Journey to the ancient temple begins" },
            { summary: "First encounter with the guardian" },
            { summary: "The revelation of the hero's true power" },
            { summary: "Final battle preparations" },
          ],
          cliffhanger: "But as dawn breaks, a shadow falls over the kingdom...",
        },
        spine: {
          beats: [
            { eventType: "setup", description: "Hero introduced with mysterious letter" },
            { eventType: "escalation", description: "Journey and preparations" },
            { eventType: "confrontation", description: "Guardian encounter" },
            { eventType: "reveal", description: "Power revelation and battle" },
            { eventType: "setup", description: "Aftermath" },
          ],
        },
      });

      const rubric = runHeuristicFallback(strongInput);

      expect(rubric.verdict).toBe("pass");
      expect(rubric.overall).toBeGreaterThanOrEqual(7);
    });

    it("golden: pas de cliffhanger = score faible", () => {
      const noCliffInput = makeInput({
        bundle: {
          scenes: [{ summary: "Scene" }],
          cliffhanger: null,
        },
      });

      const rubric = runHeuristicFallback(noCliffInput);

      expect(rubric.cliffhanger.score).toBeLessThan(5);
      expect(rubric.cliffhanger.issues.length).toBeGreaterThan(0);
    });
  });

  describe("judgeStoryOutlineWithLLM", () => {
    const originalApiKey = process.env.OPENAI_API_KEY;

    afterEach(() => {
      if (originalApiKey !== undefined) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });

    it("utilise les heuristiques si OPENAI_API_KEY absent", async () => {
      delete process.env.OPENAI_API_KEY;

      const result = await judgeStoryOutlineWithLLM(makeInput());

      expect(result.ok).toBe(true);
      expect(result.llmUsed).toBe(false);
      expect(result.fallbackReason).toBe("OPENAI_API_KEY_missing");
    });

    it("retourne une rubric valide même en fallback", async () => {
      delete process.env.OPENAI_API_KEY;

      const result = await judgeStoryOutlineWithLLM(makeInput());

      expect(result.ok).toBe(true);
      const parseResult = StoryQualityRubricSchema.safeParse(result.rubric);
      expect(parseResult.success).toBe(true);
    });
  });
});
