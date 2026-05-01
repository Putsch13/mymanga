import { describe, it, expect } from "vitest";
import { buildCanonicalChapterProductionPlan } from "./build-canonical-production-plan";
import { canonicalPlanToPanelBlueprints } from "./canonical-to-premium-blueprints";
import { buildCanonicalProductionPlanFromPremiumBlueprints } from "./blueprint-to-canonical-plan";
import { mergeRawBlueprintsWithCanonicalRhythm } from "./merge-raw-blueprints-with-canonical-rhythm";
import type { PanelBlueprintPremium } from "../types/narrative-facts";

const rawOutlineManga = {
  source: "test",
  chapterGoal: "Chapter goal text for normalization minimum length",
  cliffhanger: "Cliffhanger text here for the chapter end",
  beats: Array.from({ length: 10 }, (_, i) => ({
    beatId: `beat_${i + 1}`,
    summary: `Beat ${i + 1} narrative summary content here`,
    narrativeFunction: "progression",
    involvedCharacters: ["hero-1"],
    estimatedPanels: 8,
    criticality: "medium",
  })),
};

/** Plan canonique dont le premier blueprint porte du DNA (pour tester nonEmpty*). */
function canonicalPlanWithDnaOnFirstPanel(): {
  canonical: ReturnType<typeof buildCanonicalChapterProductionPlan>;
  dnaBlueprints: PanelBlueprintPremium[];
} {
  const canonical = buildCanonicalChapterProductionPlan({
    chapterId: "ch1",
    projectId: "p1",
    chapterNumber: 1,
    chapterTitle: "T",
    format: "manga",
    rawOutline: rawOutlineManga,
  });
  const bps = canonicalPlanToPanelBlueprints(canonical);
  const dnaBlueprints = bps.map((bp, i) =>
    i === 0
      ? {
          ...bp,
          characterVisualDna: [{ characterId: "hero-1", displayName: "CanonHero" }],
          npcVisualDna: [{ continuityId: "npc1", displayName: "CanonNpc" }],
          environmentVisualDna: {
            locationName: "CanonCafé",
            visualAnchors: ["lustre"],
          },
        }
      : bp,
  );
  return { canonical, dnaBlueprints };
}

