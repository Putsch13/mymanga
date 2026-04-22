import { describe, expect, it } from "vitest";
import {
  STORYBOARD_LAYOUT_TEMPLATES,
  STORYBOARD_RENDER_MODES,
  STORYBOARD_SHOT_TYPES,
  STORYBOARD_SUBJECT_FOCUSES,
  STORYBOARD_CUTAWAY_TYPES,
} from "./storyboard-plan";

describe("StoryboardPlan contract", () => {
  it("expose 14 layoutTemplates", () => {
    expect(STORYBOARD_LAYOUT_TEMPLATES.length).toBe(14);
    expect(STORYBOARD_LAYOUT_TEMPLATES).toContain("splash");
    expect(STORYBOARD_LAYOUT_TEMPLATES).toContain("double_spread");
    expect(STORYBOARD_LAYOUT_TEMPLATES).toContain("staggered_5");
  });

  it("expose 13 renderModes", () => {
    expect(STORYBOARD_RENDER_MODES.length).toBe(13);
    expect(STORYBOARD_RENDER_MODES).toContain("establishing_environment");
    expect(STORYBOARD_RENDER_MODES).toContain("insert_object");
    expect(STORYBOARD_RENDER_MODES).toContain("combat_exchange");
  });

  it("expose shotTypes, subjectFocuses, cutawayTypes", () => {
    expect(STORYBOARD_SHOT_TYPES).toContain("wide");
    expect(STORYBOARD_SHOT_TYPES).toContain("extreme_closeup");
    expect(STORYBOARD_SUBJECT_FOCUSES).toContain("hero");
    expect(STORYBOARD_SUBJECT_FOCUSES).toContain("environment");
    expect(STORYBOARD_CUTAWAY_TYPES).toContain("none");
    expect(STORYBOARD_CUTAWAY_TYPES).toContain("surveillance");
  });
});
