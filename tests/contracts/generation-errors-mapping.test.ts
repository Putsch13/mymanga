import { describe, expect, it } from "vitest";
import { canonViolationsToPremiumErrors } from "../../apps/web/shared/errors/generation-errors";

describe("canonViolationsToPremiumErrors (P2.3)", () => {
  it("mappe le héros bloquant vers HERO_VISUAL_LOCK_MISSING", () => {
    const errs = canonViolationsToPremiumErrors(
      [
        {
          characterId: "h1",
          characterName: "Ken",
          roleType: "Héros",
          reason: "pas de lock",
          severity: "blocking",
        },
      ],
      { projectId: "p1", chapterId: "c1" },
    );
    expect(errs[0]?.code).toBe("HERO_VISUAL_LOCK_MISSING");
    expect(errs[0]?.fixAction?.href).toContain("/projects/p1/chapters/c1/edit");
  });
});
