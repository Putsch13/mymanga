import { describe, expect, it, vi } from "vitest";
import { generateChapterBundle, type ProjectContextForChapter } from "./chapter-pipeline";

const context: ProjectContextForChapter = {
  project: {
    title: "Miro",
    pitch: "Un drame scolaire à tension émotionnelle.",
    primaryGenre: "drama",
    tone: "tendu",
    format: "webtoon",
  },
  characters: [
    {
      id: "miro",
      name: "Miro",
      roleType: "hero",
      gender: "male",
      objective: "tenir bon",
      fear: "être humilié",
      emotionalState: "stressé",
      status: "active",
    },
    {
      id: "kutsi",
      name: "Kutsi",
      roleType: "antagonist",
      gender: "male",
      objective: "dominer Miro",
      fear: "perdre la face",
      emotionalState: "agressif",
      status: "active",
    },
  ],
  relationships: [],
  arcs: [{ name: "Arc du lycée", summary: "Miro reprend le contrôle", status: "open" }],
  recentChapters: [
    { chapterNumber: 2, title: "Chapitre 2", summary: "Miro a vacillé", cliffhanger: "Kutsi le provoque encore" },
  ],
  recentMemory: [],
  retrievedDocs: [],
  locations: [{ name: "cour du lycée", description: "espace ouvert entre les bâtiments" }],
};

describe("generateChapterBundle creativity controls", () => {
  it("fait varier la direction créative et les options de plot", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    vi.stubEnv("OPENAI_API_KEY", "");

    const conservativeBundle = await generateChapterBundle({
      chapterNumber: 3,
      userIntent: "Miro reprend confiance dans la cour du lycée.",
      selectedPlotLabel: "bold",
      creativityControls: {
        noveltyLevel: 20,
        worldStrictness: 95,
        visualExoticism: 20,
        npcVariety: 25,
        environmentRichness: 35,
      },
      context,
    });

    const expansiveBundle = await generateChapterBundle({
      chapterNumber: 3,
      userIntent: "Miro reprend confiance dans la cour du lycée.",
      selectedPlotLabel: "bold",
      creativityControls: {
        noveltyLevel: 92,
        worldStrictness: 55,
        visualExoticism: 78,
        npcVariety: 88,
        environmentRichness: 94,
      },
      context,
    });

    if (previousKey) vi.stubEnv("OPENAI_API_KEY", previousKey);
    else vi.unstubAllEnvs();

    expect(conservativeBundle.creativeDirection.whyNow).toContain("canon verrouillé");
    expect(expansiveBundle.creativeDirection.whyNow).toContain("variations plus audacieuses");
    expect(conservativeBundle.plotOptions[0]?.summary).not.toBe(expansiveBundle.plotOptions[0]?.summary);
    expect(expansiveBundle.memory.structuredState.creativityControls).toMatchObject({
      noveltyLevel: 92,
      environmentRichness: 94,
    });
  });
});
