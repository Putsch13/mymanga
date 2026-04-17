import { describe, it, expect } from "vitest";
import {
  getCompatibleUniverses,
  isEntryUniverseCompatible,
} from "./universe-compatibility";

describe("universe-compatibility (BUG-20)", () => {
  describe("getCompatibleUniverses", () => {
    it("retourne la famille cyberpunk pour cyberpunk", () => {
      const family = getCompatibleUniverses("cyberpunk");
      expect(family).toContain("cyberpunk");
      expect(family).toContain("sci-fi");
      expect(family).toContain("mecha");
      expect(family).not.toContain("fantasy");
      expect(family).not.toContain("post-apocalyptique");
    });

    it("ignore la casse et les espaces", () => {
      const family = getCompatibleUniverses("  CYBERPUNK  ");
      expect(family).toContain("cyberpunk");
    });

    it("retourne la famille fantasy pour fantasy", () => {
      const family = getCompatibleUniverses("fantasy");
      expect(family).toContain("fantasy");
      expect(family).toContain("dark_fantasy");
      expect(family).not.toContain("cyberpunk");
      expect(family).not.toContain("post-apocalyptique");
    });

    it("fallback sur lui-même si univers inconnu", () => {
      const family = getCompatibleUniverses("univers-imaginaire-123");
      expect(family).toEqual(["univers-imaginaire-123"]);
    });
  });

  describe("isEntryUniverseCompatible", () => {
    it("REJETTE un NPC post-apocalyptique/fantasy dans un projet cyberpunk", () => {
      // Cas réel du bug : "cartographe des dunes"
      const entry = { universes: ["post-apocalyptique", "fantasy", "seinen"] };
      expect(isEntryUniverseCompatible(entry, "cyberpunk")).toBe(false);
    });

    it("REJETTE un NPC berserker (fantasy/shōnen/dark_fantasy) dans cyberpunk", () => {
      const entry = { universes: ["shōnen", "fantasy", "dark_fantasy", "seinen"] };
      expect(isEntryUniverseCompatible(entry, "cyberpunk")).toBe(false);
    });

    it("REJETTE une location desert-waystation (post-apo/fantasy) dans cyberpunk", () => {
      const entry = { universes: ["post-apocalyptique", "fantasy", "seinen"] };
      expect(isEntryUniverseCompatible(entry, "cyberpunk")).toBe(false);
    });

    it("ACCEPTE un NPC cyberpunk dans un projet cyberpunk", () => {
      const entry = { universes: ["cyberpunk", "sci-fi", "seinen"] };
      expect(isEntryUniverseCompatible(entry, "cyberpunk")).toBe(true);
    });

    it("ACCEPTE une location sci-fi dans un projet cyberpunk (famille compatible)", () => {
      const entry = { universes: ["sci-fi", "mecha"] };
      expect(isEntryUniverseCompatible(entry, "cyberpunk")).toBe(true);
    });

    it("ACCEPTE un entry sans restriction d'univers (fallback générique)", () => {
      const entry = { universes: [] };
      expect(isEntryUniverseCompatible(entry, "cyberpunk")).toBe(true);
    });

    it("REJETTE un NPC romance/shōjo dans un projet horreur", () => {
      const entry = { universes: ["romance", "shojo"] };
      expect(isEntryUniverseCompatible(entry, "horreur")).toBe(false);
    });

    it("ACCEPTE un NPC dark_fantasy dans un projet fantasy (alias)", () => {
      const entry = { universes: ["dark_fantasy"] };
      expect(isEntryUniverseCompatible(entry, "fantasy")).toBe(true);
    });

    it("gère les alias post-apo / post-apocalyptique", () => {
      const entry = { universes: ["post-apocalyptique"] };
      expect(isEntryUniverseCompatible(entry, "post-apo")).toBe(true);
      expect(isEntryUniverseCompatible(entry, "post-apocalyptique")).toBe(true);
    });
  });
});
