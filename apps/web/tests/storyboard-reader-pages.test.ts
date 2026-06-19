/**
 * Tests du reader quand un StoryboardPlan v3 est persisté.
 *
 * Verrouille explicitement :
 *   - si `outline.storyboardPlanV2` existe, on ne repagine pas
 *   - le layoutTemplate affiché = celui du storyboard
 *   - les panels sans image rendue deviennent des placeholders pending
 *     (jamais des cases blanches vides)
 */

import { describe, expect, it } from "vitest";
import { buildPagesFromChapter } from "../components/manga/reader/build-reader-pages";
import type { ChapterPayload } from "../components/manga/reader/reader-types";

/** Même squelette que le plan standard, mais P2 porte `dialogueLines` (canon) + `dialogue` obsolète. */
function makeChapterWithDialogueLinesOnPlaceholder(): ChapterPayload {
  const base = makeChapterWithPersistedPlan();
  const outline = base.outline as Record<string, unknown>;
  const plan = outline.storyboardPlanV2 as Record<string, unknown>;
  const pages = [...(plan.pages as Record<string, unknown>[])];
  const page0 = { ...(pages[0] as Record<string, unknown>) };
  const panels = [...((page0.panels as Record<string, unknown>[]) ?? [])];
  panels[1] = {
    ...panels[1],
    dialogue: [{ speaker: "StaleSpeaker", text: "Texte legacy à ignorer." }],
    dialogueLines: [{ text: "Réplique canon blueprint.", speakerName: "Hero", characterId: "c-hero" }],
  };
  page0.panels = panels;
  pages[0] = page0;
  plan.pages = pages;
  outline.storyboardPlanV2 = plan;
  return { ...base, outline } as unknown as ChapterPayload;
}

/** P2 : pas de `dialogue` / `dialogueLines`, seulement `panelTextBundle` (source writer / spec). */
function makeChapterWithPanelTextBundleOnPlaceholder(): ChapterPayload {
  const base = makeChapterWithPersistedPlan();
  const outline = base.outline as Record<string, unknown>;
  const plan = outline.storyboardPlanV2 as Record<string, unknown>;
  const pages = [...(plan.pages as Record<string, unknown>[])];
  const page0 = { ...(pages[0] as Record<string, unknown>) };
  const panels = [...((page0.panels as Record<string, unknown>[]) ?? [])];
  panels[1] = {
    ...panels[1],
    dialogue: [],
    dialogueLines: undefined,
    panelTextBundle: {
      dialogues: [{ speaker: "NarrateurBundle", text: "Réplique issue du bundle." }],
      narration: "Voix off depuis bundle.",
      sfx: ["clic"],
    },
  };
  page0.panels = panels;
  pages[0] = page0;
  plan.pages = pages;
  outline.storyboardPlanV2 = plan;
  return { ...base, outline } as unknown as ChapterPayload;
}

function makeChapterWithPersistedPlan(): ChapterPayload {
  return {
    id: "ch-v3",
    chapterNumber: 1,
    title: "v3",
    summary: null,
    cliffhanger: null,
    storyboard: {},
    script: {},
    scenes: [],
    outline: {
      storyboardPlanV2: {
        chapterId: "ch-v3",
        totalTargetPanels: 5,
        pages: [
          {
            pageNumber: 1,
            layoutTemplate: "action_strip",
            dramaticRole: "setup",
            beatIds: ["b1"],
            panels: [
              {
                panelId: "P1",
                pageNumber: 1,
                panelNumberInPage: 1,
                renderMode: "establishing_environment",
                shotType: "wide",
                subjectFocus: "environment",
                sourceBeatId: "b1",
                locationName: "rue",
                actionLine: "vue large de la rue",
                emotionLine: "calme",
                dialogue: [],
              },
              {
                panelId: "P2",
                pageNumber: 1,
                panelNumberInPage: 2,
                renderMode: "dialogue_two_shot",
                shotType: "medium",
                subjectFocus: "group",
                sourceBeatId: "b1",
                locationName: "rue",
                actionLine: "deux persos parlent",
                emotionLine: "tension",
                dialogue: [{ speaker: "Hero", text: "On y va." }],
                textPlacementHint: {
                  preferredAnchorZones: ["top-right"],
                  overflowStrategy: "caption_strip",
                },
              },
            ],
          },
          {
            pageNumber: 2,
            layoutTemplate: "splash",
            dramaticRole: "reveal",
            beatIds: ["b2"],
            panels: [
              {
                panelId: "P3",
                pageNumber: 2,
                panelNumberInPage: 1,
                renderMode: "hero_closeup",
                shotType: "closeup",
                subjectFocus: "hero",
                sourceBeatId: "b2",
                locationName: "rue",
                actionLine: "regard déterminé",
                emotionLine: "résolution",
                dialogue: [],
              },
            ],
          },
        ],
      },
    },
  } as unknown as ChapterPayload;
}

