import { describe, it, expect } from "vitest";
import { GOLDEN_FIXTURES } from "./fixtures";
import { buildCanonicalChapterProductionPlan } from "../../build-canonical-production-plan";
import { canonicalPlanToPanelBlueprints } from "../../canonical-to-premium-blueprints";
import { allocateContractualVisualSlots } from "../../allocate-contractual-visual-slots";
import type { PanelBlueprintPremium } from "../../canonical-to-premium-blueprints";

function inlineContractualCheck(blueprints: PanelBlueprintPremium[]) {
  let envPanels = 0;
  let propInserts = 0;
  let enemyFocus = 0;
  let npcPanels = 0;
  const blocking: string[] = [];

  for (const bp of blueprints) {
    if (bp.subjectFocus === "environment") envPanels++;
    if (bp.subjectFocus === "prop" || bp.cutawayType === "prop_insert") propInserts++;
    if (bp.subjectFocus === "enemy") enemyFocus++;
    if (bp.subjectFocus === "npc" || bp.subjectFocus === "group") npcPanels++;
  }

  const hasEnemyObligation = blueprints.some(
    (bp) => (bp as Record<string, unknown>).mustShowEnemy === true,
  );
  const hasMandatoryProp = blueprints.some(
    (bp) => Array.isArray(bp.requiredProps) && bp.requiredProps.some((p: { mustBeVisible?: boolean }) => p.mustBeVisible),
  );

  if (envPanels === 0 && blueprints.length > 3) blocking.push("missing_environment");
  if (hasEnemyObligation && enemyFocus === 0) blocking.push("missing_enemy_focus");
  if (hasMandatoryProp && propInserts === 0) blocking.push("missing_prop_insert");

  return { envPanels, propInserts, enemyFocus, npcPanels, blocking };
}

describe("Golden Fixtures — Production Plan QA", () => {
  for (const fixture of GOLDEN_FIXTURES) {
    describe(fixture.label, () => {
      const outline = {
        source: "golden_test",
        chapterGoal: fixture.label,
        cliffhanger: "Test cliffhanger",
        beats: fixture.beats,
        totalEstimatedPanels: fixture.beats.length * 12,
      };

      const plan = buildCanonicalChapterProductionPlan({
        chapterId: `golden-${fixture.id}`,
        projectId: "test-project",
        chapterNumber: 1,
        chapterTitle: fixture.label,
        format: "manga",
        rawOutline: outline,
      });

      const blueprints = canonicalPlanToPanelBlueprints(plan);

      it(`should produce ${fixture.assertions.minPanels}-${fixture.assertions.maxPanels} panels`, () => {
        expect(blueprints.length).toBeGreaterThanOrEqual(fixture.assertions.minPanels);
        expect(blueprints.length).toBeLessThanOrEqual(fixture.assertions.maxPanels);
      });

      if (fixture.assertions.expectEnvironment) {
        it("should have at least 1 environment panel", () => {
          const check = inlineContractualCheck(blueprints);
          expect(check.envPanels).toBeGreaterThanOrEqual(1);
        });
      }

      if (fixture.assertions.expectNoBlockingViolations) {
        it("should have no blocking violations", () => {
          const check = inlineContractualCheck(blueprints);
          expect(check.blocking).toEqual([]);
        });
      }

      if (fixture.visualWorld) {
        it("should allocate contractual slots from VisualWorld", () => {
          const slots = allocateContractualVisualSlots(fixture.beats, fixture.visualWorld as Parameters<typeof allocateContractualVisualSlots>[1]);
          if (fixture.assertions.expectPropInsert) {
            expect(slots.some((s) => s.requiredRole === "prop")).toBe(true);
          }
          if (fixture.assertions.expectNpcPanel) {
            expect(slots.some((s) => s.requiredRole === "npc")).toBe(true);
          }
        });
      }
    });
  }
});
