import { describe, it, expect } from "vitest";
import { __visualLockRetryTesting } from "@/lib/characters/visual-lock-create-with-retry";

const { isUniqueVersionConflict } = __visualLockRetryTesting;

describe("isUniqueVersionConflict", () => {
  it("detects Prisma P2002 on [characterId, version] array target", () => {
    expect(
      isUniqueVersionConflict({
        code: "P2002",
        meta: { target: ["characterId", "version"] },
      }),
    ).toBe(true);
  });

  it("detects Prisma P2002 on a string target", () => {
    expect(
      isUniqueVersionConflict({
        code: "P2002",
        meta: { target: "characterId_version_key" },
      }),
    ).toBe(true);
  });

  it("ignores non-P2002 errors", () => {
    expect(
      isUniqueVersionConflict({
        code: "P2003",
        meta: { target: ["characterId", "version"] },
      }),
    ).toBe(false);
  });

  it("ignores P2002 on an unrelated unique constraint", () => {
    expect(
      isUniqueVersionConflict({
        code: "P2002",
        meta: { target: ["email"] },
      }),
    ).toBe(false);
  });

  it("returns false for null / undefined / non-object inputs", () => {
    expect(isUniqueVersionConflict(null)).toBe(false);
    expect(isUniqueVersionConflict(undefined)).toBe(false);
    expect(isUniqueVersionConflict("oops")).toBe(false);
  });
});
