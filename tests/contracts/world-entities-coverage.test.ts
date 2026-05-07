import { describe, expect, it } from "vitest";
import { syncChapterEntitiesToVisualWorld } from "../../apps/web/lib/chapter-studio/sync-chapter-entities-to-visual-world";
import type { ChapterStudioData } from "@manga-ai-studio/core";

describe("syncChapterEntitiesToVisualWorld (P0.9)", () => {
  it("projette PNJ et créature vers npcGroups / creatures", () => {
    const draft: ChapterStudioData = {
      chapterEntities: {
        npcs: [
          {
            id: "npc-1",
            label: "Marchand",
            narrativeRole: "informateur",
            appearance: "manteau huileux",
            behavior: "nerveux",
            panelMoments: [],
            recurrence: "one_shot",
          },
        ],
        creatures: [
          {
            id: "c-1",
            label: "Loup mécanique",
            species: "robot",
            sizeLabel: "grand",
            silhouette: "massive",
            powers: "griffes",
            behavior: "agressif",
            threatLevel: "high",
            revealMoment: "acte 2",
            recurrence: "unique",
          },
        ],
        props: [],
        vehicles: [],
        factions: [],
      },
    };
    const vw = syncChapterEntitiesToVisualWorld({ chapterId: "ch-99", draft });
    expect(vw.npcGroups).toHaveLength(1);
    expect(vw.npcGroups[0]?.label).toBe("Marchand");
    expect(vw.creatures).toHaveLength(1);
    expect(vw.creatures[0]?.label).toBe("Loup mécanique");
    expect(vw.beatBindings.some((b) => b.npcGroupIds.includes("npc-1"))).toBe(true);
  });
});
