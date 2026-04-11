import { describe, expect, it } from "vitest";
import { getGenreDirectorConfig, inferGenreMode, buildGenreDirectorPromptHints } from "./genre-director";

describe("getGenreDirectorConfig", () => {
  it("retourne la config shonen_combat avec rythme fast", () => {
    const config = getGenreDirectorConfig("shonen_combat");
    expect(config.beatRhythm).toBe("fast");
    expect(config.combatReadabilityBonus).toBeGreaterThan(0);
    expect(config.silenceDensity).toBeLessThan(0.3);
  });

  it("retourne la config romance_shojo avec rythme slow", () => {
    const config = getGenreDirectorConfig("romance_shojo");
    expect(config.beatRhythm).toBe("slow");
    expect(config.romanceTensionBonus).toBeGreaterThan(0);
    expect(config.silenceDensity).toBeGreaterThan(0.3);
  });

  it("retourne la config quiet_aftermath avec haute densité de silence", () => {
    const config = getGenreDirectorConfig("quiet_aftermath");
    expect(config.silenceDensity).toBeGreaterThan(0.5);
    expect(config.beatRhythm).toBe("slow");
  });

  it("retourne la config thriller_horror avec intensité émotionnelle élevée", () => {
    const config = getGenreDirectorConfig("thriller_horror");
    expect(config.emotionalIntensityDefault).toBeGreaterThan(70);
  });
});

describe("inferGenreMode", () => {
  it("infer shonen_combat avec haute novelty et faible strictness", () => {
    const mode = inferGenreMode({ noveltyLevel: 80, worldStrictness: 40 });
    expect(mode).toBe("shonen_combat");
  });

  it("infer romance_shojo avec selectedPlotLabel=safe", () => {
    const mode = inferGenreMode({ noveltyLevel: 50, worldStrictness: 70 }, "safe");
    expect(mode).toBe("romance_shojo");
  });

  it("infer thriller_horror avec selectedPlotLabel=shock", () => {
    const mode = inferGenreMode({ noveltyLevel: 60, worldStrictness: 60 }, "shock");
    expect(mode).toBe("thriller_horror");
  });

  it("infer quiet_aftermath avec faible novelty et haute strictness", () => {
    const mode = inferGenreMode({ noveltyLevel: 20, worldStrictness: 90 });
    expect(mode).toBe("quiet_aftermath");
  });

  it("infer seinen_tension par défaut avec bold", () => {
    const mode = inferGenreMode({ noveltyLevel: 55, worldStrictness: 70 }, "bold");
    expect(mode).toBe("seinen_tension");
  });
});

describe("buildGenreDirectorPromptHints", () => {
  it("retourne des hints non vides pour chaque genre", () => {
    const modes = ["shonen_combat", "seinen_tension", "romance_shojo", "thriller_horror", "quiet_aftermath"] as const;
    for (const mode of modes) {
      const config = getGenreDirectorConfig(mode);
      const hints = buildGenreDirectorPromptHints(config);
      expect(hints.length).toBeGreaterThan(3);
      expect(hints.some((h) => h.includes("Rythme"))).toBe(true);
    }
  });
});
