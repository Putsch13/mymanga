import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Phase 5 — une seule vérité UI : pas de bloc « Auto-déductions narratives »
 * principal lorsque le plan canonique est présent.
 */
describe("chapter-plan-step — métriques legacy masquées si plan canonique", () => {
  it("le sous-composant LegacyMetricsCard lie Auto-déductions à l'absence de plan canonique", () => {
    // P5.2 — le fichier `chapter-plan-step.tsx` a été découpé en sous-composants
    // pour rester sous 500 LOC. La logique "Auto-déductions vs Debug legacy" vit
    // désormais dans `chapter-plan/legacy-metrics-card.tsx`. Le test pointe sur
    // le sous-composant pour rester sur du test source-strings.
    const root = path.resolve(__dirname, "..");
    const source = fs.readFileSync(
      path.join(root, "components/studio/chapter-plan/legacy-metrics-card.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/Auto-déductions narratives/);
    expect(source).toMatch(/!canonicalPlan/);
    expect(source).toMatch(/Debug — métriques legacy/);
  });
});
