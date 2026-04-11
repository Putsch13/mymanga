import { describe, expect, it } from "vitest";
import { inferImportantCharacterPresence, resolveRetryReferencePolicy } from "@/lib/images/retry-reference-policy";

describe("retry reference policy", () => {
  it("détecte un personnage important via rôles et héros", () => {
    expect(
      inferImportantCharacterPresence({
        heroCharacterId: "hero-1",
        panelCharacterRoles: ["hero", "ally"],
      }),
    ).toBe(true);
  });

  it("garde au moins LIGHT sur reroll environment si un lock réutilisable existe", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "environment",
      metadata: {
        panelCharacterRoles: ["support"],
        characterIds: ["char-2"],
      },
      hasReusableCharacterLock: true,
    });

    expect(decision.referencePolicy).toBe("LIGHT");
    expect(decision.reason).toBe("preserve_light_lock_for_important_character");
  });

  it("retombe à NONE sur reroll composition sans personnage pertinent", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "composition",
      metadata: {},
      hasReusableCharacterLock: false,
    });

    expect(decision.referencePolicy).toBe("NONE");
    expect(decision.reason).toBe("no_relevant_character_detected");
  });

  it("garde STRONG sur reroll character", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "character",
      metadata: {
        panelCharacterRoles: ["hero"],
      },
      hasReusableCharacterLock: true,
    });

    expect(decision.referencePolicy).toBe("STRONG");
  });
});
