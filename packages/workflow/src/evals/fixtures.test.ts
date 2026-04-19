/**
 * P2.3 — Eval harness : exécute chaque `RoutingFixture` à travers le pipeline
 * routing + scene assessment et vérifie les invariants attendus.
 *
 * Toute régression structurelle (ex: un cutaway décor qui redevient
 * CHARACTER_LOCK, un hero bias réintroduit) fera échouer ce fichier.
 */

import { describe, expect, it } from "vitest";
import { buildRoutingContextV2 } from "../routing-context";
import { computeFalSceneAssessment } from "@manga-ai-studio/ai";
import { ROUTING_FIXTURES } from "./fixtures";

describe("P2.3 — eval harness : routing fixtures", () => {
  for (const fixture of ROUTING_FIXTURES) {
    it(`[${fixture.id}] ${fixture.description}`, () => {
      const routingCtx = buildRoutingContextV2(fixture.input);

      // Invariant 1 : dominantKind attendu.
      expect(routingCtx.dominantSubject?.kind, `fixture=${fixture.id}`).toBe(
        fixture.expected.dominantKind,
      );

      // Invariant 2 : heroFocus attendu.
      expect(routingCtx.heroFocus, `fixture=${fixture.id}`).toBe(fixture.expected.heroFocus);
      if (fixture.forbidden.heroFocusMustBeFalse) {
        expect(routingCtx.heroFocus, `fixture=${fixture.id} heroFocus doit être false`).toBe(false);
      }

      const assessment = computeFalSceneAssessment(routingCtx);

      // Invariant 3 : panelCategory.
      if (fixture.expected.panelCategory) {
        expect(assessment.panelCategory, `fixture=${fixture.id}`).toBe(
          fixture.expected.panelCategory,
        );
      }

      // Invariant 4 : panelCategory pas dans la liste interdite.
      if (fixture.forbidden.panelCategoryNotIn) {
        expect(
          fixture.forbidden.panelCategoryNotIn.includes(
            assessment.panelCategory as (typeof fixture.forbidden.panelCategoryNotIn)[number],
          ),
          `fixture=${fixture.id} panelCategory ${assessment.panelCategory} est interdit`,
        ).toBe(false);
      }

      // Invariant 5 : referencePolicy dans un set attendu.
      if (fixture.expected.referencePolicyIn && fixture.expected.referencePolicyIn.length > 0) {
        expect(
          fixture.expected.referencePolicyIn.includes(
            assessment.referencePolicy as (typeof fixture.expected.referencePolicyIn)[number],
          ),
          `fixture=${fixture.id} referencePolicy=${assessment.referencePolicy}`,
        ).toBe(true);
      }
    });
  }

  it("le dataset contient au moins 10 fixtures couvrant les cas critiques", () => {
    expect(ROUTING_FIXTURES.length).toBeGreaterThanOrEqual(10);
    const ids = ROUTING_FIXTURES.map((f) => f.id);
    // Cas critiques imposés par le TODO :
    expect(ids).toContain("hero-closeup");
    expect(ids).toContain("enemy-closeup-with-hero-present");
    expect(ids).toContain("reaction-npc");
    expect(ids).toContain("crowd-scene");
    expect(ids).toContain("prop-insert");
    expect(ids).toContain("environment-establishing");
    expect(ids).toContain("aftermath-panel");
    expect(ids).toContain("transition-panel");
  });
});
