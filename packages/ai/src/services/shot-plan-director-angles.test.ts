import { describe, it, expect } from "vitest";
import { STORY_FUNCTION_ALLOWED_SHOTS, STORY_FUNCTION_ALLOWED_ANGLES } from "./shot-plan-director";
import type { StoryFunction } from "@manga-ai-studio/core";

const ALL_STORY_FUNCTIONS: StoryFunction[] = [
  "setup", "discovery", "dialogue_tension", "investigation",
  "movement", "revelation", "aftermath", "decision", "transition",
];

describe("STORY_FUNCTION_ALLOWED_SHOTS (P1.12)", () => {
  it("defines allowed shots for every story function", () => {
    for (const fn of ALL_STORY_FUNCTIONS) {
      expect(STORY_FUNCTION_ALLOWED_SHOTS[fn]).toBeDefined();
      expect(STORY_FUNCTION_ALLOWED_SHOTS[fn].length).toBeGreaterThan(0);
    }
  });

  it("setup allows wide and establishing but not extreme_closeup", () => {
    expect(STORY_FUNCTION_ALLOWED_SHOTS.setup).toContain("wide");
    expect(STORY_FUNCTION_ALLOWED_SHOTS.setup).not.toContain("extreme_closeup");
  });

  it("revelation allows extreme_closeup", () => {
    expect(STORY_FUNCTION_ALLOWED_SHOTS.revelation).toContain("extreme_closeup");
  });
});

describe("STORY_FUNCTION_ALLOWED_ANGLES (P1.12)", () => {
  it("defines allowed angles for every story function", () => {
    for (const fn of ALL_STORY_FUNCTIONS) {
      expect(STORY_FUNCTION_ALLOWED_ANGLES[fn]).toBeDefined();
      expect(STORY_FUNCTION_ALLOWED_ANGLES[fn].length).toBeGreaterThan(0);
    }
  });

  it("revelation allows dutch angle", () => {
    expect(STORY_FUNCTION_ALLOWED_ANGLES.revelation).toContain("dutch");
  });

  it("setup allows birds_eye", () => {
    expect(STORY_FUNCTION_ALLOWED_ANGLES.setup).toContain("birds_eye");
  });
});
