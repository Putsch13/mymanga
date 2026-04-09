import { describe, expect, it, vi } from "vitest";
import type { ApprovedChapterOutline } from "@manga-ai-studio/core";
import { generateChapterBundle, type ProjectContextForChapter } from "./chapter-pipeline";

const baseContext: ProjectContextForChapter = {
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
  recentChapters: [],
  recentMemory: [],
  retrievedDocs: [],
  locations: [{ name: "cour du lycée", description: "espace ouvert entre les bâtiments" }],
};

describe("generateChapterBundle with approved outline", () => {
  it("conserve les beats validés sans les réécrire", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    vi.stubEnv("OPENAI_API_KEY", "");
    const approvedOutline: ApprovedChapterOutline = {
      summary: "Miro subit une humiliation publique avant de reprendre l'initiative.",
      cliffhanger: "Miro décide enfin d'affronter Kutsi devant tout le monde.",
      approvedAt: "2026-04-07T10:00:00.000Z",
      approvalVersion: "ao_test",
      source: "user_approved",
      beats: [
        {
          id: "beat_1",
          summary: "Dans la cour du lycée, Kutsi et ses amis encerclent Miro sous le regard des élèves.",
          characters: ["Miro", "Kutsi"],
          location: "cour du lycée",
          pageRole: "establishing",
          turn: "La scène devient publique et impossible à ignorer.",
          emotionalDelta: -1,
        },
        {
          id: "beat_2",
          summary: "Miro reprend sa respiration puis fait un pas en avant pour briser le cercle.",
          characters: ["Miro", "Kutsi"],
          location: "cour du lycée",
          pageRole: "cliffhanger",
          turn: "Le rapport de force commence à s'inverser.",
          emotionalDelta: 2,
        },
      ],
    };

    const bundle = await generateChapterBundle({
      chapterNumber: 1,
      chapterTitle: "Le cercle",
      userIntent: "Miro affronte une humiliation dans la cour du lycée.",
      context: baseContext,
      approvedOutline,
    });

    if (previousKey) vi.stubEnv("OPENAI_API_KEY", previousKey);
    else vi.unstubAllEnvs();

    expect(bundle.outline.beats).toHaveLength(2);
    expect(bundle.storyboard.pageCount).toBe(2);
    expect(bundle.outline.beats[0]?.summary).toContain("Kutsi et ses amis encerclent Miro");
    expect(bundle.outline.beats[1]?.turn).toBe("Le rapport de force commence à s'inverser.");
    expect(bundle.generationDiagnostics.outline.usedFallback).toBe(false);
    expect(bundle.generationDiagnostics.outline.model).toBe("user-approved-outline");
  });
});
