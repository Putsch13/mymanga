/**
 * Sprint 1 — Reader refacto
 *
 * Tests du moteur de pagination manga. L'objectif est de verrouiller les
 * invariants critiques qui cassaient avec l'ancienne `pipelineScenesToPages` :
 *   - aucun panel perdu (le bug utilisateur principal : 75+ panels visibles)
 *   - ordre préservé
 *   - scène > 6 panels répartie sur plusieurs pages
 *   - splash isolés
 *   - jamais de page de 5 (pas de layout CSS dispo)
 */

import { describe, expect, it } from "vitest";
import {
  buildMangaPagesFromPanels,
  type MangaPaginatorPanel,
} from "../components/manga/pagination/manga-pagination-engine";
import { computePageSizes, pickLayoutForPage } from "../components/manga/pagination/page-layout-rules";
import { derivePanelImportance } from "../components/manga/pagination/panel-importance";

function makePanel(n: number, overrides: Partial<MangaPaginatorPanel> = {}): MangaPaginatorPanel {
  return {
    id: `p${n}`,
    sceneId: overrides.sceneId ?? "scene-1",
    panelNumber: n,
    ...overrides,
  };
}

describe("manga pagination — computePageSizes (répartition)", () => {
  it("retourne [] pour 0 panel", () => {
    expect(computePageSizes(0)).toEqual([]);
  });

  it("1 panel → [1]", () => {
    expect(computePageSizes(1)).toEqual([1]);
  });

  it("3 panels → [3]", () => {
    expect(computePageSizes(3)).toEqual([3]);
  });

  it("5 panels → [3, 2] (pas de layout à 5 slots)", () => {
    expect(computePageSizes(5)).toEqual([3, 2]);
  });

  it("6 panels → [6]", () => {
    expect(computePageSizes(6)).toEqual([6]);
  });

  it("7 panels → [4, 3] (évite page orpheline de 1)", () => {
    expect(computePageSizes(7)).toEqual([4, 3]);
  });

  it("9 panels → [6, 3]", () => {
    expect(computePageSizes(9)).toEqual([6, 3]);
  });

  it("12 panels → [6, 6]", () => {
    expect(computePageSizes(12)).toEqual([6, 6]);
  });

  it("11 panels → [6, 3, 2] (évite la page de 5)", () => {
    expect(computePageSizes(11)).toEqual([6, 3, 2]);
  });

  it("75 panels → pages totalisant 75, aucune page de 5", () => {
    const sizes = computePageSizes(75);
    const total = sizes.reduce((a, b) => a + b, 0);
    expect(total).toBe(75);
    expect(sizes.every((s) => s >= 1 && s <= 6 && s !== 5)).toBe(true);
  });
});

describe("manga pagination — pickLayoutForPage", () => {
  it("1 panel → splash", () => {
    expect(pickLayoutForPage([{ importance: "normal" }])).toBe("splash");
  });

  it("2 panels → double_spread", () => {
    expect(pickLayoutForPage([{ importance: "normal" }, { importance: "normal" }])).toBe("double_spread");
  });

  it("3 panels avec un major → asymmetric_hero", () => {
    expect(
      pickLayoutForPage([
        { importance: "major" },
        { importance: "normal" },
        { importance: "normal" },
      ]),
    ).toBe("asymmetric_hero");
  });

  it("3 panels uniformes → cinematic_bar", () => {
    expect(
      pickLayoutForPage([
        { importance: "normal" },
        { importance: "normal" },
        { importance: "normal" },
      ]),
    ).toBe("cinematic_bar");
  });

  it("4 panels → grid_2x2", () => {
    expect(pickLayoutForPage(Array.from({ length: 4 }, () => ({ importance: "normal" as const })))).toBe("grid_2x2");
  });

  it("6 panels uniformes → grid_2x3", () => {
    expect(pickLayoutForPage(Array.from({ length: 6 }, () => ({ importance: "normal" as const })))).toBe("grid_2x3");
  });

  it("6 panels avec un major → action_strip", () => {
    const page = [
      { importance: "major" as const },
      ...Array.from({ length: 5 }, () => ({ importance: "normal" as const })),
    ];
    expect(pickLayoutForPage(page)).toBe("action_strip");
  });

  it("0 panel → lève (invariant : paginator ne doit jamais émettre de page vide)", () => {
    expect(() => pickLayoutForPage([])).toThrow();
  });

  it("5 panels → lève (pas de layout dispo — le paginator doit découper)", () => {
    expect(() => pickLayoutForPage(Array.from({ length: 5 }, () => ({ importance: "normal" as const })))).toThrow();
  });
});

