import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Phase 5 — une seule vérité UI : pas de bloc « Auto-déductions narratives »
 * principal lorsque le plan canonique est présent.
 */
describe("chapter-plan-step — métriques legacy masquées si plan canonique", () => {
  it("le fichier source lie Auto-déductions à l'absence de plan canonique", () => {
    const root = path.resolve(__dirname, "..");
    const source = fs.readFileSync(
      path.join(root, "components/studio/chapter-plan-step.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/Auto-déductions narratives/);
    expect(source).toMatch(/!canonicalPlan/);
    expect(source).toMatch(/Debug — métriques legacy/);
  });
});
