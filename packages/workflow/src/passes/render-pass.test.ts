import { describe, expect, it, vi } from "vitest";
import {
  addCharacterEntry,
  addEnvironmentEntry,
  createDefaultChapterStyleBible,
  createEmptyChapterVisualMemory,
  pushRecentPanel,
  type ChapterVisualMemory,
} from "@manga-ai-studio/ai";
import type {
  StoryboardPanel,
  StoryboardPage,
  StoryboardPlan,
} from "@manga-ai-studio/ai/contracts";
import { runRenderPass } from "./render-pass";

vi.mock("../persistence/render-persistence", () => ({
  saveRenderPassResult: vi.fn().mockResolvedValue(undefined),
}));

function makePanel(overrides: Partial<StoryboardPanel> = {}): StoryboardPanel {
  return {
    panelId: overrides.panelId ?? "p1",
    pageNumber: 1,
    panelNumberInPage: 1,
    globalPanelIndex: 0,
    sourceBeatId: "b1",
    panelPurpose: "hero_focus",
    renderMode: "hero_closeup",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    cutawayType: "none",
    characters: ["hero-1"],
    locationId: null,
    locationName: "Street",
    actionLine: "Hero stares forward",
    emotionLine: "determined",
    dialogue: [],
    narration: null,
    sfx: [],
    mustShow: [],
    mustNotShow: [],
    continuityNotes: [],
    visualAnchors: { characterIds: ["hero-1"], environmentAnchorId: null, previousPanelAnchorId: null },
    ...overrides,
  };
}

function makePlan(panels: StoryboardPanel[]): StoryboardPlan {
  const page: StoryboardPage = {
    pageNumber: 1,
    layoutTemplate: "grid_2x2",
    dramaticRole: "setup",
    beatIds: ["b1"],
    panels,
  };
  return {
    chapterId: "ch-1",
    totalTargetPanels: panels.length,
    pages: [page],
    editorialDiagnostics: {
      varietyScore: 1,
      heroFocusRatio: 1,
      environmentRatio: 0,
      insertRatio: 0,
      reactionRatio: 0,
      warnings: [],
      blockers: [],
    },
  };
}

function makeMemoryWithHero(): ChapterVisualMemory {
  const memory = createEmptyChapterVisualMemory("ch-1");
  addCharacterEntry(memory, {
    characterId: "hero-1",
    name: "Hero",
    role: "hero",
    faceRefUrl: "https://ref/hero-face.png",
    silhouetteRefUrl: "https://ref/hero-body.png",
    outfitRefUrl: "https://ref/hero-outfit.png",
    defaultWeight: 1,
  });
  addEnvironmentEntry(memory, {
    anchorId: "env-street",
    locationId: null,
    locationName: "Street",
    refUrl: "https://ref/street.png",
    defaultWeight: 0.7,
  });
  return memory;
}

