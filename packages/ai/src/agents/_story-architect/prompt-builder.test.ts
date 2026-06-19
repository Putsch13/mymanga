import { describe, it, expect } from "vitest";
import { buildUserPrompt } from "./prompt-builder";
import type { StoryArchitectInput } from "../story-architect-agent";

function makeInput(patch: Partial<StoryArchitectInput> = {}): StoryArchitectInput {
  return {
    chapterId: "ch1",
    chapterNumber: 1,
    title: "Test",
    userIntent: "Le héros explore le port",
    summary: "",
    ...patch,
  };
}

describe("buildUserPrompt — ancre époque/cadre", () => {
  it("injecte un bloc SETTING & ERA quand era est fourni", () => {
    const prompt = buildUserPrompt(makeInput({ era: "Japon Edo", setting: "village portuaire" }));
    expect(prompt).toContain("SETTING & ERA");
    expect(prompt).toContain("Japon Edo");
    expect(prompt).toContain("village portuaire");
    // L'ancre doit précéder l'intention utilisateur (priorité de contexte).
    expect(prompt.indexOf("SETTING & ERA")).toBeLessThan(prompt.indexOf("USER INTENT"));
  });

  it("n'injecte AUCUN bloc époque quand era et setting sont vides", () => {
    const prompt = buildUserPrompt(makeInput({ era: "", setting: "" }));
    expect(prompt).not.toContain("SETTING & ERA");
  });

  it("injecte le bloc même si seul setting est fourni", () => {
    const prompt = buildUserPrompt(makeInput({ era: null, setting: "station orbitale" }));
    expect(prompt).toContain("SETTING & ERA");
    expect(prompt).toContain("station orbitale");
  });
});
