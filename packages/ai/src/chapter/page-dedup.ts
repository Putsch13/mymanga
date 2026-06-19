/**
 * Chapter pipeline — helpers de détection/régénération de pages dupliquées.
 *
 * Extrait de chapter-pipeline.ts. Un storyboard peut produire deux pages
 * accidentellement équivalentes (même beats + mêmes dialogues) ; on détecte
 * cela par signature normalisée, puis on régénère les blueprints des pages
 * dupliquées avec une variation.
 */

import type { StoryboardPage, PanelMood } from "./shared-types";

type PanelBlueprint = {
  panelId: string;
  action: string;
  mood: PanelMood;
  characters: string[];
};

export function normalizeTextForDup(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pageDupSignature(page: StoryboardPage): string {
  return page.panels
    .map((panel) => {
      const chars = [...new Set(panel.characters.map((c) => c.toLowerCase()))].sort().join(",");
      return [
        normalizeTextForDup(panel.caption),
        normalizeTextForDup(panel.dialogue?.text),
        normalizeTextForDup(panel.narration),
        chars,
      ].join("|");
    })
    .join("||");
}

export function duplicatePageIndexes(pages: StoryboardPage[]): number[] {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const signature = pageDupSignature(page);
    const prev = seen.get(signature);
    if (typeof prev === "number") {
      // On régénère la page la plus récente pour préserver l'intention du flow narratif.
      duplicates.add(index);
      continue;
    }
    seen.set(signature, index);
  }
  return [...duplicates];
}

/**
 * Recompose des blueprints panel pour une page dupliquée en injectant un tag de
 * variation ("Conséquence immédiate" / "Nouveau contretemps") selon l'attempt.
 */
export function buildRegeneratedBlueprints(
  buildPanelBlueprints: (
    scene: { id: string; summary: string; location: string; characters: string[]; purpose: string },
    beat: { summary: string; tension: number },
    panelCount: number,
    genre: string,
  ) => PanelBlueprint[],
  scene: { id: string; summary: string; location: string; characters: string[]; purpose: string },
  beat: { summary: string; tension: number },
  panelCount: number,
  genre: string,
  attempt: number,
): PanelBlueprint[] {
  const base = buildPanelBlueprints(scene, beat, panelCount, genre);
  const variationTag = attempt % 2 === 0 ? "Conséquence immédiate" : "Nouveau contretemps";
  return base.map((panel, idx) => ({
    ...panel,
    action: `${panel.action} ${variationTag} ${idx + 1}: ${scene.purpose}.`,
  }));
}
