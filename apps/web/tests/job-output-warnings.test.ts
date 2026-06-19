import { describe, expect, it } from "vitest";
import { extractJobPipelineUserWarnings } from "@/lib/studio/job-output-warnings";

describe("extractJobPipelineUserWarnings", () => {
  it("agrège pipelineUserWarnings, degradedModes, warnings et continuité", () => {
    const w = extractJobPipelineUserWarnings({
      pipelineUserWarnings: ["Dialogue de scène — skipped"],
      degradedModes: ["DEGRADED_DIALOGUE_FALLBACK"],
      warnings: ["contract_warn"],
      continuityWarnings: { missingStableName: ["char-a", "char-b"] },
    });
    expect(w).toContain("Dialogue de scène — skipped");
    expect(w.some((x) => x.includes("Mode dégradé"))).toBe(true);
    expect(w).toContain("contract_warn");
    expect(w.some((x) => x.includes("char-a"))).toBe(true);
  });

  it("dédoublonne les lignes identiques", () => {
    expect(extractJobPipelineUserWarnings({ pipelineUserWarnings: ["x", "x", "x"] })).toEqual(["x"]);
  });

  it("retourne [] si output absent", () => {
    expect(extractJobPipelineUserWarnings(null)).toEqual([]);
    expect(extractJobPipelineUserWarnings(undefined)).toEqual([]);
  });

  it("remonte fallbackSceneIds dialogue diagnostics", () => {
    const w = extractJobPipelineUserWarnings({
      generationDiagnostics: { dialogue: { fallbackSceneIds: ["s1", "s2"] } },
    });
    expect(w.some((x) => x.includes("s1") && x.includes("s2"))).toBe(true);
  });
});
