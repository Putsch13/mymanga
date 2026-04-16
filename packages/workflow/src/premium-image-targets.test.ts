import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("premium image targets — 75 minimum", () => {
  it("chapter-runtime defaults to 75 minimumImages", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../core/src/chapter-runtime.ts"),
      "utf-8",
    );
    expect(source).toMatch(/minimumImages.*\?\?\s*75/);
    expect(source).not.toMatch(/minimumImages.*\?\?\s*55/);
  });

  it("chapter-runtime-helpers defaults to 75", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "chapter-runtime-helpers.ts"),
      "utf-8",
    );
    expect(source).toMatch(/75/);
    expect(source).not.toMatch(/CHAPTER_MIN_ACCEPTED_IMAGES.*"55"/);
  });

  it("pipeline defaults to 75 in recovery pass", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "passes/image-generation-pass.ts"),
      "utf-8",
    );
    // Find the minimumImages fallback in the recovery section
    const match = source.match(/minimumImages[\s\S]{0,50}:\s*75/);
    expect(match).toBeTruthy();
  });
});
