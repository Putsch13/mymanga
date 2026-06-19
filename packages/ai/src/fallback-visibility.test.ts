import { afterEach, describe, expect, it, vi } from "vitest";
import { generateChapterOutline } from "./chapter-outline";
import { writeDialogueForScene } from "./services/dialogue-writer";

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

afterEach(() => {
  process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
  vi.unstubAllEnvs();
});

describe("fallback visibility", () => {
  it("marks outline fallback explicitly when OpenAI is unavailable", async () => {
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "false");
    delete process.env.OPENAI_API_KEY;

    const result = await generateChapterOutline({
      projectTitle: "MyManga",
      pitch: "Une heroine lutte contre son stress.",
      primaryGenre: "fantasy",
      chapterNumber: 3,
      chapterTitle: "La bascule",
      userIntent: "Luna se réfugie dans son monde imaginaire quand la pression monte.",
      quickTag: "bold",
      previousSummary: "Luna a échoué à protéger son secret.",
      previousCliffhanger: "Quelqu'un a vu ses dessins prendre vie.",
    });

    expect(result).toMatchObject({
      usedOpenAI: false,
      degradedStatus: "DEGRADED_OUTLINE_FALLBACK",
      fallbackReason: "OPENAI_API_KEY missing",
    });
    expect(result.outline.beats.length).toBeGreaterThanOrEqual(3);
  });

  it("marks dialogue fallback explicitly when OpenAI is unavailable", async () => {
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "false");
    delete process.env.OPENAI_API_KEY;

    const result = await writeDialogueForScene({
      sceneId: "scene_1",
      sceneSummary: "Luna se crispe au milieu de la classe pendant qu'un bruit la submerge.",
      location: "classe silencieuse",
      tension: 7,
      emotionalObjective: "retrouver son calme",
      chapterGoal: "Montrer la fuite mentale de Luna",
      panelCount: 3,
      characters: [
        {
          name: "Luna",
          roleType: "hero",
          objective: "reprendre le contrôle",
          fear: "de perdre pied",
          traits: ["créative"],
          flaws: ["anxieuse"],
          emotionalState: "stressée",
        },
      ],
      panelBlueprints: [
        { panelId: "panel_1", action: "Luna serre son carnet contre elle", characters: ["Luna"] },
        { panelId: "panel_2", action: "Le monde se brouille autour d'elle", characters: ["Luna"] },
        { panelId: "panel_3", action: "Une créature imaginaire lui tend la main", characters: ["Luna"] },
      ],
    });

    expect(result).toMatchObject({
      degradedStatus: "DEGRADED_DIALOGUE_FALLBACK",
      usedFallback: true,
      fallbackReason: "OPENAI_API_KEY missing",
    });
    expect(result.panels).toHaveLength(3);
    expect(result.continuityPayload.source).toBe("heuristic_fallback");
    expect(result.continuityPayload.sceneEvents.length).toBeGreaterThan(0);
    expect(result.continuityPayload.characterDeltas[0]?.characterName).toBe("Luna");
  });
});

describe("premium-only — pas de fallback silencieux", () => {
  it("generateChapterOutline lève si pas de clé OpenAI", async () => {
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "true");
    delete process.env.OPENAI_API_KEY;
    await expect(
      generateChapterOutline({
        projectTitle: "MyManga",
        pitch: "Une heroine lutte contre son stress.",
        primaryGenre: "fantasy",
        chapterNumber: 3,
        chapterTitle: "La bascule",
        userIntent: "Luna se réfugie dans son monde imaginaire quand la pression monte.",
        quickTag: "bold",
        previousSummary: "Luna a échoué à protéger son secret.",
        previousCliffhanger: "Quelqu'un a vu ses dessins prendre vie.",
      }),
    ).rejects.toThrow(/premium_outline_openai_required/);
  });

  it("writeDialogueForScene lève si pas de clé OpenAI", async () => {
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "true");
    delete process.env.OPENAI_API_KEY;
    await expect(
      writeDialogueForScene({
        sceneId: "scene_1",
        sceneSummary: "Luna se crispe au milieu de la classe pendant qu'un bruit la submerge.",
        location: "classe silencieuse",
        tension: 7,
        emotionalObjective: "retrouver son calme",
        chapterGoal: "Montrer la fuite mentale de Luna",
        panelCount: 3,
        characters: [
          {
            name: "Luna",
            roleType: "hero",
            objective: "reprendre le contrôle",
            fear: "de perdre pied",
            traits: ["créative"],
            flaws: ["anxieuse"],
            emotionalState: "stressée",
          },
        ],
        panelBlueprints: [
          { panelId: "panel_1", action: "Luna serre son carnet contre elle", characters: ["Luna"] },
          { panelId: "panel_2", action: "Le monde se brouille autour d'elle", characters: ["Luna"] },
          { panelId: "panel_3", action: "Une créature imaginaire lui tend la main", characters: ["Luna"] },
        ],
      }),
    ).rejects.toThrow(/premium_dialogue_openai_required/);
  });
});
