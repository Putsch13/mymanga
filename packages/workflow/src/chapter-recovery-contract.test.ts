import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("chapter recovery pass — contract tests", () => {
  const pipelineSource = fs.readFileSync(
    path.resolve(__dirname, "run-full-chapter-pipeline.ts"),
    "utf-8",
  );

  it("tracks failedShots during image generation loop", () => {
    expect(pipelineSource).toContain("failedShots");
    expect(pipelineSource).toMatch(/failedShots\.push/);
  });

  it("has a recovery pass that retries failed shots", () => {
    expect(pipelineSource).toContain("[pipeline:recovery]");
    expect(pipelineSource).toContain("recovery_pass");
    expect(pipelineSource).toMatch(/recoveredCount/);
  });

  it("uses degraded mode in recovery (no Redux, NONE referencePolicy)", () => {
    expect(pipelineSource).toContain('referencePolicy: "NONE"');
    expect(pipelineSource).toContain('panelCategory: "CHARACTER_IN_SCENE"');
    expect(pipelineSource).toContain('panelCriticality: "low"');
  });

  it("logs a chapter summary with all required metrics", () => {
    expect(pipelineSource).toContain("[pipeline:chapter-summary]");
    expect(pipelineSource).toContain("targetImages");
    expect(pipelineSource).toContain("plannedShots");
    expect(pipelineSource).toContain("attemptedShots");
    expect(pipelineSource).toContain("succeededShots");
    expect(pipelineSource).toContain("recoveredShots");
    expect(pipelineSource).toContain("failedShots");
    expect(pipelineSource).toContain("finalImages");
  });

  it("uses FAILED_INCOMPLETE status when quota not met", () => {
    expect(pipelineSource).toContain("FAILED_INCOMPLETE");
    expect(pipelineSource).toContain("COMPLETED");
  });

  it("default minimumImages is 75, not 55", () => {
    // The fallback should be 75
    expect(pipelineSource).toMatch(/minimumImages[\s\S]{0,100}75/);
    // Should NOT have 55 as image target fallback
    const recoverySection = pipelineSource.slice(
      pipelineSource.indexOf("Recovery pass"),
      pipelineSource.indexOf("chapter-summary") + 500,
    );
    expect(recoverySection).not.toMatch(/\b55\b/);
  });
});
