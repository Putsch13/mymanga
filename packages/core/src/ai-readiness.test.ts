import { describe, expect, it } from "vitest";
import {
  collectPremiumBlockingReasons,
  type ChapterAiReadiness,
} from "./ai-readiness";

describe("collectPremiumBlockingReasons", () => {
  it("ne retient que les étapes premiumBlocking", () => {
    const ai: ChapterAiReadiness = {
      outline: { status: "real", provider: "openai" },
      storySpine: { status: "real", provider: "openai" },
      genreDirector: { status: "real", provider: "openai" },
      narrativeFacts: { status: "real", provider: "openai" },
      dialogue: { status: "real", provider: "openai" },
      imageProvider: { status: "real", provider: "fal" },
      visualQa: {
        status: "fallback",
        reason: "vision off",
        premiumBlocking: false,
      },
      loraBindings: {
        status: "missing",
        reason: "no lora",
        premiumBlocking: true,
      },
    };
    expect(collectPremiumBlockingReasons(ai)).toEqual(["loraBindings: no lora"]);
  });
});
