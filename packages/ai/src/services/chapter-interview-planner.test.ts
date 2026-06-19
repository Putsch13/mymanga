import { describe, it, expect } from "vitest";
import { chapterIntentContractSchema, type ChapterIntentContract } from "@manga-ai-studio/core";
import { planInterviewQuestions } from "./chapter-interview-planner";

function makeContract(patch: Partial<ChapterIntentContract> = {}): ChapterIntentContract {
  return chapterIntentContractSchema.parse({
    rawUserIntent: "",
    understoodPitch: "",
    confidenceScore: 0.5,
    emotionalGoal: "",
    plotGoal: "",
    characterArcGoal: "",
    tone: "",
    pacing: "balanced",
    dialogueDensity: "medium",
    expectedCliffhanger: false,
    ...patch,
  });
}

describe("planInterviewQuestions", () => {
  it("demande les 3 critiques (événement, époque, lieu) sur un contrat vide", () => {
    const plan = planInterviewQuestions({
      contract: makeContract(),
      knownCharacterNames: ["Lux"],
    });
    const kinds = plan.questions.map((q) => q.kind);
    // Bornage à 3 → exactement les 3 critiques en tête.
    expect(plan.questions).toHaveLength(3);
    expect(kinds).toEqual(["main_event", "era", "location"]);
    expect(plan.ready).toBe(false);
    expect(plan.criticalRemaining).toBe(3);
  });

  it("ne redemande pas un champ déjà rempli", () => {
    const plan = planInterviewQuestions({
      contract: makeContract({
        plotGoal: "Le héros découvre la trahison de son mentor",
        era: "médiéval-fantasy",
        setting: "village portuaire",
      }),
      knownCharacterNames: ["Lux"],
    });
    const kinds = plan.questions.map((q) => q.kind);
    expect(kinds).not.toContain("main_event");
    expect(kinds).not.toContain("era");
    expect(kinds).not.toContain("location");
    expect(plan.ready).toBe(true);
    expect(plan.criticalRemaining).toBe(0);
  });

  it("respecte answeredKinds (l'auteur a dit « aucun PNJ »)", () => {
    const plan = planInterviewQuestions({
      contract: makeContract({
        plotGoal: "x",
        era: "Edo",
        setting: "temple",
      }),
      knownCharacterNames: [],
      answeredKinds: ["npcs", "creatures", "emotional_goal"],
    });
    const kinds = plan.questions.map((q) => q.kind);
    expect(kinds).not.toContain("npcs");
    expect(kinds).not.toContain("creatures");
  });

  it("considère un PNJ déjà résolu comme couvert", () => {
    const plan = planInterviewQuestions({
      contract: makeContract({ plotGoal: "x", era: "y", setting: "z" }),
      knownCharacterNames: [],
      resolvedNpcNames: ["Aubergiste"],
    });
    expect(plan.questions.map((q) => q.kind)).not.toContain("npcs");
  });

  it("completion augmente quand le contrat se remplit", () => {
    const empty = planInterviewQuestions({ contract: makeContract(), knownCharacterNames: [] });
    const full = planInterviewQuestions({
      contract: makeContract({
        plotGoal: "x",
        era: "y",
        setting: "z",
        emotionalGoal: "peur->courage",
        requiredNpcs: ["Aubergiste"],
        requiredCreatures: ["Loup spectral"],
        requiredProps: ["Épée brisée"],
      }),
      knownCharacterNames: [],
      answeredKinds: ["cliffhanger"],
    });
    expect(full.completion).toBeGreaterThan(empty.completion);
    expect(full.ready).toBe(true);
  });
});
