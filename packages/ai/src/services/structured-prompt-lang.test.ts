import { describe, expect, it } from "vitest";
import {
  composePrioritizedPrompt,
  optimizePromptForFal,
  truncateByBudget,
} from "./structured-prompt-lang";

describe("truncateByBudget", () => {
  it("preserves all segments when under budget", () => {
    const result = truncateByBudget(["short one", "short two"], 100);
    expect(result).toBe("short one, short two");
  });

  it("cuts trailing segments first, never splits a segment", () => {
    const segments = ["critical lock", "important spatial", "decorative tail", "filler"];
    // Force cut : only first two should remain
    const result = truncateByBudget(segments, 40);
    expect(result).toBe("critical lock, important spatial");
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it("keeps at least the first segment even if it overflows", () => {
    const segments = ["a very long first segment that cannot be trimmed", "tail"];
    const result = truncateByBudget(segments, 10);
    expect(result).toBe("a very long first segment that cannot be trimmed");
  });
});

describe("optimizePromptForFal — segment-aware truncation (P0-1)", () => {
  it("does not cut a word in the middle", () => {
    const prompt = Array.from({ length: 200 }, (_, i) => `segment ${i}`).join(", ");
    const result = optimizePromptForFal(prompt, 500);
    expect(result.length).toBeLessThanOrEqual(500);
    // No trailing half-word
    expect(result.endsWith(",")).toBe(false);
    expect(result).not.toMatch(/\bsegme$|\bse$|\bs$/);
  });

  it("preserves head segments (critical prompts stay intact)", () => {
    const head = "CRITICAL character lock: same face, same hair, same outfit";
    const tail = Array.from({ length: 50 }, (_, i) => `filler ${i}`).join(", ");
    const result = optimizePromptForFal(`${head}, ${tail}`, 300);
    expect(result).toContain("CRITICAL character lock");
    expect(result.length).toBeLessThanOrEqual(300);
  });
});

describe("composePrioritizedPrompt — budget allocation by priority", () => {
  it("always keeps P1 segments even when P2/P3/P4 must be dropped", () => {
    const result = composePrioritizedPrompt(
      [
        { priority: 1, text: "P1-critical-lock" },
        { priority: 1, text: "P1-action-framing" },
        { priority: 2, text: Array.from({ length: 20 }, (_, i) => `P2-filler-${i}`).join(", ") },
        { priority: 4, text: "P4-decorative-tail" },
      ],
      200,
    );
    expect(result).toContain("P1-critical-lock");
    expect(result).toContain("P1-action-framing");
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it("drops P4 first, then P3, then P2", () => {
    const result = composePrioritizedPrompt(
      [
        { priority: 1, text: "must-keep" },
        { priority: 2, text: "important-info" },
        { priority: 3, text: "contextual-detail" },
        { priority: 4, text: "decorative-tail-that-gets-cut" },
      ],
      60,
    );
    expect(result).toContain("must-keep");
    expect(result).not.toContain("decorative-tail");
  });

  it("dedupes identical segments across priorities", () => {
    const result = composePrioritizedPrompt(
      [
        { priority: 1, text: "same thing" },
        { priority: 2, text: "same thing" },
      ],
      500,
    );
    const occurrences = (result.match(/same thing/gi) ?? []).length;
    expect(occurrences).toBe(1);
  });
});
