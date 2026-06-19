import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import * as aiStudio from "@manga-ai-studio/ai";
import {
  shouldUseAiVisualWorldDiscovery,
  runVisualWorldDiscoveryPass,
  formatVisualWorldDiscoveryLog,
  type VisualWorldDiscoveryPassInput,
} from "./visual-world-discovery-pass";

function baseInput(overrides: Partial<VisualWorldDiscoveryPassInput> = {}): VisualWorldDiscoveryPassInput {
  return {
    chapterId: "ch1",
    beats: [{ beatId: "b1", summary: "Test" }],
    chapterSummary: "Résumé",
    userIntent: "Intent",
    premiumV3OnlyEnabled: false,
    composerBeats: [
      {
        beatId: "b1",
        summary: "Beat",
        whyThisBeatExists: null,
        dramaticChange: null,
        involvedCharacterIds: [],
      },
    ],
    ...overrides,
  };
}

describe("shouldUseAiVisualWorldDiscovery", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("active le compositeur IA en mode premium strict", () => {
    expect(shouldUseAiVisualWorldDiscovery(baseInput({ premiumV3OnlyEnabled: true }))).toBe(true);
  });

  it("sans OPENAI_API_KEY, reste regex même avec composerBeats", () => {
    const r = baseInput({ premiumV3OnlyEnabled: false });
    expect(shouldUseAiVisualWorldDiscovery(r)).toBe(false);
  });

  it("avec OPENAI_API_KEY et composerBeats, utilise l’IA hors premium strict", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(shouldUseAiVisualWorldDiscovery(baseInput({ premiumV3OnlyEnabled: false }))).toBe(true);
  });

  it("avec OPENAI mais sans composerBeats, ne force pas l’IA si premium strict off", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(
      shouldUseAiVisualWorldDiscovery(
        baseInput({ premiumV3OnlyEnabled: false, composerBeats: [] }),
      ),
    ).toBe(false);
  });
});

describe("runVisualWorldDiscoveryPass — traçabilité", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renvoie visualWorldComposeMeta.regex_only sans clé OpenAI", async () => {
    const res = await runVisualWorldDiscoveryPass(baseInput({ premiumV3OnlyEnabled: false }));
    expect(res.visualWorldComposeMeta?.path).toBe("regex_only");
    expect(res.discoverySource).toBe("regex_legacy");
    expect(formatVisualWorldDiscoveryLog(res)).toContain("vwPath=regex_only");
  });

  it("premium strict sans OPENAI ni VISUAL_WORLD_ALLOW_REGEX_FALLBACK → échec explicite", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("VISUAL_WORLD_ALLOW_REGEX_FALLBACK", "");
    await expect(
      runVisualWorldDiscoveryPass(baseInput({ premiumV3OnlyEnabled: true })),
    ).rejects.toThrow(/visual-world-discovery|OPENAI|composeVisualWorldContract/i);
  });

  it("premium strict sans OPENAI mais avec VISUAL_WORLD_ALLOW_REGEX_FALLBACK → regex", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("VISUAL_WORLD_ALLOW_REGEX_FALLBACK", "1");
    const res = await runVisualWorldDiscoveryPass(baseInput({ premiumV3OnlyEnabled: true }));
    expect(res.visualWorldComposeMeta?.path).toBe("regex_after_compose_error");
    expect(res.discoverySource).toBe("regex_legacy");
    expect(res.visualWorldContract).toBeNull();
  });

  it("NEXT_PUBLIC strict + compose IA en échec → pas de fallback regex sans escape", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("NEXT_PUBLIC_PIPELINE_V3_PREMIUM_ONLY", "true");
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "false");
    vi.stubEnv("VISUAL_WORLD_ALLOW_REGEX_FALLBACK", "");
    const spy = vi.spyOn(aiStudio, "composeVisualWorldContract").mockRejectedValue(new Error("compose_fail"));
    await expect(runVisualWorldDiscoveryPass(baseInput({ premiumV3OnlyEnabled: false }))).rejects.toThrow(
      /composeVisualWorldContract a échoué \(premium\)|compose_fail/,
    );
    spy.mockRestore();
  });
});
