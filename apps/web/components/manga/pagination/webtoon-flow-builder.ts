/**
 * Sprint 1 — Reader refacto
 *
 * Flow webtoon : transforme une liste ordonnée de panels en une séquence
 * linéaire prête à être rendue en scroll vertical continu.
 *
 * Contrairement au manga, le webtoon :
 *   - ne groupe PAS en pages
 *   - respecte strictement l'ordre des panels
 *   - affiche TOUS les panels (aucun slice)
 *   - insère un marqueur de séparation de scène (optionnel)
 *
 * API publique : `buildWebtoonFlowFromPanels(panels, options?)`.
 */

export interface WebtoonPanel {
  id?: string;
  sceneId?: string | null;
  panelNumber?: number;
}

export type WebtoonBlock<TPanel extends WebtoonPanel = WebtoonPanel> =
  | {
      kind: "panel";
      panel: TPanel;
      /** Index global dans la séquence (1-indexé, pour debug). */
      index: number;
      /** Numéro de scène (1-indexé, incrémente à chaque nouvelle sceneId rencontrée). */
      sceneNumber: number;
    }
  | {
      kind: "scene_break";
      sceneNumber: number;
      sceneId: string | null;
      index: number;
    };

export interface WebtoonFlowOptions {
  /**
   * Si `true`, insère un `scene_break` avant chaque panel dont la `sceneId`
   * diffère de la précédente (utile pour les séparateurs "Scène N" visuels).
   * Défaut : `true`.
   */
  emitSceneBreaks?: boolean;
  /**
   * Si `true`, n'émet PAS de `scene_break` avant le tout premier panel
   * (puisqu'aucune scène précédente n'existe). Défaut : `true`.
   */
  skipLeadingSceneBreak?: boolean;
}

/**
 * Transforme une liste de panels en flow webtoon.
 *
 * Invariants garantis :
 *   - tous les blocs `kind === "panel"` sont dans le même ordre que l'entrée
 *   - aucun panel n'est droppé (on émet un bloc par entrée)
 *   - les scene_breaks s'intercalent uniquement aux frontières de scène
 */
export function buildWebtoonFlowFromPanels<TPanel extends WebtoonPanel>(
  panels: ReadonlyArray<TPanel>,
  options: WebtoonFlowOptions = {},
): WebtoonBlock<TPanel>[] {
  const emitSceneBreaks = options.emitSceneBreaks ?? true;
  const skipLeading = options.skipLeadingSceneBreak ?? true;

  const blocks: WebtoonBlock<TPanel>[] = [];
  if (panels.length === 0) return blocks;

  let currentSceneId: string | null = panels[0]!.sceneId ?? null;
  let currentSceneNumber = 1;
  let indexCounter = 0;

  if (emitSceneBreaks && !skipLeading) {
    blocks.push({
      kind: "scene_break",
      sceneNumber: currentSceneNumber,
      sceneId: currentSceneId,
      index: ++indexCounter,
    });
  }

  for (const panel of panels) {
    const sceneId = panel.sceneId ?? null;
    if (emitSceneBreaks && sceneId !== currentSceneId) {
      currentSceneId = sceneId;
      currentSceneNumber++;
      blocks.push({
        kind: "scene_break",
        sceneNumber: currentSceneNumber,
        sceneId: currentSceneId,
        index: ++indexCounter,
      });
    }
    blocks.push({
      kind: "panel",
      panel,
      index: ++indexCounter,
      sceneNumber: currentSceneNumber,
    });
  }

  return blocks;
}

/**
 * Variante pratique : ne renvoie que les panels ordonnés (sans scene_breaks)
 * avec le numéro de scène calculé. Utile pour les rendus webtoon minimalistes.
 */
export function flattenWebtoonPanels<TPanel extends WebtoonPanel>(
  panels: ReadonlyArray<TPanel>,
): Array<TPanel & { sceneNumber: number; sequenceIndex: number }> {
  const out: Array<TPanel & { sceneNumber: number; sequenceIndex: number }> = [];
  if (panels.length === 0) return out;

  let currentSceneId: string | null | undefined = undefined;
  let currentSceneNumber = 0;
  let sequenceIndex = 0;

  for (const panel of panels) {
    const sceneId = panel.sceneId ?? null;
    if (currentSceneId === undefined) {
      currentSceneId = sceneId;
      currentSceneNumber = 1;
    } else if (sceneId !== currentSceneId) {
      currentSceneId = sceneId;
      currentSceneNumber++;
    }
    out.push({ ...panel, sceneNumber: currentSceneNumber, sequenceIndex: ++sequenceIndex });
  }

  return out;
}
