import { describe, expect, it, vi } from "vitest";
import { runChapterAutofill } from "./chapter-autofill-engine";
import type { ProjectContextForChapter } from "../chapter-pipeline";

const baseContext: ProjectContextForChapter = {
  project: {
    title: "Test Manga",
    pitch: "Un héros combat des démons.",
    primaryGenre: "shonen",
    tone: "action",
    format: "weekly",
  },
  characters: [
    {
      id: "char-1",
      name: "Ryuu",
      roleType: "hero",
      objective: "Devenir le plus fort",
      fear: null,
      emotionalState: null,
      status: "active",
      biography: null,
      traits: ["courageux"],
      flaws: [],
      gender: "male",
      appearance: "cheveux noirs, yeux rouges",
      hairColor: "noir",
      eyeColor: "rouge",
      outfitDefault: null,
      visualProfile: {},
      bodyState: {},
      wardrobeProfile: {},
      speechProfile: {},
      continuityProfile: {},
      entityKind: "human",
      speciesLabel: null,
      dialogueMode: "normal",
      recurrencePolicy: "recurring",
    },
  ],
  locations: [
    { name: "Arène de combat", type: "arena", description: "Grande arène", aliases: [] },
  ],
  recentChapters: [],
  recentMemory: [],
  retrievedDocs: [],
  recentContinuityEvents: [],
  relationships: [],
  arcs: [],
  settings: null,
  stylePack: null,
  storyBible: null,
  seriesSynopsis: undefined,
  focusCharacterIds: [],
};

describe("chapter-autofill-engine (sans OpenAI)", () => {
  it("retourne un résultat vide si tous les champs sont déjà remplis et force=false", async () => {
    const currentData = {
      intent: {
        workingTitle: "Le Tournoi",
        shortPitch: "Ryuu affronte le champion",
        mainConflict: "Duel final",
        emotionalGoal: "Prouver sa valeur",
      },
      characterSelection: {
        heroCharacterId: "char-1",
        activeCharacterIds: [],
        lockedCharacterIds: [],
        speakingCharacterIds: [],
        evolvingCharacterIds: [],
        antagonistCharacterIds: [],
        recurringNpcIds: [],
      },
      chapterCanon: {
        currentLocation: "Arène de combat",
        activeCharacters: [],
        allowedVisualChanges: [],
        injuries: [],
        carriedObjects: [],
        continuityNotes: [],
        inheritedFromPreviousChapter: true,
        universeConstraints: [],
      },
      characterCanons: [],
      locationCanons: [],
      selectedPlotLabel: "bold" as const,
      creativityControls: {
        noveltyLevel: 55,
        worldStrictness: 85,
        visualExoticism: 50,
        npcVariety: 60,
        environmentRichness: 78,
      },
    };

    const result = await runChapterAutofill({
      mode: "brief",
      currentData,
      context: baseContext,
      force: false,
    });

    expect(result.appliedFields).toHaveLength(0);
    expect(result.confidence).toBe(1);
    expect(result.meta.source).toBe("ai_autofill");
    expect(result.meta.mode).toBe("brief");
  });

  it("complète les champs manquants en mode fallback (sans OpenAI)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const result = await runChapterAutofill({
      mode: "brief",
      currentData: {
        characterCanons: [],
        locationCanons: [],
        selectedPlotLabel: "bold" as const,
        creativityControls: {
          noveltyLevel: 55,
          worldStrictness: 85,
          visualExoticism: 50,
          npcVariety: 60,
          environmentRichness: 78,
        },
      },
      context: baseContext,
      force: false,
    });

    expect(result.meta.source).toBe("ai_autofill");
    expect(result.appliedFields.length).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(1);

    vi.unstubAllEnvs();
  });

  it("ne détruit pas les données existantes en mode non-force", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const existingPitch = "Pitch déjà renseigné";
    const result = await runChapterAutofill({
      mode: "all_missing",
      currentData: {
        intent: {
          shortPitch: existingPitch,
        },
        characterCanons: [],
        locationCanons: [],
        selectedPlotLabel: "bold" as const,
        creativityControls: {
          noveltyLevel: 55,
          worldStrictness: 85,
          visualExoticism: 50,
          npcVariety: 60,
          environmentRichness: 78,
        },
      },
      context: baseContext,
      force: false,
    });

    // Le pitch existant ne doit pas être écrasé
    if (result.suggestedPatch.intent?.shortPitch) {
      expect(result.suggestedPatch.intent.shortPitch).toBe(existingPitch);
    }

    vi.unstubAllEnvs();
  });

  it("repair_readiness comble les champs bloquants prioritaires", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const result = await runChapterAutofill({
      mode: "repair_readiness",
      currentData: {
        characterCanons: [],
        locationCanons: [],
        selectedPlotLabel: "bold" as const,
        creativityControls: {
          noveltyLevel: 55,
          worldStrictness: 85,
          visualExoticism: 50,
          npcVariety: 60,
          environmentRichness: 78,
        },
      },
      context: baseContext,
      force: false,
    });

    expect(result.meta.mode).toBe("repair_readiness");
    // Doit avoir tenté de compléter au moins un champ
    expect(result.appliedFields.length + result.unresolvedQuestions.length).toBeGreaterThan(0);

    vi.unstubAllEnvs();
  });

  it("retourne des métadonnées autofill correctement structurées", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const result = await runChapterAutofill({
      mode: "cast_canon",
      currentData: {
        characterCanons: [],
        locationCanons: [],
        selectedPlotLabel: "bold" as const,
        creativityControls: {
          noveltyLevel: 55,
          worldStrictness: 85,
          visualExoticism: 50,
          npcVariety: 60,
          environmentRichness: 78,
        },
      },
      context: baseContext,
    });

    expect(result.meta).toMatchObject({
      source: "ai_autofill",
      mode: "cast_canon",
    });
    expect(typeof result.meta.generatedAt).toBe("string");
    expect(typeof result.meta.confidence).toBe("number");
    expect(Array.isArray(result.meta.assumptions)).toBe(true);
    expect(Array.isArray(result.meta.appliedFields)).toBe(true);
    expect(Array.isArray(result.meta.unresolvedQuestions)).toBe(true);

    vi.unstubAllEnvs();
  });
});
