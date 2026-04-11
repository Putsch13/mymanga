import { describe, expect, it, vi } from "vitest";
import { runRoutedImageGeneration } from "./run-generation";
import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider, ImageProviderId, RoutingContext } from "./types";

function createContext(): RoutingContext {
  return {
    mode: "PANEL_DRAFT",
    contentIntensityLayer: "GENERAL_SAFE",
    isNewCharacter: false,
    hasCanonReferences: false,
    characterCountInScene: 1,
    needsInpaint: false,
    needsPoseVariation: false,
    preferPhotorealCover: false,
    explicitBlocked: false,
    goreStylizedMature: false,
  };
}

function createInput(overrides: Partial<GenerateImageInput> = {}): GenerateImageInput {
  return {
    mode: "PANEL_DRAFT",
    positivePrompt: "hero in a ruined city",
    width: 1024,
    height: 1536,
    providerParams: {},
    ...overrides,
  };
}

function createProvider(id: ImageProviderId, implementation: () => Promise<GenerateImageResult>): ImageGenerationProvider {
  return {
    id,
    generateImage: implementation,
  };
}

describe("runRoutedImageGeneration", () => {
  it("réussit sur le provider principal sans failover", async () => {
    const result = await runRoutedImageGeneration(
      createContext(),
      createInput(),
      {
        routeDecision: {
          provider: "fal",
          model: "fal-ai/flux/dev",
          workflow: "txt2img",
          reason: "primary",
        },
        providerFactory: () =>
          createProvider("fal", async () => ({
            imageUrl: "https://example.com/fal.png",
            provider: "fal",
            model: "fal-ai/flux/dev",
          })),
        sleepFn: async () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.provider).toBe("fal");
    expect(result.log.initialProvider).toBe("fal");
    expect(result.log.retryCount).toBe(0);
    expect(result.log.fallbackProvider).toBeUndefined();
  });

  it("fait un retry local sur erreur transitoire puis réussit", async () => {
    let attempts = 0;
    const providerFactory = vi.fn(() =>
      createProvider("fal", async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("timeout on provider");
        return {
          imageUrl: "https://example.com/recovered.png",
          provider: "fal",
          model: "fal-ai/flux/dev",
        };
      }),
    );

    const result = await runRoutedImageGeneration(
      createContext(),
      createInput(),
      {
        routeDecision: {
          provider: "fal",
          model: "fal-ai/flux/dev",
          workflow: "txt2img",
          reason: "primary",
        },
        providerFactory,
        sleepFn: async () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(attempts).toBe(2);
    expect(result.log.retryCount).toBe(1);
    expect(result.log.providerAttempts?.filter((entry) => entry.provider === "fal")).toHaveLength(2);
    expect(result.log.fallbackProvider).toBeUndefined();
  });

  it("bascule vers un provider compatible après un échec dur", async () => {
    const providerFactory = vi.fn((id: ImageProviderId) => {
      if (id === "runware") {
        return createProvider("runware", async () => {
          throw new Error("invalid request payload");
        });
      }
      if (id === "fal") {
        return createProvider("fal", async () => ({
          imageUrl: "https://example.com/fallback.png",
          provider: "fal",
          model: "fal-ai/flux/dev",
        }));
      }
      return createProvider(id, async () => {
        throw new Error(`unexpected provider ${id}`);
      });
    });

    const result = await runRoutedImageGeneration(
      createContext(),
      createInput(),
      {
        routeDecision: {
          provider: "runware",
          model: "runware-custom-stack",
          workflow: "txt2img",
          reason: "primary",
        },
        providerFactory,
        sleepFn: async () => undefined,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.provider).toBe("fal");
    expect(result.routing.provider).toBe("fal");
    expect(result.log.initialProvider).toBe("runware");
    expect(result.log.fallbackProvider).toBe("fal");
    expect(result.log.failoverReason).toContain("hard_failure_on_runware");
    expect(providerFactory).toHaveBeenCalledWith("runware");
    expect(providerFactory).toHaveBeenCalledWith("fal");
  });
});
