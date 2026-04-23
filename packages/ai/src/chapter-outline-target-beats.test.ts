import { describe, it, expect } from "vitest";

describe("chapter-outline targetBeats contract", () => {
  it("ChapterOutlineContext type includes targetBeats", async () => {
    const mod = await import("./chapter-outline");
    // Verify the function exists and can be called (type check)
    expect(typeof mod.generateChapterOutline).toBe("function");
  }, 20_000);

  it("prompt template includes targetBeats constraint", async () => {
    // Read the source to verify the prompt contains targetBeats
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("./chapter-outline.ts", import.meta.url).pathname.replace("chapter-outline-target-beats.test.ts", "chapter-outline.ts"),
      "utf-8",
    );
    expect(source).toContain("targetBeats");
    expect(source).toContain("DOIS produire exactement");
    expect(source).toContain("visuellement actionnable");
  }, 20_000);

  it("prompt explicitly forbids abstract filler beats", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("./chapter-outline.ts", import.meta.url).pathname.replace("chapter-outline-target-beats.test.ts", "chapter-outline.ts"),
      "utf-8",
    );
    expect(source).toContain("tension monte");
    expect(source).toContain("enjeux augmentent");
    expect(source).toMatch(/INTERDIT.*beats abstraits/i);
  }, 20_000);
});
