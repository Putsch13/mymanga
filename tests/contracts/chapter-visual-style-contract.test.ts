import { describe, expect, it } from "vitest";
import { chapterVisualStyleContractSchema } from "@manga-ai-studio/core";

describe("chapterVisualStyleContractSchema (P0.10)", () => {
  it("parse un style minimal valide", () => {
    const s = chapterVisualStyleContractSchema.parse({
      format: "manga",
      colorMode: "bw",
      styleGenre: "cyberpunk néon",
      forbiddenVisualDrift: ["pas de 3D"],
    });
    expect(s.format).toBe("manga");
    expect(s.forbiddenVisualDrift).toContain("pas de 3D");
  });
});
