import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PANEL_RETRY_STRATEGIES } from "./retry-strategy";

const REPO = path.resolve(__dirname, "../../../..");

const FORBIDDEN_RAW = ["simpler_scene", "force_subject_focus"];

describe("panel retry strategies — liste officielle (phase 6)", () => {
  it("PANEL_RETRY_STRATEGIES contient simplify_scene et pas simpler_scene", () => {
    expect(PANEL_RETRY_STRATEGIES).toContain("simplify_scene");
    expect(PANEL_RETRY_STRATEGIES).not.toContain("simpler_scene");
  });

  it("les fichiers premium ne réintroduisent pas les alias legacy (hors retry-strategy.ts)", () => {
    const files = [
      "packages/workflow/src/passes/render-pass.ts",
      "packages/ai/src/quality/visual-panel-qa.ts",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(REPO, rel), "utf-8");
      for (const bad of FORBIDDEN_RAW) {
        expect(src.includes(bad), `${rel} ne doit pas contenir ${bad}`).toBe(false);
      }
    }
  });
});
