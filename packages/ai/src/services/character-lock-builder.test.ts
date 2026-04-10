import { describe, expect, it } from "vitest";
import { buildCharacterVisualLock } from "./character-lock-builder";

describe("buildCharacterVisualLock", () => {
  it("produit un lock court et stable", () => {
    const lock = buildCharacterVisualLock({
      characterId: "char_1",
      displayName: "Luna",
      roleType: "protagonist",
      hairColor: "blue",
      eyeColor: "amber",
      outfitDefault: "school uniform",
      canonicalRefUrls: ["https://example.com/ref-1.jpg"],
      version: 2,
    });

    expect(lock.version).toBe(2);
    expect(lock.shortVisualCore).toContain("blue hair");
    expect(lock.shortVisualCore).toContain("amber eyes");
    expect(lock.canonicalRefUrls[0]).toContain("ref-1");
  });
});
