import { describe, expect, it } from "vitest";
import { decideImageRoute } from "./image-routing-service";

describe("decideImageRoute", () => {
  it("bloque RESTRICTED_BLOCKED_VISUAL", () => {
    const r = decideImageRoute({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "RESTRICTED_BLOCKED_VISUAL",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 1,
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
    });
    expect("blocked" in r && r.blocked).toBe(true);
  });

  it("route inpaint vers fal", () => {
    const r = decideImageRoute({
      mode: "INPAINT_FIX",
      contentIntensityLayer: "MATURE_DRAMA",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 1,
      needsInpaint: true,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
    });
    expect("provider" in r && r.provider).toBe("fal");
    expect("workflow" in r && r.workflow).toBe("inpaint");
  });

  it("cover photoreal vers stability", () => {
    const r = decideImageRoute({
      mode: "COVER_ART",
      contentIntensityLayer: "TEEN",
      isNewCharacter: false,
      hasCanonReferences: false,
      characterCountInScene: 1,
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: true,
      explicitBlocked: false,
      goreStylizedMature: false,
    });
    expect("provider" in r && r.provider).toBe("stability");
  });

  it("panel avec refs vers multi_ref fal", () => {
    const r = decideImageRoute({
      mode: "PANEL_FINAL",
      contentIntensityLayer: "GENERAL_SAFE",
      isNewCharacter: false,
      hasCanonReferences: true,
      characterCountInScene: 1,
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
    });
    expect("workflow" in r && r.workflow).toBe("multi_ref");
  });

  it("priorise fal sur une scène complexe à décor fort", () => {
    process.env.FAL_KEY = "test";
    const r = decideImageRoute({
      mode: "PANEL_DRAFT",
      contentIntensityLayer: "GENERAL_SAFE",
      isNewCharacter: false,
      hasCanonReferences: false,
      characterCountInScene: 3,
      npcCount: 2,
      creatureCount: 1,
      shotType: "wide",
      environmentPriority: "high",
      styleReferenceRequired: true,
      needsInpaint: false,
      needsPoseVariation: false,
      preferPhotorealCover: false,
      explicitBlocked: false,
      goreStylizedMature: false,
    });
    expect("provider" in r && r.provider).toBe("fal");
    expect("reason" in r && r.reason).toContain("complexity=");
  });
});
