/**
 * P0.1 — Contrats de normalisation des rôles personnages (studio premium).
 * Les libellés FR/EN courants doivent converger vers les rôles canoniques du core.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalizeCharacterRoleType,
  CRITICAL_STUDIO_ROLE_TYPES_FOR_QUERY,
  isNpcRole,
  normalizeCharacterRoleType,
} from "@manga-ai-studio/core";

describe("character-role normalization (P0.1 contracts)", () => {
  it("normalizeCharacterRoleType marque les alias héros comme aliased", () => {
    const n = normalizeCharacterRoleType("Héros");
    expect(n.role).toBe("hero");
    expect(n.confidence).toBe("aliased");
    expect(n.raw).toBe("Héros");
  });

  it("mappe les variantes héros vers le rôle canonique hero", () => {
    const heroLike = [
      "Héros",
      "heros",
      "hero",
      "HERO",
      "protagoniste",
      "main character",
    ] as const;
    for (const raw of heroLike) {
      expect(canonicalizeCharacterRoleType(raw)).toBe("hero");
    }
  });

  it("mappe antagoniste / villain vers antagonist", () => {
    expect(canonicalizeCharacterRoleType("antagoniste")).toBe("antagonist");
    expect(canonicalizeCharacterRoleType("villain")).toBe("antagonist");
  });

  it("mappe PNJ vers npc", () => {
    expect(canonicalizeCharacterRoleType("PNJ")).toBe("npc");
    expect(isNpcRole("PNJ")).toBe(true);
  });

  it("CRITICAL_STUDIO_ROLE_TYPES_FOR_QUERY couvre les variantes studio (Prisma in)", () => {
    expect(CRITICAL_STUDIO_ROLE_TYPES_FOR_QUERY).toContain("hero");
    expect(CRITICAL_STUDIO_ROLE_TYPES_FOR_QUERY).toContain("Héros");
    expect(CRITICAL_STUDIO_ROLE_TYPES_FOR_QUERY).toContain("antagonist");
    expect(CRITICAL_STUDIO_ROLE_TYPES_FOR_QUERY).toContain("SECONDARY_CORE");
  });
});