describe("mergeRawBlueprintsWithCanonicalRhythm", () => {
  it("conserve le purpose des blueprints riches et aligne panelId/page sur le canonique", () => {
    const canonical = buildCanonicalChapterProductionPlan({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      rawOutline: rawOutlineManga,
    });
    const generic = canonicalPlanToPanelBlueprints(canonical);
    const rich: PanelBlueprintPremium[] = generic.map((bp, i) => ({
      ...bp,
      purpose: `RICH_PURPOSE_${i}`,
    }));
    const merged = mergeRawBlueprintsWithCanonicalRhythm(rich, canonical);
    expect(merged.length).toBe(canonical.panels.length);
    for (let i = 0; i < merged.length; i++) {
      expect(merged[i]!.panelId).toBe(canonical.panels[i]!.panelId);
      expect(merged[i]!.pageNumber).toBe(canonical.panels[i]!.pageNumber);
      expect(merged[i]!.purpose).toBe(`RICH_PURPOSE_${i}`);
      expect(merged[i]!.provenance?.origin).toBe("author_raw_merged");
      expect(merged[i]!.provenance?.canonicalPanelId).toBe(canonical.panels[i]!.panelId);
      expect(merged[i]!.provenance?.canonicalBeatId).toBe(canonical.panels[i]!.beatId);
      expect(merged[i]!.textContract).toBeDefined();
    }
  });

  it("retombe sur la projection canonique si aucun blueprint brut", () => {
    const canonical = buildCanonicalChapterProductionPlan({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      rawOutline: rawOutlineManga,
    });
    const merged = mergeRawBlueprintsWithCanonicalRhythm([], canonical);
    const direct = canonicalPlanToPanelBlueprints(canonical);
    expect(merged.length).toBe(direct.length);
    expect(merged[0]?.provenance?.origin).toBe("canonical_projection");
  });

  it("ne laisse pas des cutaways bruts / clones padding violer la QA structurelle sur le plan persisté", () => {
    const canonical = buildCanonicalChapterProductionPlan({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      rawOutline: rawOutlineManga,
    });
    expect(canonical.qa.valid).toBe(true);

    const canonicalBlueprints = canonicalPlanToPanelBlueprints(canonical);
    const raw = canonicalBlueprints
      .filter((_, index) => index % 2 === 0)
      .slice(0, 40)
      .map((bp, index) => ({
        ...bp,
        purpose: `RAW_${index}`,
      }));

    for (let i = 0; i < raw.length; i += 4) {
      const slot = raw[i];
      if (!slot) continue;
      raw[i] = {
        ...slot,
        cutawayType: "environment",
        subjectFocus: "environment",
        requiredCharacterIds: [],
        mustShowCharacterIds: [],
        dialogueCarrier: undefined,
        speakerAnchorCharacterId: null,
      };
    }

    const merged = mergeRawBlueprintsWithCanonicalRhythm(raw, canonical);

    const rebuilt = buildCanonicalProductionPlanFromPremiumBlueprints({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      productionOutline: rawOutlineManga,
      blueprints: merged,
    });

    expect(rebuilt.qa.valid).toBe(true);
    expect(rebuilt.qa.errors).toEqual([]);
    expect(rebuilt.metrics.cutawayRatio).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(rebuilt.metrics.actorDrivenRatio).toBeGreaterThanOrEqual(0.7 - 1e-9);
  });

  it("raw characterVisualDna vide ne masque pas le DNA canonique non vide", () => {
    const { dnaBlueprints } = canonicalPlanWithDnaOnFirstPanel();
    const rebuilt = buildCanonicalProductionPlanFromPremiumBlueprints({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      productionOutline: rawOutlineManga,
      blueprints: dnaBlueprints,
    });
    expect(rebuilt.qa.valid).toBe(true);
    const canonicalBps = canonicalPlanToPanelBlueprints(rebuilt);
    const raw = dnaBlueprints.map((bp) => ({ ...bp, characterVisualDna: [] as typeof bp.characterVisualDna }));
    const merged = mergeRawBlueprintsWithCanonicalRhythm(raw, rebuilt);
    expect(merged[0]?.characterVisualDna).toEqual(canonicalBps[0]?.characterVisualDna);
  });

  it("raw npcVisualDna vide ne masque pas le DNA canonique non vide", () => {
    const { dnaBlueprints } = canonicalPlanWithDnaOnFirstPanel();
    const rebuilt = buildCanonicalProductionPlanFromPremiumBlueprints({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      productionOutline: rawOutlineManga,
      blueprints: dnaBlueprints,
    });
    expect(rebuilt.qa.valid).toBe(true);
    const canonicalBps = canonicalPlanToPanelBlueprints(rebuilt);
    const raw = dnaBlueprints.map((bp) => ({ ...bp, npcVisualDna: [] }));
    const merged = mergeRawBlueprintsWithCanonicalRhythm(raw, rebuilt);
    expect(merged[0]?.npcVisualDna).toEqual(canonicalBps[0]?.npcVisualDna);
  });

  it("raw environmentVisualDna vide ne masque pas le decor canonique non vide", () => {
    const { dnaBlueprints } = canonicalPlanWithDnaOnFirstPanel();
    const rebuilt = buildCanonicalProductionPlanFromPremiumBlueprints({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      productionOutline: rawOutlineManga,
      blueprints: dnaBlueprints,
    });
    expect(rebuilt.qa.valid).toBe(true);
    const canonicalBps = canonicalPlanToPanelBlueprints(rebuilt);
    const raw = dnaBlueprints.map((bp) => ({
      ...bp,
      environmentVisualDna: { locationName: "", visualAnchors: [] } as PanelBlueprintPremium["environmentVisualDna"],
    }));
    const merged = mergeRawBlueprintsWithCanonicalRhythm(raw, rebuilt);
    expect(merged[0]?.environmentVisualDna).toEqual(canonicalBps[0]?.environmentVisualDna);
  });

  it("raw characterVisualDna non vide est conserve face au canon", () => {
    const canonical = buildCanonicalChapterProductionPlan({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      rawOutline: rawOutlineManga,
    });
    const canonicalBps = canonicalPlanToPanelBlueprints(canonical);
    const rawDna = [{ characterId: "x", displayName: "RawWins" }];
    const raw = canonicalBps.map((bp, i) => (i === 0 ? { ...bp, characterVisualDna: rawDna } : bp));
    const merged = mergeRawBlueprintsWithCanonicalRhythm(raw, canonical);
    expect(merged[0]?.characterVisualDna).toEqual(rawDna);
  });

  it("sans DNA canonique sur le plan, raw vide → characterVisualDna []", () => {
    const canonical = buildCanonicalChapterProductionPlan({
      chapterId: "ch1",
      projectId: "p1",
      chapterNumber: 1,
      chapterTitle: "T",
      format: "manga",
      rawOutline: rawOutlineManga,
    });
    const canonicalBps = canonicalPlanToPanelBlueprints(canonical);
    const raw = canonicalBps.map((bp) => ({ ...bp, characterVisualDna: [] as typeof bp.characterVisualDna }));
    const merged = mergeRawBlueprintsWithCanonicalRhythm(raw, canonical);
    expect(merged[0]?.characterVisualDna).toEqual([]);
  });
});
