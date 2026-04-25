import { describe, expect, it } from "vitest";
import {
  runPropsQaPass,
  extractPotentialProps,
  isAnachronisticProp,
  formatPropsQaLog,
  type PropsQaPassInput,
} from "./props-qa-pass";
import {
  createDefaultChapterStyleBible,
  type PanelRenderSpec,
} from "@manga-ai-studio/ai";
import type { ChapterStoryContract } from "@manga-ai-studio/core";

function makeSpec(overrides: Partial<PanelRenderSpec> = {}): PanelRenderSpec {
  return {
    panelId: "panel-1",
    pageNumber: 1,
    panelNumberInPage: 1,
    panelPurpose: "dialogue_anchor",
    renderMode: "character_focus",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    cutawayType: "none",
    locationName: "port",
    actionLine: "Marius stands at the dock",
    emotionLine: "nostalgic",
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

const baseStoryContract: ChapterStoryContract = {
  chapterId: "ch-01",
  chapterNumber: 1,
  chapterGoal: "Marius revient au port",
  storySummary: "",
  tone: "nostalgic",
  heroCharacterId: "marius",
  requiredCharacterIds: ["marius"],
  optionalCharacterIds: [],
  requiredNpcGroups: [],
  requiredLocations: [
    {
      locationId: "port",
      name: "port de pêche",
      visualDescription: "",
      primaryInBeatIds: [],
      isPrimaryLocation: true,
    },
  ],
  allowedProps: [
    {
      propId: "net",
      canonicalName: "fishing net",
      allowedInBeatIds: [],
      isNarrativelyImportant: false,
    },
  ],
  forbiddenProps: ["smartphone", "gun", "car"],
  emotionalArc: [],
  expectedBeatCount: 10,
  beatIds: [],
};

describe("extractPotentialProps", () => {
  it("extracts props from holding phrases", () => {
    const props = extractPotentialProps("Marius holding a fishing net");
    expect(props).toContain("fishing net");
  });

  it("extracts anachronistic props directly", () => {
    const props = extractPotentialProps("The hero uses a smartphone to call");
    expect(props).toContain("smartphone");
  });

  it("extracts wielding props", () => {
    const props = extractPotentialProps("The warrior wielding a sword");
    expect(props).toContain("sword");
  });

  it("returns empty for text without props", () => {
    const props = extractPotentialProps("The sun sets over the sea");
    expect(props).toHaveLength(0);
  });
});

describe("isAnachronisticProp", () => {
  it("returns true for modern devices", () => {
    expect(isAnachronisticProp("smartphone")).toBe(true);
    expect(isAnachronisticProp("laptop")).toBe(true);
    expect(isAnachronisticProp("television")).toBe(true);
  });

  it("returns false for period-appropriate items", () => {
    expect(isAnachronisticProp("sword")).toBe(false);
    expect(isAnachronisticProp("fishing net")).toBe(false);
  });
});

describe("runPropsQaPass", () => {
  it("passes when no forbidden props are present", () => {
    const input: PropsQaPassInput = {
      specs: [makeSpec()],
      storyContract: baseStoryContract,
    };
    const result = runPropsQaPass(input);
    expect(result.ok).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it("fails when forbidden prop is in actionLine", () => {
    const specWithPhone = makeSpec({
      actionLine: "Marius holding a smartphone",
    });
    const input: PropsQaPassInput = {
      specs: [specWithPhone],
      storyContract: baseStoryContract,
    };
    const result = runPropsQaPass(input);
    expect(result.ok).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.propName === "smartphone")).toBe(true);
  });

  it("fails when forbidden prop is in emotionLine", () => {
    const specWithGun = makeSpec({
      emotionLine: "character holding a gun nervously",
    });
    const input: PropsQaPassInput = {
      specs: [specWithGun],
      storyContract: baseStoryContract,
    };
    const result = runPropsQaPass(input);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.propName === "gun")).toBe(true);
  });

  it("warns for anachronistic props not explicitly forbidden", () => {
    const specWithTablet = makeSpec({
      actionLine: "character using a tablet",
    });
    const contractWithoutTabletForbidden: ChapterStoryContract = {
      ...baseStoryContract,
      forbiddenProps: ["gun"],
    };
    const input: PropsQaPassInput = {
      specs: [specWithTablet],
      storyContract: contractWithoutTabletForbidden,
    };
    const result = runPropsQaPass(input);
    expect(result.warningCount).toBeGreaterThan(0);
  });

  it("treats anachronistic props as errors in strict mode", () => {
    const specWithTablet = makeSpec({
      actionLine: "character using a tablet",
    });
    const contractWithoutTabletForbidden: ChapterStoryContract = {
      ...baseStoryContract,
      forbiddenProps: ["gun"],
    };
    const input: PropsQaPassInput = {
      specs: [specWithTablet],
      storyContract: contractWithoutTabletForbidden,
      strictMode: true,
    };
    const result = runPropsQaPass(input);
    expect(result.ok).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
  });
});

describe("formatPropsQaLog", () => {
  it("shows ok message when no issues", () => {
    const output = { issues: [], errorCount: 0, warningCount: 0, ok: true };
    const log = formatPropsQaLog(output);
    expect(log).toContain("[props-qa] ok");
  });

  it("shows error summary when issues present", () => {
    const output = {
      issues: [
        {
          panelId: "panel-1",
          propName: "smartphone",
          code: "E_ENTITY_PHANTOM_PROP" as const,
          message: "test",
          severity: "error" as const,
        },
      ],
      errorCount: 1,
      warningCount: 0,
      ok: false,
    };
    const log = formatPropsQaLog(output);
    expect(log).toContain("errors=1");
    expect(log).toContain("panel-1");
    expect(log).toContain("smartphone");
  });
});