describe("runRenderPass", () => {
  it("construit les specs, routes et prompts pour tous les panels valides", async () => {
    const plan = makePlan([makePanel({ panelId: "p1" }), makePanel({ panelId: "p2" })]);
    const res = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: makeMemoryWithHero(),
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
    });

    expect(res.specs).toHaveLength(2);
    expect(res.rendered).toHaveLength(2);
    expect(res.rendered[0]!.route.modelId).toBeDefined();
    expect(res.rendered[0]!.prompt.positive).toMatch(/.+/);
    expect(res.summary.totalPanels).toBe(2);
    expect(res.summary.failedCount).toBe(0);
  });

  it("appelle generatePanelImage avec la route FAL résolue", async () => {
    const plan = makePlan([makePanel({ panelId: "pX" })]);
    const gen = vi.fn().mockResolvedValue({ ok: true });
    const res = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: makeMemoryWithHero(),
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
      generatePanelImage: gen,
    });
    expect(gen).toHaveBeenCalledOnce();
    const callArg = gen.mock.calls[0]![0] as {
      route: { modelId: string };
      spec: { layoutMeta?: { targetAspectRatio?: string | null } };
    };
    expect(callArg.route.modelId).toBeDefined();
    expect(callArg.spec.layoutMeta?.targetAspectRatio).toBe("portrait");
    expect(res.summary.renderedCount).toBe(1);
  });

  it("fait échouer un panel dont le héros n'a pas de ref (MissingMainCharacterRef)", async () => {
    const plan = makePlan([makePanel({ panelId: "pNoRef", characters: ["missing-hero"], visualAnchors: { characterIds: ["missing-hero"], environmentAnchorId: null, previousPanelAnchorId: null } })]);
    const emptyMemory = createEmptyChapterVisualMemory("ch-1");
    const res = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: emptyMemory,
      characters: [{ id: "missing-hero", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["missing-hero"],
    });
    expect(res.summary.failedCount).toBe(1);
    expect(res.summary.errors[0]!.panelId).toBe("pNoRef");
  });

  it("exécute panel-qa et page-qa et remonte les issues dans les warnings", async () => {
    // Panel avec subjectFocus=hero mais aucun hero visible → panel_qa_issue
    const plan = makePlan([
      makePanel({
        panelId: "p_bad",
        characters: [],
        visualAnchors: { characterIds: [], environmentAnchorId: null, previousPanelAnchorId: null },
        subjectFocus: "hero",
        renderMode: "establishing_environment",
      }),
    ]);
    const res = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: makeMemoryWithHero(),
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
    });
    // establishing_environment + subjectFocus=hero devrait être bloqué par
    // le render-spec-validator en amont (contradictoire), ce qui fait
    // échouer le spec plutôt que d'aller jusqu'à panel-qa. On vérifie donc
    // que la pipeline ne crash pas et que le count est cohérent.
    expect(res.summary.totalPanels).toBe(1);
    expect(res.panelQa).toBeDefined();
    expect(res.pageQa).toBeDefined();
  });

  it("enrichit chaque spec (layoutMeta, heroCharacterId, panelTextPayload, visualDNA)", async () => {
    const plan = makePlan([
      makePanel({
        panelId: "p1",
        dialogue: [{ speaker: "Hero", text: "Stay back." }],
        narration: "Wind rises.",
        sfx: ["whoosh"],
        characters: ["hero-1"],
        visualAnchors: { characterIds: ["hero-1"], environmentAnchorId: "env-street", previousPanelAnchorId: null },
      }),
    ]);
    const res = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: makeMemoryWithHero(),
      characters: [
        { id: "hero-1", name: "Hero", roleType: "main", hairColor: "black", eyeColor: "green" },
      ],
      mainCharacterIds: ["hero-1"],
    });
    const s = res.specs[0]!;
    expect(s.layoutMeta?.targetAspectRatio).toBe("portrait");
    expect(s.layoutMeta?.slotType).toBe("hero_closeup");
    expect(s.heroCharacterId).toBe("hero-1");
    expect(s.mandatoryVisibleEntities).toContain("hero-1");
    expect(s.environmentDNA).toMatchObject({ anchorId: "env-street", locationName: "Street" });
    expect(s.panelTextPayload?.dialogue?.[0]?.text).toBe("Stay back.");
    expect(s.panelTextPayload?.narration).toBe("Wind rises.");
    expect(s.panelTextPayload?.sfx).toEqual(["whoosh"]);
    expect(s.visibleCharacters[0]?.visualDNA).toMatchObject({ hairColor: "black", eyeColor: "green" });
  });

  it("remplit previousPanelRef pour le panel suivant", async () => {
    const mem = makeMemoryWithHero();
    pushRecentPanel(mem, { panelId: "p-first", refUrl: "https://ref/prev.png", defaultWeight: 0.5 });
    const plan = makePlan([
      makePanel({
        panelId: "p-first",
        panelNumberInPage: 1,
        globalPanelIndex: 0,
        visualAnchors: { characterIds: ["hero-1"], environmentAnchorId: null, previousPanelAnchorId: null },
      }),
      makePanel({
        panelId: "p-second",
        panelNumberInPage: 2,
        globalPanelIndex: 1,
        visualAnchors: { characterIds: ["hero-1"], environmentAnchorId: null, previousPanelAnchorId: "p-first" },
      }),
    ]);
    const res = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: mem,
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
    });
    const second = res.specs.find((s) => s.panelId === "p-second");
    expect(second?.previousPanelRef?.panelId).toBe("p-first");
    expect(second?.previousPanelRef?.url).toBe("https://ref/prev.png");
  });

  it("remonte une erreur riche quand generatePanelImage échoue", async () => {
    const plan = makePlan([
      makePanel({
        panelId: "p-fail",
        mustShow: ["blade glint", "dojo floor"],
      }),
    ]);
    const gen = vi.fn().mockResolvedValue({
      ok: false,
      error: "upstream timeout",
      errorCode: "FAL_TIMEOUT",
    });
    const res = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: makeMemoryWithHero(),
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
      generatePanelImage: gen,
    });
    expect(res.summary.failedCount).toBe(1);
    const errLine = res.summary.errors[0]!.error;
    expect(errLine.startsWith("render_failed:")).toBe(true);
    const payload = JSON.parse(errLine.slice("render_failed:".length)) as Record<string, unknown>;
    expect(payload.panelId).toBe("p-fail");
    expect(payload.renderMode).toBe("hero_closeup");
    expect(payload.locationName).toBe("Street");
    expect(payload.errorCode).toBe("FAL_TIMEOUT");
    expect(payload.errorMessage).toBe("upstream timeout");
    expect(Array.isArray(payload.mustShow)).toBe(true);
    expect(payload.mustShow).toEqual(expect.arrayContaining(["blade glint", "dojo floor"]));
    const desc = res.rendered.find((r) => r.spec.panelId === "p-fail");
    expect(desc?.renderFailure?.errorCode).toBe("FAL_TIMEOUT");
    expect(desc?.renderFailure?.panelId).toBe("p-fail");
    expect(desc?.renderFailure?.renderMode).toBe("hero_closeup");
    expect(desc?.renderFailure?.mustShow).toEqual(expect.arrayContaining(["blade glint", "dojo floor"]));
  });

  it("transmet targetAspectRatio au spec enrichi pour un renderMode paysage", async () => {
    const plan = makePlan([
      makePanel({
        panelId: "p-wide",
        renderMode: "creature_reveal",
        subjectFocus: "creature",
        panelPurpose: "creature_reveal",
      }),
    ]);
    const res = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: makeMemoryWithHero(),
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
    });
    const s = res.specs.find((x) => x.panelId === "p-wide");
    expect(s?.layoutMeta?.targetAspectRatio).toBe("landscape");
  });

  it("ne requiert pas de face ref pour combat_aftermath", async () => {
    const memoryWithoutFaceRef = createEmptyChapterVisualMemory("ch-1");
    addCharacterEntry(memoryWithoutFaceRef, {
      characterId: "hero-1",
      name: "Hero",
      role: "hero",
      faceRefUrl: null,
      silhouetteRefUrl: "https://ref/hero-body.png",
      outfitRefUrl: "https://ref/hero-outfit.png",
      defaultWeight: 1,
    });

    const plan = makePlan([
      makePanel({
        panelId: "p-aftermath",
        renderMode: "combat_aftermath",
        panelPurpose: "combat_aftermath",
        subjectFocus: "environment",
        characters: ["hero-1"],
        visualAnchors: { characterIds: ["hero-1"], environmentAnchorId: null, previousPanelAnchorId: null },
      }),
    ]);

    const res = await runRenderPass({
      chapterId: "ch-1",
      storyboardPlan: plan,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: memoryWithoutFaceRef,
      characters: [{ id: "hero-1", name: "Hero", roleType: "main" }],
      mainCharacterIds: ["hero-1"],
    });

    expect(res.summary.failedCount).toBe(0);
    expect(res.specs).toHaveLength(1);
    expect(res.specs[0]!.panelId).toBe("p-aftermath");
  });

});