describe("reader — pipeline v3 storyboard branch", () => {
  it("si storyboardPlanV2 existe, ne repagine pas et suit l'ordre du plan", () => {
    const pages = buildPagesFromChapter(makeChapterWithPersistedPlan());
    expect(pages.length).toBe(2);
    expect(pages[0]!.panels.length).toBe(2);
    expect(pages[1]!.panels.length).toBe(1);
    expect(pages[0]!.id).toBe("page-1");
    expect(pages[1]!.id).toBe("page-2");
  });

  it("le layoutTemplate affiché = layoutTemplate du storyboard", () => {
    const pages = buildPagesFromChapter(makeChapterWithPersistedPlan());
    expect(pages[0]!.layoutTemplate).toBe("action_strip");
    expect(pages[1]!.layoutTemplate).toBe("splash");
    expect(pages[1]!.isSplashPage).toBe(true);
  });

  it("les panels sans image rendue sont des placeholders pending (pas de case vide silencieuse)", () => {
    const pages = buildPagesFromChapter(makeChapterWithPersistedPlan());
    const panel1 = pages[0]!.panels[0]!;
    const panel3 = pages[1]!.panels[0]!;
    expect(panel1.imageUrl).toBeNull();
    expect(panel1.status).toBe("pending");
    expect(panel3.imageUrl).toBeNull();
    expect(panel3.status).toBe("pending");
  });

  it("la panel dialogue du storyboard remonte au placeholder (premier dialogue)", () => {
    const pages = buildPagesFromChapter(makeChapterWithPersistedPlan());
    const p2 = pages[0]!.panels[1]!;
    expect(p2.speaker).toBe("Hero");
    expect(p2.dialogue).toBe("On y va.");
    expect(p2.textMeta?.preferredAnchorZones).toEqual(["top-right"]);
  });

  it("dialogueLines persistés priment sur dialogue[] (PR5 reader)", () => {
    const pages = buildPagesFromChapter(makeChapterWithDialogueLinesOnPlaceholder());
    const p2 = pages[0]!.panels[1]!;
    expect(p2.speaker).toBe("Hero");
    expect(p2.dialogue).toBe("Réplique canon blueprint.");
    const tc = p2.textContract as { dialogues: Array<{ speakerName: string; text: string; speakerId?: string }> };
    expect(tc.dialogues[0]?.text).toBe("Réplique canon blueprint.");
    expect(tc.dialogues[0]?.speakerName).toBe("Hero");
    expect(tc.dialogues[0]?.speakerId).toBe("c-hero");
  });

  it("panelTextBundle seul alimente le placeholder (sans dialogue[])", () => {
    const pages = buildPagesFromChapter(makeChapterWithPanelTextBundleOnPlaceholder());
    const p2 = pages[0]!.panels[1]!;
    expect(p2.speaker).toBe("NarrateurBundle");
    expect(p2.dialogue).toBe("Réplique issue du bundle.");
    expect(p2.narration).toContain("Voix off depuis bundle");
    expect(p2.sfx).toContain("clic");
  });

  it("fallback legacy si pas de storyboardPlanV2 (outline vide)", () => {
    const chapter: ChapterPayload = {
      id: "ch-legacy",
      chapterNumber: 1,
      title: null,
      summary: "hello",
      cliffhanger: null,
      storyboard: {},
      script: {},
      outline: {},
      scenes: [],
    };
    const pages = buildPagesFromChapter(chapter);
    expect(pages.length).toBe(1);
    expect(pages[0]!.panels[0]!.narration).toBe("hello");
  });
});
