/**
 * Pré-calcule la direction romance/aftermath pour chaque scène quand le
 * `chapterGenreMode` l'exige. Extrait depuis `narrative-pass.ts`.
 */

import { directRomanceDramaScene } from "@manga-ai-studio/ai";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseScene = any;

export type RomanceDirection = ReturnType<typeof directRomanceDramaScene>;

export function buildRomanceDirectionByScene(
  scenes: LooseScene[],
  chapterGenreMode: string,
): Map<number, RomanceDirection> {
  const result = new Map<number, RomanceDirection>();

  if (chapterGenreMode !== "romance_shojo" && chapterGenreMode !== "quiet_aftermath") {
    return result;
  }

  for (let idx = 0; idx < scenes.length; idx++) {
    const scene = scenes[idx];
    if (!scene) continue;
    const romanceDirection = directRomanceDramaScene({
      sceneText: scene.summary,
      involvedCharacters: scene.characters.slice(0, 3),
      currentTensionLevel: 40 + idx * 8,
    });
    result.set(idx, romanceDirection);
  }

  return result;
}
