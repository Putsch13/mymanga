import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * COMMIT E — garde-fous anti-régression sur les cibles d'images premium.
 *
 * Avant : la cible premium était hardcodée à 75 partout.
 * Maintenant : une RANGE `PREMIUM_PANEL_RANGE` (min=70, target=72, max=75)
 * est exportée par `@manga-ai-studio/core` et TOUT le code doit y référer.
 *
 * Ces tests bloquent toute régression vers un hardcode 75/55/autre.
 */
describe("premium image targets — PREMIUM_PANEL_RANGE", () => {
  it("chapter-runtime utilise PREMIUM_PANEL_RANGE.target (72), plus aucun hardcode 75", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../core/src/chapter-runtime.ts"),
      "utf-8",
    );
    expect(source).toMatch(/minimumImages.*\?\?\s*PREMIUM_PANEL_RANGE\.target/);
    expect(source).not.toMatch(/minimumImages.*\?\?\s*75/);
    expect(source).not.toMatch(/minimumImages.*\?\?\s*55/);
  });

  it("chapter-runtime-helpers utilise PREMIUM_PANEL_RANGE.target en fallback", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "chapter-runtime-helpers.ts"),
      "utf-8",
    );
    expect(source).toMatch(/PREMIUM_PANEL_RANGE\.target/);
    expect(source).not.toMatch(/CHAPTER_MIN_ACCEPTED_IMAGES.*"55"/);
    expect(source).not.toMatch(/\?\?\s*parseNumEnv\(process\.env\.CHAPTER_MIN_ACCEPTED_IMAGES,\s*75\)/);
  });

  it("la range premium est bien 70-75 (min/target/max) via PRODUCTION_RULES", () => {
    const rangeSource = fs.readFileSync(
      path.resolve(__dirname, "../../core/src/premium-panel-range.ts"),
      "utf-8",
    );
    expect(rangeSource).toMatch(/PRODUCTION_RULES\.panelCount\.minimum/);
    expect(rangeSource).toMatch(/PRODUCTION_RULES\.panelCount\.target/);
    expect(rangeSource).toMatch(/PRODUCTION_RULES\.panelCount\.maximum/);
    const rulesSource = fs.readFileSync(
      path.resolve(__dirname, "../../core/src/production/production-rules.ts"),
      "utf-8",
    );
    expect(rulesSource).toMatch(/minimum:\s*70/);
    expect(rulesSource).toMatch(/target:\s*72/);
    expect(rulesSource).toMatch(/maximum:\s*75/);
  });
});
