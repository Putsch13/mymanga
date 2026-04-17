import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("chapter recovery pass — contract tests", () => {
  const pipelineSource = fs.readFileSync(
    path.resolve(__dirname, "run-full-chapter-pipeline.ts"),
    "utf-8",
  );
  const imagePassSource = fs.readFileSync(
    path.resolve(__dirname, "passes/image-generation-pass.ts"),
    "utf-8",
  );
  const recoveryPassSource = fs.readFileSync(
    path.resolve(__dirname, "passes/image-generation/recovery-pass.ts"),
    "utf-8",
  );
  const combinedSource = pipelineSource + "\n" + imagePassSource + "\n" + recoveryPassSource;

  it("tracks failedShots during image generation loop", () => {
    expect(combinedSource).toContain("failedShots");
    expect(combinedSource).toMatch(/failedShots\.push/);
  });

  it("has a recovery pass that retries failed shots", () => {
    expect(combinedSource).toContain("[pipeline:recovery]");
    expect(combinedSource).toContain("recovery_pass");
    expect(combinedSource).toMatch(/recoveredCount/);
  });

  it("uses degraded mode in recovery (no Redux, NONE referencePolicy)", () => {
    expect(combinedSource).toContain('referencePolicy: "NONE"');
    expect(combinedSource).toContain('panelCategory: "CHARACTER_IN_SCENE"');
    expect(combinedSource).toContain('panelCriticality: "low"');
  });

  it("logs a chapter summary with all required metrics", () => {
    expect(combinedSource).toContain("[pipeline:chapter-summary]");
    expect(combinedSource).toContain("targetImages");
    expect(combinedSource).toContain("plannedShots");
    expect(combinedSource).toContain("attemptedShots");
    expect(combinedSource).toContain("succeededShots");
    expect(combinedSource).toContain("recoveredShots");
    expect(combinedSource).toContain("failedShots");
    expect(combinedSource).toContain("finalImages");
  });

  it("uses FAILED_INCOMPLETE status when quota not met", () => {
    expect(combinedSource).toContain("FAILED_INCOMPLETE");
    expect(combinedSource).toContain("COMPLETED");
  });

  it("default minimumImages is 75, not 55", () => {
    // The fallback should be 75
    expect(combinedSource).toMatch(/minimumImages[\s\S]{0,100}75/);
    // Should NOT have 55 as image target fallback
    const recoverySection = combinedSource.slice(
      combinedSource.indexOf("Recovery pass"),
      combinedSource.indexOf("chapter-summary") + 500,
    );
    expect(recoverySection).not.toMatch(/\b55\b/);
  });
});
