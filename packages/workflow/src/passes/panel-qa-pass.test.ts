import { describe, expect, it } from "vitest";
import { runPanelQaPass } from "./panel-qa-pass";
import {
  createDefaultChapterStyleBible,
  type PanelRenderSpec,
} from "@manga-ai-studio/ai";

function makeSpec(overrides: Partial<PanelRenderSpec> = {}): PanelRenderSpec {
  return {
    panelId: "p1",
    pageNumber: 1,
    panelNumberInPage: 1,
    renderMode: "dialogue_two_shot",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "group",
    cutawayType: "none",
    locationName: "zone",
    actionLine: "action",
    emotionLine: "tension",
    dialogueIntent: null,
    visibleCharacters: [],
    styleBible: createDefaultChapterStyleBible(),
    continuityLocks: {
      outfitLocks: [],
      bodyStateLocks: [],
      propLocks: [],
      environmentLocks: [],
    },
    imageReferences: { characterRefs: [], environmentRefs: [], panelRefs: [], styleRefs: [] },
    constraints: { mustShow: [], mustNotShow: [], forbiddenDrift: [], noTextInsideImage: true },
    ...overrides,
  };
}

describe("runPanelQaPass", () => {
  it("détecte subjectFocus=hero sans hero visible", async () => {
    const r = await runPanelQaPass({
      specs: [makeSpec({ subjectFocus: "hero", visibleCharacters: [] })],
    });
    expect(r.failCount).toBe(1);
    expect(r.results[0]!.issues).toContain("subject_focus_hero_but_no_hero_visible");
  });

  it("flag un forbidden tag dans actionLine", async () => {
    const r = await runPanelQaPass({
      specs: [makeSpec({ actionLine: "le héros lance une boule de feu magique" })],
      forbiddenTags: ["magique"],
    });
    expect(r.failCount).toBe(1);
    expect(r.results[0]!.issues.some((i) => i.includes("forbidden_tag_in_action"))).toBe(true);
  });

  it("warning sur lieu hors univers", async () => {
    const r = await runPanelQaPass({
      specs: [makeSpec({ locationName: "Mars" })],
      allowedLocations: ["Terre", "Lune"],
    });
    expect(r.okCount).toBe(1);
    expect(r.results[0]!.warnings.some((w) => w.includes("location_outside_universe"))).toBe(true);
  });
});
