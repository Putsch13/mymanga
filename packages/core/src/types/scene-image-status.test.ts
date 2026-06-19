import { describe, expect, it } from "vitest";
import {
  ALL_SCENE_IMAGE_STATUSES,
  SCENE_IMAGE_STATUS,
  isFailureSceneImageStatus,
  isPendingSceneImageStatus,
  isSceneImageStatus,
  isSuccessSceneImageStatus,
  isTerminalSceneImageStatus,
  normalizeSceneImageStatus,
  type SceneImageStatus,
} from "./scene-image-status";

describe("SCENE_IMAGE_STATUS", () => {
  it("expose les 6 statuts canoniques", () => {
    expect(ALL_SCENE_IMAGE_STATUSES).toEqual([
      "pending",
      "planned",
      "generating",
      "completed",
      "failed",
      "blocked",
    ]);
  });

  it("isSceneImageStatus valide les literals connus uniquement", () => {
    expect(isSceneImageStatus("completed")).toBe(true);
    expect(isSceneImageStatus("blocked")).toBe(true);
    expect(isSceneImageStatus("manual_review_required")).toBe(false);
    expect(isSceneImageStatus("ready_for_render")).toBe(false);
    expect(isSceneImageStatus(undefined)).toBe(false);
    expect(isSceneImageStatus(null)).toBe(false);
    expect(isSceneImageStatus(42)).toBe(false);
  });

  it("isTerminalSceneImageStatus distingue les états terminaux des transitoires", () => {
    expect(isTerminalSceneImageStatus(SCENE_IMAGE_STATUS.COMPLETED)).toBe(true);
    expect(isTerminalSceneImageStatus(SCENE_IMAGE_STATUS.FAILED)).toBe(true);
    expect(isTerminalSceneImageStatus(SCENE_IMAGE_STATUS.BLOCKED)).toBe(true);
    expect(isTerminalSceneImageStatus(SCENE_IMAGE_STATUS.PENDING)).toBe(false);
    expect(isTerminalSceneImageStatus(SCENE_IMAGE_STATUS.GENERATING)).toBe(false);
    expect(isTerminalSceneImageStatus(SCENE_IMAGE_STATUS.PLANNED)).toBe(false);
  });

  it("isSuccessSceneImageStatus reconnait uniquement completed", () => {
    expect(isSuccessSceneImageStatus(SCENE_IMAGE_STATUS.COMPLETED)).toBe(true);
    expect(isSuccessSceneImageStatus(SCENE_IMAGE_STATUS.FAILED)).toBe(false);
    expect(isSuccessSceneImageStatus(SCENE_IMAGE_STATUS.BLOCKED)).toBe(false);
  });

  it("isFailureSceneImageStatus reconnait failed et blocked", () => {
    expect(isFailureSceneImageStatus(SCENE_IMAGE_STATUS.FAILED)).toBe(true);
    expect(isFailureSceneImageStatus(SCENE_IMAGE_STATUS.BLOCKED)).toBe(true);
    expect(isFailureSceneImageStatus(SCENE_IMAGE_STATUS.COMPLETED)).toBe(false);
    expect(isFailureSceneImageStatus(SCENE_IMAGE_STATUS.PENDING)).toBe(false);
  });

  it("isPendingSceneImageStatus reconnait les états transitoires", () => {
    expect(isPendingSceneImageStatus(SCENE_IMAGE_STATUS.PENDING)).toBe(true);
    expect(isPendingSceneImageStatus(SCENE_IMAGE_STATUS.PLANNED)).toBe(true);
    expect(isPendingSceneImageStatus(SCENE_IMAGE_STATUS.GENERATING)).toBe(true);
    expect(isPendingSceneImageStatus(SCENE_IMAGE_STATUS.COMPLETED)).toBe(false);
  });

  it("normalizeSceneImageStatus retourne null pour les inconnus", () => {
    expect(normalizeSceneImageStatus("completed")).toBe("completed");
    expect(normalizeSceneImageStatus("READY")).toBeNull();
    expect(normalizeSceneImageStatus(null)).toBeNull();
  });

  it("ALL_SCENE_IMAGE_STATUSES est exhaustif vs SCENE_IMAGE_STATUS object (anti-régression)", () => {
    const fromConst: SceneImageStatus[] = Object.values(SCENE_IMAGE_STATUS);
    expect(new Set(fromConst)).toEqual(new Set(ALL_SCENE_IMAGE_STATUSES));
  });
});