describe("AUDIT COMMIT 9 — pickLayoutForPage content-aware", () => {
  it("3 panels + beatRole=revelation => asymmetric_hero (même sans major)", () => {
    expect(
      pickLayoutForPage([
        { importance: "normal", beatRole: "revelation" },
        { importance: "normal" },
        { importance: "normal" },
      ]),
    ).toBe("asymmetric_hero");
  });

  it("3 panels + beatRole=cliffhanger => asymmetric_hero", () => {
    expect(
      pickLayoutForPage([
        { importance: "normal" },
        { importance: "normal", beatRole: "cliffhanger" },
        { importance: "normal" },
      ]),
    ).toBe("asymmetric_hero");
  });

  it("3 panels dominés par environment => cinematic_bar", () => {
    expect(
      pickLayoutForPage([
        { importance: "normal", dominantSubject: "environment" },
        { importance: "normal", dominantSubject: "environment" },
        { importance: "normal", dominantSubject: "prop" },
      ]),
    ).toBe("cinematic_bar");
  });

  it("6 panels full environment/inserts => grid_2x3, pas action_strip", () => {
    const page = Array.from({ length: 6 }, () => ({
      importance: "insert" as const,
      dominantSubject: "environment" as const,
    }));
    expect(pickLayoutForPage(page)).toBe("grid_2x3");
  });

  it("6 panels avec un hero dominant => action_strip", () => {
    const page = [
      { importance: "normal" as const, dominantSubject: "hero" as const },
      ...Array.from({ length: 5 }, () => ({ importance: "normal" as const })),
    ];
    expect(pickLayoutForPage(page)).toBe("action_strip");
  });

  it("6 panels full dialogue/reaction => grid_2x3 (pas action_strip)", () => {
    const page = Array.from({ length: 6 }, () => ({
      importance: "normal" as const,
      dialogueDensity: "high" as const,
    }));
    expect(pickLayoutForPage(page)).toBe("grid_2x3");
  });

  it("hints absents => comportement legacy inchangé (6 normaux => grid_2x3)", () => {
    expect(
      pickLayoutForPage(Array.from({ length: 6 }, () => ({ importance: "normal" as const }))),
    ).toBe("grid_2x3");
  });
});

describe("manga pagination — Phase 4 allowFivePanel", () => {
  it("computePageSizes(5, {allowFivePanel:true}) → [5]", () => {
    expect(computePageSizes(5, { allowFivePanel: true })).toEqual([5]);
  });

  it("computePageSizes(5) legacy toujours [3,2]", () => {
    expect(computePageSizes(5)).toEqual([3, 2]);
  });

  it("computePageSizes(10, {allowFivePanel:true}) → [5,5]", () => {
    expect(computePageSizes(10, { allowFivePanel: true })).toEqual([5, 5]);
  });

  it("pickLayoutForPage(5, {allowFivePanel:true}) sans major → grid_1_2_2", () => {
    const page = Array.from({ length: 5 }, () => ({ importance: "normal" as const }));
    expect(pickLayoutForPage(page, { allowFivePanel: true })).toBe("grid_1_2_2");
  });

  it("pickLayoutForPage(5, {allowFivePanel:true}) avec major → hero_top_2_2", () => {
    const page = [
      { importance: "major" as const },
      ...Array.from({ length: 4 }, () => ({ importance: "normal" as const })),
    ];
    expect(pickLayoutForPage(page, { allowFivePanel: true })).toBe("hero_top_2_2");
  });
});

