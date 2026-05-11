/**
 * Tests for `runSceneContinuityEngine`.
 *
 * Couvre :
 * - TODO-1 : un sceneSnapshot rejeté par `validateSceneSnapshotAgainstKernel`
 *            ne doit JAMAIS apparaître dans `validatedSceneSnapshots`
 *            (sinon il pollue le canon des chapitres suivants).
 * - TODO-2 : la Map `sceneBlueprintsByScene` est indexée par `sceneNumber`
 *            (1-based), pas par `index` (0-based). La scène 1 doit recevoir
 *            ses blueprints quand la Map a la clé `1`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  chapterScene: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  character: {
    update: vi.fn(),
  },
}));

const continuityMock = vi.hoisted(() => ({
  applySceneEventsToKernel: vi.fn(),
  buildSceneSnapshot: vi.fn(),
  buildSceneState: vi.fn(),
  deriveSceneEvents: vi.fn(),
  persistSceneState: vi.fn(),
  persistValidatedSceneContinuity: vi.fn(),
  validateSceneSnapshotAgainstKernel: vi.fn(),
}));

const aiMock = vi.hoisted(() => ({
  detectPhysicalEvents: vi.fn().mockReturnValue([]),
  applyPhysicalEvents: vi.fn(),
  loadOrCreateBodyState: vi.fn(),
}));

vi.mock("@manga-ai-studio/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@manga-ai-studio/continuity", () => continuityMock);

vi.mock("@manga-ai-studio/ai", () => aiMock);

import { runSceneContinuityEngine } from "./scene-continuity-engine";

const mockBlueprint = { panelId: "p1", beatId: "b1" } as never;

const fakeKernel = {
  characterStates: [],
  worldState: { factions: [] },
  storyBible: { worldRules: [] },
  arcRegistry: [],
  eventLog: [],
};

describe("runSceneContinuityEngine", () => {
  beforeEach(() => {
    Object.values(prismaMock.chapterScene).forEach((fn) => fn.mockReset());
    prismaMock.character.update.mockReset();
    Object.values(continuityMock).forEach((fn) => fn.mockReset());
    continuityMock.buildSceneState.mockResolvedValue({ dramaticGoal: "g" });
    continuityMock.persistSceneState.mockResolvedValue(undefined);
    continuityMock.persistValidatedSceneContinuity.mockResolvedValue(undefined);
    continuityMock.deriveSceneEvents.mockReturnValue([]);
    continuityMock.applySceneEventsToKernel.mockImplementation(
      (kernel: unknown) => kernel,
    );
  });

  it("TODO-2 : passe les blueprints de la scène 1 quand la Map a la clé 1 (sceneNumber, pas index)", async () => {
    prismaMock.chapterScene.findFirst.mockResolvedValue({
      id: "scene-1-id",
      sceneNumber: 1,
      metadata: {},
    });
    prismaMock.chapterScene.update.mockResolvedValue(undefined);
    continuityMock.buildSceneSnapshot.mockReturnValue({ sceneNumber: 1 });
    continuityMock.validateSceneSnapshotAgainstKernel.mockReturnValue({
      accepted: true,
      issues: [],
      warnings: [],
    });

    const sceneBlueprintsByScene = new Map<number, typeof mockBlueprint[]>([
      [1, [mockBlueprint]],
    ]);

    await runSceneContinuityEngine({
      chapterId: "chap-1",
      chapterNumber: 1,
      projectId: "proj-1",
      scenes: [{ title: "S1", summary: "intro", location: "Lieu A", characters: [] }],
      beats: [{ location: "Lieu A", characters: [], turn: "t1" }],
      previousCharacterStates: [],
      continuityKernel: fakeKernel,
      rawCharacters: [],
      sceneBlueprintsByScene,
    });

    expect(continuityMock.buildSceneSnapshot).toHaveBeenCalledTimes(1);
    const passedArgs = continuityMock.buildSceneSnapshot.mock.calls[0][0];
    expect(passedArgs.sceneBlueprints).toEqual([mockBlueprint]);
  });

  it("TODO-2 : retourne [] de blueprints si la Map utilise l'ancienne convention 0-based (régression)", async () => {
    prismaMock.chapterScene.findFirst.mockResolvedValue({
      id: "scene-1-id",
      sceneNumber: 1,
      metadata: {},
    });
    prismaMock.chapterScene.update.mockResolvedValue(undefined);
    continuityMock.buildSceneSnapshot.mockReturnValue({ sceneNumber: 1 });
    continuityMock.validateSceneSnapshotAgainstKernel.mockReturnValue({
      accepted: true,
      issues: [],
      warnings: [],
    });

    const sceneBlueprintsByScene = new Map<number, typeof mockBlueprint[]>([
      [0, [mockBlueprint]],
    ]);

    await runSceneContinuityEngine({
      chapterId: "chap-1",
      chapterNumber: 1,
      projectId: "proj-1",
      scenes: [{ title: "S1", summary: "intro", location: "Lieu A", characters: [] }],
      beats: [{ location: "Lieu A", characters: [], turn: "t1" }],
      previousCharacterStates: [],
      continuityKernel: fakeKernel,
      rawCharacters: [],
      sceneBlueprintsByScene,
    });

    const passedArgs = continuityMock.buildSceneSnapshot.mock.calls[0][0];
    expect(passedArgs.sceneBlueprints).toEqual([]);
  });

  it("TODO-1 : un sceneSnapshot REJETÉ n'est PAS poussé dans validatedSceneSnapshots", async () => {
    prismaMock.chapterScene.findFirst
      .mockResolvedValueOnce({ id: "scene-1-id", sceneNumber: 1, metadata: {} })
      .mockResolvedValueOnce({ id: "scene-2-id", sceneNumber: 2, metadata: {} });
    prismaMock.chapterScene.update.mockResolvedValue(undefined);
    continuityMock.buildSceneSnapshot
      .mockReturnValueOnce({ sceneNumber: 1, marker: "ok" })
      .mockReturnValueOnce({ sceneNumber: 2, marker: "rejected" });
    continuityMock.validateSceneSnapshotAgainstKernel
      .mockReturnValueOnce({ accepted: true, issues: [], warnings: [] })
      .mockReturnValueOnce({
        accepted: false,
        issues: [{ message: "timeline_violation: lost item still carried" }],
        warnings: [],
      });

    const result = await runSceneContinuityEngine({
      chapterId: "chap-1",
      chapterNumber: 1,
      projectId: "proj-1",
      scenes: [
        { title: "S1", summary: "intro", location: "Lieu A", characters: [] },
        { title: "S2", summary: "rejet", location: "Lieu A", characters: [] },
      ],
      beats: [{ location: "Lieu A" }, { location: "Lieu A" }],
      previousCharacterStates: [],
      continuityKernel: fakeKernel,
      rawCharacters: [],
      sceneBlueprintsByScene: new Map(),
    });

    expect(result.validatedSceneSnapshots).toHaveLength(1);
    expect(result.validatedSceneSnapshots[0]).toMatchObject({ marker: "ok" });
    expect(continuityMock.persistValidatedSceneContinuity).toHaveBeenCalledTimes(1);
    expect(result.kernelValidationWarnings).toContain(
      "timeline_violation: lost item still carried",
    );
  });

  it("TODO-1 : tous les warnings de continuité sont propagés même quand la scène est rejetée", async () => {
    prismaMock.chapterScene.findFirst.mockResolvedValue({
      id: "scene-1-id",
      sceneNumber: 1,
      metadata: {},
    });
    prismaMock.chapterScene.update.mockResolvedValue(undefined);
    continuityMock.buildSceneSnapshot.mockReturnValue({ sceneNumber: 1 });
    continuityMock.validateSceneSnapshotAgainstKernel.mockReturnValue({
      accepted: false,
      issues: [{ message: "death_resurrection_violation" }],
      warnings: ["soft_warning_x"],
    });

    const result = await runSceneContinuityEngine({
      chapterId: "chap-1",
      chapterNumber: 1,
      projectId: "proj-1",
      scenes: [{ title: "S1", summary: "résurrection illégitime", location: "L", characters: [] }],
      beats: [{ location: "L" }],
      previousCharacterStates: [],
      continuityKernel: fakeKernel,
      rawCharacters: [],
      sceneBlueprintsByScene: new Map(),
    });

    expect(result.validatedSceneSnapshots).toHaveLength(0);
    expect(result.kernelValidationWarnings).toEqual(
      expect.arrayContaining(["death_resurrection_violation", "soft_warning_x"]),
    );
    expect(continuityMock.persistValidatedSceneContinuity).not.toHaveBeenCalled();
  });
});
