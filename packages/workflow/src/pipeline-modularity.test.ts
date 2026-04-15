import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const workflowSrc = path.resolve(__dirname, ".");

describe("pipeline modularity", () => {
  const expectedModules = [
    "pipeline-helpers.ts",
    "pipeline-scene-builder.ts",
    "pipeline-bundle-integrity.ts",
    "pipeline-image-persistence.ts",
    "pipeline-job.ts",
    "pipeline-quality.ts",
    "pipeline-lora.ts",
  ];

  for (const mod of expectedModules) {
    it(`module ${mod} exists and is importable`, () => {
      const filePath = path.join(workflowSrc, mod);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("export");
      expect(content.split("\n").length).toBeLessThan(250);
    });
  }

  it("main pipeline file has shrunk significantly", () => {
    const mainFile = path.join(workflowSrc, "run-full-chapter-pipeline.ts");
    const content = fs.readFileSync(mainFile, "utf-8");
    const lines = content.split("\n").length;
    // Was 4159, now should be significantly reduced
    expect(lines).toBeLessThan(3500);
  });

  it("pipeline-helpers exports pure functions", async () => {
    const mod = await import("./pipeline-helpers");
    expect(typeof mod.extractSceneFactions).toBe("function");
    expect(typeof mod.inferSceneWeather).toBe("function");
    expect(typeof mod.inferSceneTimeOfDay).toBe("function");
    expect(typeof mod.uniq).toBe("function");
    expect(typeof mod.asRecord).toBe("function");
  });

  it("pipeline-quality exports quality functions", async () => {
    const mod = await import("./pipeline-quality");
    expect(typeof mod.resolveEffectivePanelBlueprints).toBe("function");
    expect(typeof mod.findPanelBlueprint).toBe("function");
    expect(typeof mod.normalizeCreativeControls).toBe("function");
    expect(typeof mod.computeChapterQualityReport).toBe("function");
  });

  it("pipeline-job exports job management functions", async () => {
    const mod = await import("./pipeline-job");
    expect(typeof mod.setJobProgress).toBe("function");
    expect(typeof mod.mergeJobOutput).toBe("function");
  });
});