describe("manga pagination — buildMangaPagesFromPanels", () => {
  it("invariant cœur : 75 panels → 75 panels rendus, aucun perdu", () => {
    const panels = Array.from({ length: 75 }, (_, i) => makePanel(i + 1, { sceneId: `scene-${Math.floor(i / 6) + 1}` }));
    const pages = buildMangaPagesFromPanels(panels);
    const rendered = pages.flatMap((p) => p.panels);
    expect(rendered.length).toBe(75);
  });

  it("invariant cœur : ordre strict préservé", () => {
    const panels = Array.from({ length: 30 }, (_, i) => makePanel(i + 1, { sceneId: `scene-${Math.floor(i / 4) + 1}` }));
    const pages = buildMangaPagesFromPanels(panels);
    const rendered = pages.flatMap((p) => p.panels);
    rendered.forEach((p, idx) => {
      expect(p.id).toBe(`p${idx + 1}`);
    });
  });

  it("bug historique : scène de 12 panels → plusieurs pages (plus de slice(0,6))", () => {
    const panels = Array.from({ length: 12 }, (_, i) => makePanel(i + 1, { sceneId: "scene-A" }));
    const pages = buildMangaPagesFromPanels(panels);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages.flatMap((p) => p.panels).length).toBe(12);
  });

  it("scène de 20 panels → 4 pages (6+6+4+4 ou équivalent), aucun panel perdu", () => {
    const panels = Array.from({ length: 20 }, (_, i) => makePanel(i + 1, { sceneId: "scene-A" }));
    const pages = buildMangaPagesFromPanels(panels);
    expect(pages.flatMap((p) => p.panels).length).toBe(20);
    expect(pages.every((p) => p.panels.length >= 1 && p.panels.length <= 6 && p.panels.length !== 5)).toBe(true);
  });

  it("scène unique de 75 panels → pages totalisant 75, aucune vide, aucune à 5", () => {
    const panels = Array.from({ length: 75 }, (_, i) => makePanel(i + 1, { sceneId: "scene-unique" }));
    const pages = buildMangaPagesFromPanels(panels);
    expect(pages.flatMap((p) => p.panels).length).toBe(75);
    expect(pages.every((p) => p.panels.length >= 1 && p.panels.length <= 6 && p.panels.length !== 5)).toBe(true);
  });

  it("panel splash isolé sur sa propre page", () => {
    const panels: MangaPaginatorPanel[] = [
      makePanel(1),
      makePanel(2, { isSplash: true }),
      makePanel(3),
      makePanel(4),
    ];
    const pages = buildMangaPagesFromPanels(panels);
    const splashPage = pages.find((p) => p.isSplashPage);
    expect(splashPage).toBeDefined();
    expect(splashPage!.panels.length).toBe(1);
    expect(splashPage!.panels[0]!.id).toBe("p2");
  });

  it("respectSceneBoundaries: true (default) — scènes courtes groupées par scène", () => {
    const panels: MangaPaginatorPanel[] = [
      ...Array.from({ length: 3 }, (_, i) => makePanel(i + 1, { sceneId: "scene-1" })),
      ...Array.from({ length: 4 }, (_, i) => makePanel(i + 1, { sceneId: "scene-2" })),
    ];
    const pages = buildMangaPagesFromPanels(panels);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.panels.every((p) => p.sceneId === "scene-1")).toBe(true);
    expect(pages[1]!.panels.every((p) => p.sceneId === "scene-2")).toBe(true);
  });

  it("respectSceneBoundaries: false — remplit maximalement", () => {
    const panels: MangaPaginatorPanel[] = [
      ...Array.from({ length: 3 }, (_, i) => makePanel(i + 1, { sceneId: "scene-1" })),
      ...Array.from({ length: 3 }, (_, i) => makePanel(i + 100, { sceneId: "scene-2" })),
    ];
    const pages = buildMangaPagesFromPanels(panels, { respectSceneBoundaries: false });
    // 6 panels mixés → 1 page
    expect(pages).toHaveLength(1);
    expect(pages[0]!.panels).toHaveLength(6);
  });

  it("entrée vide → [] (pas de crash)", () => {
    expect(buildMangaPagesFromPanels([])).toEqual([]);
  });

  it("aucune page ne fait 5 panels, quel que soit l'input", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 17, 23, 50, 75, 100]) {
      const panels = Array.from({ length: n }, (_, i) => makePanel(i + 1));
      const pages = buildMangaPagesFromPanels(panels);
      const sizes = pages.map((p) => p.panels.length);
      expect(
        sizes.every((s) => s !== 5),
        `Input ${n} panels a produit une page de 5 : sizes=[${sizes.join(",")}]`,
      ).toBe(true);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
    }
  });

  it("dominantSceneId est la scène majoritaire de la page", () => {
    const panels: MangaPaginatorPanel[] = [
      ...Array.from({ length: 5 }, (_, i) => makePanel(i + 1, { sceneId: "scene-1" })),
      makePanel(6, { sceneId: "scene-2" }),
    ];
    const pages = buildMangaPagesFromPanels(panels, { respectSceneBoundaries: false });
    expect(pages[0]!.dominantSceneId).toBe("scene-1");
  });
});

describe("manga pagination — derivePanelImportance", () => {
  it("isSplash: true → splash (priorité absolue)", () => {
    expect(derivePanelImportance({ isSplash: true, shotType: "close_up" })).toBe("splash");
  });

  it("shotType establishing_shot → major", () => {
    expect(derivePanelImportance({ shotType: "establishing_shot" })).toBe("major");
  });

  it("cutawayType environment_establishing → insert", () => {
    expect(derivePanelImportance({ cutawayType: "environment_establishing" })).toBe("insert");
  });

  it("rien renseigné → normal", () => {
    expect(derivePanelImportance({})).toBe("normal");
    expect(derivePanelImportance(null)).toBe("normal");
    expect(derivePanelImportance(undefined)).toBe("normal");
  });

  it("panelRole climax → major", () => {
    expect(derivePanelImportance({ panelRole: "climax" })).toBe("major");
  });

  it("slotType wide → major", () => {
    expect(derivePanelImportance({ slotType: "wide" })).toBe("major");
  });
});
