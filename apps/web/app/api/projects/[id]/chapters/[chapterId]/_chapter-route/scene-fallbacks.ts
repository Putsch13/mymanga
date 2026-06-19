import { asRecord } from "./types";

interface SceneLite {
  id: string;
  title: string | null;
  metadata: unknown;
}

export interface SceneFallbackEntry {
  sceneId: string;
  title: string | null;
  reason: string;
}

export function extractSceneFallbacks(scenes: SceneLite[]): SceneFallbackEntry[] {
  return scenes
    .map((scene) => {
      const meta = asRecord(scene.metadata);
      const dialogueGeneration =
        meta.dialogueGeneration && typeof meta.dialogueGeneration === "object"
          ? (meta.dialogueGeneration as Record<string, unknown>)
          : null;
      return dialogueGeneration && dialogueGeneration.usedFallback === true
        ? {
            sceneId: scene.id,
            title: scene.title,
            reason:
              typeof dialogueGeneration.fallbackReason === "string"
                ? dialogueGeneration.fallbackReason
                : "Dialogue fallback used",
          }
        : null;
    })
    .filter((item): item is SceneFallbackEntry => item !== null);
}
