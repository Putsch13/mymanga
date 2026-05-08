/**
 * TEST-1 — Phase 4 hardening
 *
 * Garde-fous pour `validateVisualCoverage` (FIX-3 régression-guard) :
 *  - un coverage avec `tokensHint` non-vide doit matcher dans
 *    `panel.mustShow`, `panel.actionLine` OU `panel.visualAnchors.characterIds`.
 *  - sans `tokensHint`, c'est seulement le couple (renderMode, subjectFocus)
 *    qui décide.
 *  - test critique : un panel doté de `visualAnchors.characterIds = ["char_123"]`
 *    couvre une obligation `tokensHint: ["char_123"]` (sans avoir à dupliquer
 *    le label dans `mustShow`).
 */
import { describe, it, expect } from "vitest";
import { validateVisualCoverage } from "./visual-coverage-validator";
import type { RequiredVisualCoverage } from "../services/required-visual-coverage";
import type { StoryboardPlan, StoryboardPanel } from "../contracts/storyboard-plan";

function makePanel(overrides: Partial<StoryboardPanel> & { panelId: string }): StoryboardPanel {
  return {
    panelId: overrides.panelId,
    pageNumber: 1,
    panelNumberInPage: 1,
    globalPanelIndex: 0,
    sourceBeatId: "b1",
    panelPurpose: "establish",
    renderMode: "wide_establishing",
    shotType: "wide",
    cameraAngle: "eye_level",
    subjectFocus: "environment",
    cutawayType: "environment",
    characters: [],
    locationId: null,
    locationName: "",
    actionLine: "",
    emotionLine: "",
    dialogue: [],
    narration: null,
    sfx: [],
    mustShow: [],
    mustNotShow: [],
    continuityNotes: [],
    visualAnchors: { characterIds: [], environmentAnchorId: null, previousPanelAnchorId: null },
    ...overrides,
  } as StoryboardPanel;
}

function asPlan(panels: StoryboardPanel[]): StoryboardPlan {
  return {
    pages: [{ pageNumber: 1, layoutTemplateId: "single", panels }],
    metadata: { totalPages: 1, totalPanels: panels.length },
  } as unknown as StoryboardPlan;
}

const baseCoverage: Omit<RequiredVisualCoverage, "tokensHint"> = {
  entity: "ancient sword",
  entityType: "prop",
  sourceBeatId: "b1",
  requiresDedicatedPanel: true,
  acceptedRenderModes: ["object_insert"],
  acceptedSubjectFocuses: ["prop"],
  contractKind: "narrative_required",
};

describe("validateVisualCoverage", () => {
  it("ok=true quand un panel matche renderMode + subjectFocus sans tokensHint", () => {
    const cov: RequiredVisualCoverage = { ...baseCoverage, tokensHint: [] };
    const plan = asPlan([
      makePanel({
        panelId: "p1",
        renderMode: "object_insert",
        subjectFocus: "prop",
      }),
    ]);
    const result = validateVisualCoverage([cov], plan);
    expect(result.ok).toBe(true);
    expect(result.gaps).toHaveLength(0);
    expect(result.fulfilled[0]?.fulfilledByPanelIds).toEqual(["p1"]);
  });

  it("ok=false (gap) quand renderMode et subjectFocus ne matchent pas", () => {
    const cov: RequiredVisualCoverage = { ...baseCoverage, tokensHint: [] };
    const plan = asPlan([
      makePanel({ panelId: "p1", renderMode: "wide_establishing", subjectFocus: "environment" }),
    ]);
    const result = validateVisualCoverage([cov], plan);
    expect(result.ok).toBe(false);
    expect(result.gaps).toHaveLength(1);
  });

  it("avec tokensHint : un token doit matcher dans mustShow / actionLine / panelPurpose", () => {
    const cov: RequiredVisualCoverage = {
      ...baseCoverage,
      tokensHint: ["sword"],
    };
    const matchingPanel = makePanel({
      panelId: "p1",
      renderMode: "object_insert",
      subjectFocus: "prop",
      mustShow: ["ancient sword on table"],
    });
    const nonMatchingPanel = makePanel({
      panelId: "p2",
      renderMode: "object_insert",
      subjectFocus: "prop",
      mustShow: ["random necklace"],
    });
    const result1 = validateVisualCoverage([cov], asPlan([matchingPanel]));
    expect(result1.ok).toBe(true);
    const result2 = validateVisualCoverage([cov], asPlan([nonMatchingPanel]));
    expect(result2.ok).toBe(false);
  });

  it("avec tokensHint : visualAnchors.characterIds participe aussi au match (FIX-3 regression-guard)", () => {
    // Cas réel rencontré : un coverage character avec tokensHint=[characterId]
    // mais le panel ne dupliquait pas l'id dans `mustShow`. Avant le fix, la
    // QA tombait en "fatal_gap" alors que le panel exposait bien le character
    // via visualAnchors.characterIds.
    const cov: RequiredVisualCoverage = {
      ...baseCoverage,
      entity: "Marius",
      entityType: "character",
      acceptedRenderModes: ["character_focus"],
      acceptedSubjectFocuses: ["hero"],
      tokensHint: ["char_marius"],
    };
    const panel = makePanel({
      panelId: "p1",
      renderMode: "character_focus",
      subjectFocus: "hero",
      mustShow: [], // <- pas de mention textuelle de l'id
      visualAnchors: {
        characterIds: ["char_marius"],
        environmentAnchorId: null,
        previousPanelAnchorId: null,
      },
    });
    const result = validateVisualCoverage([cov], asPlan([panel]));
    expect(result.ok).toBe(true);
    expect(result.fulfilled[0]?.fulfilledByPanelIds).toEqual(["p1"]);
  });

  it("avec tokensHint : sans characterIds ni mustShow, on tombe en gap", () => {
    const cov: RequiredVisualCoverage = {
      ...baseCoverage,
      entity: "Marius",
      entityType: "character",
      acceptedRenderModes: ["character_focus"],
      acceptedSubjectFocuses: ["hero"],
      tokensHint: ["char_marius"],
    };
    const panel = makePanel({
      panelId: "p1",
      renderMode: "character_focus",
      subjectFocus: "hero",
      mustShow: ["sea breeze"],
      visualAnchors: {
        characterIds: ["char_someone_else"],
        environmentAnchorId: null,
        previousPanelAnchorId: null,
      },
    });
    const result = validateVisualCoverage([cov], asPlan([panel]));
    expect(result.ok).toBe(false);
    expect(result.gaps).toHaveLength(1);
  });

  it("plusieurs coverages indépendants : un seul gap suffit à rendre ok=false", () => {
    const cov1: RequiredVisualCoverage = { ...baseCoverage, tokensHint: [] };
    const cov2: RequiredVisualCoverage = {
      ...baseCoverage,
      entity: "monster",
      entityType: "creature",
      acceptedRenderModes: ["creature_reveal"],
      acceptedSubjectFocuses: ["enemy"],
      tokensHint: [],
    };
    const plan = asPlan([
      makePanel({ panelId: "p1", renderMode: "object_insert", subjectFocus: "prop" }),
    ]);
    const result = validateVisualCoverage([cov1, cov2], plan);
    expect(result.ok).toBe(false);
    expect(result.gaps).toHaveLength(1);
    expect(result.fulfilled).toHaveLength(1);
  });
});
