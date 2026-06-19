import { describe, expect, it } from "vitest";
import { buildSceneExtraVisualSignature, buildPromotedNpcDisplayName } from "./scene-extras-registry";
import type { SceneExtra } from "@manga-ai-studio/core";

describe("buildSceneExtraVisualSignature", () => {
  it("pour ai_generated, reflète le libellé IA dans outfit", () => {
    const sig = buildSceneExtraVisualSignature({
      archetypeId: "vw-npc-vendors",
      archetypeLabel: "Marchands du quai",
      source: "ai_generated",
    });
    expect(sig.outfit).toBe("Marchands du quai");
    expect(sig.genderPresentation).toBe("varied");
    expect(sig.silhouette).toBe("average");
  });

  it("pour db_canon, reflète le libellé studio comme ai_generated (pas le template guard)", () => {
    const sig = buildSceneExtraVisualSignature({
      archetypeId: "canon:npc-merchants",
      archetypeLabel: "Échoppes du vieux port",
      source: "db_canon",
    });
    expect(sig.outfit).toBe("Échoppes du vieux port");
    expect(sig.genderPresentation).toBe("varied");
  });

  it("pour legacy inferred, conserve les templates connus", () => {
    const sig = buildSceneExtraVisualSignature({
      archetypeId: "inferred:guard",
      archetypeLabel: "Garde",
      source: "legacy",
    });
    expect(sig.outfit).toContain("armor");
  });
});

describe("buildPromotedNpcDisplayName", () => {
  function minimalExtra(partial: Partial<SceneExtra>): SceneExtra {
    return {
      id: "extra-1",
      sceneId: "sc-1",
      archetypeId: "vw-npc",
      archetypeLabel: "Marchands du quai",
      source: "ai_generated",
      visualSignature: { genderPresentation: "varied", outfit: "x", silhouette: "average" },
      anchorSlot: "slot-a",
      reusePriority: 70,
      canSpeak: false,
      ...partial,
    };
  }

  it("pour ai_generated, base le nom sur le libellé monde", () => {
    const name = buildPromotedNpcDisplayName(minimalExtra({}), "seed-fixed");
    expect(name).toMatch(/^Marchands du quai \d+$/);
  });

  it("pour inferred:guard, garde le template court", () => {
    const name = buildPromotedNpcDisplayName(
      minimalExtra({
        source: "legacy",
        archetypeId: "inferred:guard",
        archetypeLabel: "Garde",
      }),
      "s2",
    );
    expect(name).toMatch(/^Garde \d+$/);
  });
});
