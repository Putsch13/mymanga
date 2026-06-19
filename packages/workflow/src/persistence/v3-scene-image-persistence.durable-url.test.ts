/**
 * P0.3 — Test que les URLs provider temporaires ne sont jamais persistées.
 * Toutes les images doivent passer par Supabase storage.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prismaChapterFindUnique: vi.fn(),
  prismaChapterSceneFindFirst: vi.fn(),
  prismaChapterSceneCreate: vi.fn(),
  prismaSceneImageFindUnique: vi.fn(),
  prismaSceneImageUpsert: vi.fn(),
  prismaSceneImageUpdate: vi.fn(),
  prismaMediaAssetCreate: vi.fn(),
  persistImageIfNeeded: vi.fn(),
}));

vi.mock("@manga-ai-studio/db", () => {
  const txClient = {
    chapter: {
      findUnique: mocks.prismaChapterFindUnique,
    },
    chapterScene: {
      findFirst: mocks.prismaChapterSceneFindFirst,
      create: mocks.prismaChapterSceneCreate,
    },
    sceneImage: {
      findUnique: mocks.prismaSceneImageFindUnique,
      upsert: mocks.prismaSceneImageUpsert,
      update: mocks.prismaSceneImageUpdate,
    },
    mediaAsset: {
      create: mocks.prismaMediaAssetCreate,
    },
  };
  return {
    prisma: {
      ...txClient,
      $transaction: vi.fn((callback: (tx: typeof txClient) => Promise<unknown>) => callback(txClient)),
    },
  };
});

vi.mock("../pipeline-image-persistence", () => ({
  persistImageIfNeeded: mocks.persistImageIfNeeded,
}));

import { persistV3RenderedPanels } from "./v3-scene-image-persistence";
import type { StoryboardPlan } from "@manga-ai-studio/ai";
import type { FalRenderRoute, PanelRenderSpec } from "@manga-ai-studio/ai";

function makeMinimalPlan(): StoryboardPlan {
  return {
    chapterId: "ch-1",
    totalTargetPanels: 1,
    pages: [
      {
        pageNumber: 1,
        layoutTemplate: "grid_2x2",
        dramaticRole: "setup",
        beatIds: ["beat-1"],
        panels: [
          {
            panelId: "panel-1",
            pageNumber: 1,
            panelNumberInPage: 1,
            globalPanelIndex: 0,
            sourceBeatId: "beat-1",
            panelPurpose: "hero_focus",
            renderMode: "hero_closeup",
            shotType: "closeup",
            cameraAngle: "eye_level",
            subjectFocus: "hero",
            cutawayType: "none",
            characters: ["hero-1"],
            locationId: null,
            locationName: "Street",
            actionLine: "Hero",
            emotionLine: "",
            dialogue: [],
            narration: null,
            sfx: [],
            mustShow: [],
            mustNotShow: [],
            continuityNotes: [],
            visualAnchors: { characterIds: [], environmentAnchorId: null, previousPanelAnchorId: null },
          },
        ],
      },
    ],
    editorialDiagnostics: {
      varietyScore: 1,
      heroFocusRatio: 1,
      environmentRatio: 0,
      insertRatio: 0,
      reactionRatio: 0,
      warnings: [],
      blockers: [],
    },
  };
}

function makeMinimalRendered(imageUrl: string | null) {
  return [
    {
      spec: {
        panelId: "panel-1",
        panelPurpose: "hero_focus",
        renderMode: "hero_closeup",
        shotType: "closeup",
        cameraAngle: "eye_level",
        subjectFocus: "hero",
        visibleCharacters: [],
        constraints: { forbiddenDrift: [] },
        locationName: "Street",
        actionLine: "Hero stares forward",
        emotionLine: "determined",
      } as unknown as PanelRenderSpec,
      prompt: { positive: "test", negative: "bad" },
      route: { modelId: "test", referencePolicy: "none" } as unknown as FalRenderRoute,
      imageUrl,
      provider: "fal",
      model: "flux",
      seed: 123,
      error: null,
    },
  ];
}

describe("v3-scene-image-persistence.durable-url (P0.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prismaChapterFindUnique.mockResolvedValue({ projectId: "proj-1" });
    mocks.prismaChapterSceneFindFirst.mockResolvedValue(null);
    mocks.prismaChapterSceneCreate.mockResolvedValue({ id: "scene-1" });
    mocks.prismaSceneImageFindUnique.mockResolvedValue(null);
    mocks.prismaSceneImageUpsert.mockResolvedValue({ id: "img-1" });
    mocks.prismaMediaAssetCreate.mockResolvedValue({ id: "asset-1" });
  });

  it("copie l'image FAL vers Supabase et stocke l'URL durable", async () => {
    const falTempUrl = "https://v3.fal.media/files/abc123/output.png";
    const durableUrl = "https://xyz.supabase.co/storage/v1/object/public/bucket/path.png";

    mocks.persistImageIfNeeded.mockResolvedValueOnce({
      ok: true,
      persisted: true,
      url: durableUrl,
      bucket: "bucket",
      storageKey: "path.png",
      mimeType: "image/png",
      debugSourceUrl: falTempUrl,
    });

    const result = await persistV3RenderedPanels({
      chapterId: "ch-1",
      storyboardPlan: makeMinimalPlan(),
      rendered: makeMinimalRendered(falTempUrl),
    });

    expect(result.imagesPersisted).toBe(1);
    expect(mocks.persistImageIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: falTempUrl }),
    );

    // Vérifie que l'upsert utilise l'URL durable, pas l'URL FAL
    const upsertCall = mocks.prismaSceneImageUpsert.mock.calls[0]![0] as {
      create: { imageUrl: string; persistedUrl: string };
      update: { imageUrl: string; persistedUrl: string };
    };
    expect(upsertCall.create.imageUrl).toBe(durableUrl);
    expect(upsertCall.create.persistedUrl).toBe(durableUrl);
    expect(upsertCall.update.imageUrl).toBe(durableUrl);
    expect(upsertCall.create.imageUrl).not.toContain("fal.media");
  });

  it("ne stocke PAS l'URL provider si la persistance échoue", async () => {
    const falTempUrl = "https://v3.fal.media/files/abc123/output.png";

    mocks.persistImageIfNeeded.mockResolvedValueOnce({
      ok: false,
      persisted: false,
      reason: "no_storage_configured",
      message: "Pas de Supabase",
      debugSourceUrl: falTempUrl,
    });

    const result = await persistV3RenderedPanels({
      chapterId: "ch-1",
      storyboardPlan: makeMinimalPlan(),
      rendered: makeMinimalRendered(falTempUrl),
    });

    expect(result.imagesStorageFailed).toBe(1);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("storage_failed"),
    );

    // Avec P1.8, les panels en échec de storage sont skippés entièrement
    // L'upsert ne doit PAS être appelé (pas de persistance partielle)
    expect(mocks.prismaSceneImageUpsert).not.toHaveBeenCalled();
  });

  it("accepte directement une URL déjà stable (Supabase)", async () => {
    const stableUrl = "https://xyz.supabase.co/storage/v1/object/public/bucket/path.png";

    mocks.persistImageIfNeeded.mockResolvedValueOnce({
      ok: true,
      persisted: false,
      url: stableUrl,
      bucket: null,
      storageKey: null,
      mimeType: null,
      debugSourceUrl: stableUrl,
    });

    const result = await persistV3RenderedPanels({
      chapterId: "ch-1",
      storyboardPlan: makeMinimalPlan(),
      rendered: makeMinimalRendered(stableUrl),
    });

    expect(result.imagesAlreadyStable).toBe(1);
    expect(result.imagesPersisted).toBe(0);

    const upsertCall = mocks.prismaSceneImageUpsert.mock.calls[0]![0] as {
      create: { imageUrl: string };
    };
    expect(upsertCall.create.imageUrl).toBe(stableUrl);
  });

  it("n'envoie JAMAIS storageBucket/storageKey dans SceneImage.data (P0.1)", async () => {
    const falTempUrl = "https://v3.fal.media/files/abc123/output.png";
    const durableUrl = "https://xyz.supabase.co/storage/v1/object/public/bucket/path.png";

    mocks.persistImageIfNeeded.mockResolvedValueOnce({
      ok: true,
      persisted: true,
      url: durableUrl,
      bucket: "panel-images",
      storageKey: "ch-1/panel-1.png",
      mimeType: "image/png",
      debugSourceUrl: falTempUrl,
    });

    await persistV3RenderedPanels({
      chapterId: "ch-1",
      storyboardPlan: makeMinimalPlan(),
      rendered: makeMinimalRendered(falTempUrl),
    });

    const upsertCall = mocks.prismaSceneImageUpsert.mock.calls[0]![0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };

    expect(upsertCall.create).not.toHaveProperty("storageBucket");
    expect(upsertCall.create).not.toHaveProperty("storageKey");
    expect(upsertCall.update).not.toHaveProperty("storageBucket");
    expect(upsertCall.update).not.toHaveProperty("storageKey");

    expect(upsertCall.create.metadata).toBeDefined();
    const metadata = upsertCall.create.metadata as { generationDebugSnapshot?: { result?: { storageBucket?: string; storageKey?: string } } };
    expect(metadata.generationDebugSnapshot?.result?.storageBucket).toBe("panel-images");
    expect(metadata.generationDebugSnapshot?.result?.storageKey).toBe("ch-1/panel-1.png");
  });

  it("ne met JAMAIS undefined dans metadata (JSON serialization safe) (P0.2)", async () => {
    const falTempUrl = "https://v3.fal.media/files/abc123/output.png";
    const durableUrl = "https://xyz.supabase.co/storage/v1/object/public/bucket/path.png";

    mocks.persistImageIfNeeded.mockResolvedValueOnce({
      ok: true,
      persisted: true,
      url: durableUrl,
      bucket: "bucket",
      storageKey: "path.png",
      mimeType: "image/png",
      debugSourceUrl: falTempUrl,
    });

    await persistV3RenderedPanels({
      chapterId: "ch-1",
      storyboardPlan: makeMinimalPlan(),
      rendered: makeMinimalRendered(falTempUrl),
    });

    const upsertCall = mocks.prismaSceneImageUpsert.mock.calls[0]![0] as {
      create: Record<string, unknown>;
    };

    const metadata = upsertCall.create.metadata as Record<string, unknown>;
    const jsonString = JSON.stringify(metadata);
    expect(jsonString).not.toContain("undefined");

    const checkForUndefined = (obj: unknown, path = ""): void => {
      if (obj === undefined) {
        throw new Error(`Found undefined at ${path}`);
      }
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          checkForUndefined(value, `${path}.${key}`);
        }
      }
      if (Array.isArray(obj)) {
        obj.forEach((item, idx) => checkForUndefined(item, `${path}[${idx}]`));
      }
    };

    expect(() => checkForUndefined(metadata, "metadata")).not.toThrow();
  });
});
