/**
 * Sprint 1 — Reader refacto
 *
 * Tests de bout en bout de `buildPagesFromChapter` avec le nouveau moteur
 * de pagination. Verrouillent spécifiquement le bug utilisateur :
 *   - chapitre de 75 panels sur plusieurs scènes → TOUS visibles
 *   - scène de 12 panels → plusieurs pages, aucun panel perdu
 *   - ordre préservé à la sortie
 */

import { describe, expect, it } from "vitest";
import {
  buildPagesFromChapter,
  buildWebtoonFlowFromChapter,
  dedupeReaderPages,
} from "../components/manga/reader/build-reader-pages";
import type { ChapterPayload, SceneImage, ChapterScene } from "../components/manga/reader/reader-types";

function makeImage(n: number, sceneId: string): SceneImage {
  return {
    id: `${sceneId}-img-${n}`,
    imageUrl: `https://example.com/${sceneId}-${n}.png`,
    persistedUrl: null,
    panelNumber: n,
    status: "completed",
    provider: "fal",
    model: "test",
    metadata: {},
  };
}

function makeScene(id: string, imageCount: number, overrides: Partial<ChapterScene> = {}): ChapterScene {
  return {
    id,
    title: null,
    pageLayoutTemplate: null,
    isSplashPage: null,
    isDoublePage: null,
    dramaticWeight: null,
    images: Array.from({ length: imageCount }, (_, i) => makeImage(i + 1, id)),
    ...overrides,
  };
}

function makeChapter(scenes: ChapterScene[]): ChapterPayload {
  return {
    id: "ch-1",
    chapterNumber: 1,
    title: "Test",
    summary: null,
    cliffhanger: null,
    storyboard: null,
    outline: null,
    script: null,
    scenes,
  };
}

describe("buildPagesFromChapter (Sprint 1 — nouveau paginator)", () => {
  it("bug utilisateur : 75 panels répartis sur plusieurs scènes → 75 visibles", () => {
    // 5 scènes × 15 panels = 75 panels. L'ancien `slice(0, 6)` par scène en
    // droppait 45 silencieusement.
    const chapter = makeChapter(
      Array.from({ length: 5 }, (_, sceneIdx) => makeScene(`scene-${sceneIdx + 1}`, 15)),
    );
    const pages = buildPagesFromChapter(chapter);
    const totalPanels = pages.reduce((sum, p) => sum + p.panels.length, 0);
    expect(totalPanels).toBe(75);
  });

  it("bug utilisateur : scène unique de 12 panels → plusieurs pages, aucun panel perdu", () => {
    const chapter = makeChapter([makeScene("scene-1", 12)]);
    const pages = buildPagesFromChapter(chapter);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const total = pages.reduce((sum, p) => sum + p.panels.length, 0);
    expect(total).toBe(12);
  });

  it("ordre strict préservé : panel 1 en premier, panel 75 en dernier", () => {
    const chapter = makeChapter(
      Array.from({ length: 5 }, (_, sceneIdx) => makeScene(`scene-${sceneIdx + 1}`, 15)),
    );
    const pages = buildPagesFromChapter(chapter);
    const allPanels = pages.flatMap((p) => p.panels);
    expect(allPanels[0]!.id).toBe("scene-1-img-1");
    expect(allPanels[allPanels.length - 1]!.id).toBe("scene-5-img-15");
  });

  it("chapitre sans scène → page placeholder avec narration fallback", () => {
    const chapter = makeChapter([]);
    chapter.summary = "Résumé du chapitre";
    const pages = buildPagesFromChapter(chapter);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.panels[0]!.narration).toBe("Résumé du chapitre");
  });

  it("scènes hétérogènes (1, 3, 6, 12 panels) → total préservé", () => {
    const chapter = makeChapter([
      makeScene("s1", 1),
      makeScene("s2", 3),
      makeScene("s3", 6),
      makeScene("s4", 12),
    ]);
    const pages = buildPagesFromChapter(chapter);
    const total = pages.reduce((sum, p) => sum + p.panels.length, 0);
    expect(total).toBe(22);
  });

  it("aucune page ne fait 5 panels (invariant du paginator)", () => {
    const chapter = makeChapter([makeScene("s1", 25), makeScene("s2", 17), makeScene("s3", 11)]);
    const pages = buildPagesFromChapter(chapter);
    const sizes = pages.map((p) => p.panels.length);
    expect(sizes.every((s) => s !== 5)).toBe(true);
  });

  it("layoutTemplate moderne est fourni (compat modernes + legacy A–F)", () => {
    const chapter = makeChapter([makeScene("s1", 6)]);
    const pages = buildPagesFromChapter(chapter);
    expect(pages[0]!.layoutTemplate).toBeDefined();
    expect(pages[0]!.layout).toMatch(/^[A-F]$/);
  });

  it("publie un ordre de lecture RTL explicite et des panelSlots stables", () => {
    const chapter = makeChapter([makeScene("s1", 4)]);
    const pages = buildPagesFromChapter(chapter);
    expect(pages[0]!.readingDirection).toBe("rtl");
    expect(pages[0]!.panelSlots?.map((slot) => slot.area)).toEqual(["b", "a", "d", "c"]);
  });
});

describe("buildWebtoonFlowFromChapter", () => {
  it("75 panels → 75 panels visibles en webtoon", () => {
    const chapter = makeChapter(
      Array.from({ length: 5 }, (_, sceneIdx) => makeScene(`scene-${sceneIdx + 1}`, 15)),
    );
    const blocks = buildWebtoonFlowFromChapter(chapter);
    const panelBlocks = blocks.filter((b) => b.kind === "panel");
    expect(panelBlocks).toHaveLength(75);
  });

  it("ordre strict en webtoon", () => {
    const chapter = makeChapter([makeScene("s1", 3), makeScene("s2", 3)]);
    const blocks = buildWebtoonFlowFromChapter(chapter);
    const ids = blocks.filter((b) => b.kind === "panel").map((b) => b.kind === "panel" && b.panel.id);
    expect(ids).toEqual([
      "s1-img-1",
      "s1-img-2",
      "s1-img-3",
      "s2-img-1",
      "s2-img-2",
      "s2-img-3",
    ]);
  });

  it("chapitre vide → []", () => {
    expect(buildWebtoonFlowFromChapter(makeChapter([]))).toEqual([]);
  });
});

describe("dedupeReaderPages (comportement préservé)", () => {
  it("retire les pages avec le même id", () => {
    const pages = [
      { id: "p1", layout: "A" as const, panels: [{ id: "a", mood: "dramatic" as const }] },
      { id: "p1", layout: "A" as const, panels: [{ id: "a", mood: "dramatic" as const }] },
      { id: "p2", layout: "A" as const, panels: [{ id: "b", mood: "dramatic" as const }] },
    ];
    expect(dedupeReaderPages(pages)).toHaveLength(2);
  });

  it("pages sans id ni panels-id → conservées", () => {
    const pages = [
      { layout: "A" as const, panels: [{ mood: "dramatic" as const }] },
      { layout: "A" as const, panels: [{ mood: "dramatic" as const }] },
    ];
    expect(dedupeReaderPages(pages)).toHaveLength(2);
  });
});
