/**
 * Sprint 1 — Reader refacto
 *
 * Moteur de pagination manga : transforme une liste ordonnée de panels en
 * pages prêtes à rendre.
 *
 * Contrairement à `pipelineScenesToPages` (legacy), ce moteur :
 *   1. ne suppose pas `scene === page` — une scène de 20 panels produit
 *      plusieurs pages au lieu de droper 14 panels en `slice(0, 6)`
 *   2. ne perd JAMAIS un panel (invariant testé sur 75+ panels)
 *   3. choisit un layout en fonction du nombre et de l'importance des panels
 *   4. préserve l'ordre strict des panels
 *   5. isole chaque panel `splash` sur sa propre page
 *
 * API publique : `buildMangaPagesFromPanels(panels, options?)`.
 */

import { derivePanelImportance, type PanelImportance, type PanelImportanceInput } from "./panel-importance";
import { computePageSizes, pickLayoutForPage } from "./page-layout-rules";
import type { MangaPageLayoutId } from "./page-layout-types";

export interface MangaPaginatorPanel extends PanelImportanceInput {
  /** Identifiant stable — utilisé pour tracer la page d'appartenance. */
  id?: string;
  /** Scène d'origine (seulement informatif, n'influence plus le découpage). */
  sceneId?: string | null;
  /** Panel number global ou intra-scène (ordre supposé déjà trié). */
  panelNumber?: number;
}

export interface MangaPaginatorOutputPage<TPanel extends MangaPaginatorPanel = MangaPaginatorPanel> {
  /** Numéro de page (1-indexé). */
  pageNumber: number;
  /** Layout choisi pour la page. */
  layout: MangaPageLayoutId;
  /** Panels affectés à cette page (ordre préservé). */
  panels: TPanel[];
  /** Indicateurs utiles pour le rendu / debug. */
  isSplashPage: boolean;
  isDoublePage: boolean;
  /** Scène majoritaire (utile pour breadcrumb / TTS). */
  dominantSceneId: string | null;
}

export interface MangaPaginatorOptions {
  /** Préfixe des IDs de page (utile pour stabiliser les keys React). */
  pageIdPrefix?: string;
  /**
   * Si `true`, regroupe les panels d'une même scène tant qu'ils tiennent sur
   * une page unique (≤6). Dès qu'une scène dépasse, on bascule sur un
   * découpage libre. Par défaut `true` — c'est le comportement attendu en
   * manga classique (un chapitre bien découpé a ~6 panels/scène).
   */
  respectSceneBoundaries?: boolean;
}

/**
 * Transforme une liste ordonnée de panels en pages manga.
 *
 * Invariants garantis par les tests :
 *   - `output.flatMap(p => p.panels).length === panels.length` (aucun panel perdu)
 *   - `output.flatMap(p => p.panels)` préserve l'ordre d'entrée
 *   - chaque page a 1 <= panels.length <= 6
 *   - aucune page n'a 5 panels (pas de layout disponible)
 *   - les panels `splash` sont isolés sur une page dédiée
 */
export function buildMangaPagesFromPanels<TPanel extends MangaPaginatorPanel>(
  panels: ReadonlyArray<TPanel>,
  options: MangaPaginatorOptions = {},
): MangaPaginatorOutputPage<TPanel>[] {
  if (panels.length === 0) return [];

  const respectSceneBoundaries = options.respectSceneBoundaries ?? true;
  const prefix = options.pageIdPrefix ?? "page";

  const chunks: TPanel[][] = [];

  if (respectSceneBoundaries) {
    // Groupe par scène, puis découpe chaque scène en groupes valides.
    const sceneGroups = groupBySceneId(panels);
    for (const sceneGroup of sceneGroups) {
      chunks.push(...chunkWithSplashIsolation(sceneGroup));
    }
  } else {
    chunks.push(...chunkWithSplashIsolation([...panels]));
  }

  return chunks.map((chunkPanels, idx) => {
    const importances = chunkPanels.map((p) => deriveImportance(p));
    const hints = importances.map((importance) => ({ importance }));
    const layout: MangaPageLayoutId = pickLayoutForPage(hints);
    // isSplashPage ne reflète PAS juste "1 panel → layout splash" (cas trivial
    // en queue de liste), mais l'intention : au moins un panel est d'importance
    // `splash`. Sinon un dernier panel isolé (end-of-list) serait affiché
    // comme pleine page par erreur.
    const isSplash = layout === "splash" && importances.some((imp) => imp === "splash");
    const isDouble = layout === "double_spread";
    const dominantSceneId = pickDominantSceneId(chunkPanels);

    return {
      pageNumber: idx + 1,
      layout,
      panels: chunkPanels,
      isSplashPage: isSplash,
      isDoublePage: isDouble,
      dominantSceneId,
      pageId: `${prefix}-${idx + 1}`,
    } as MangaPaginatorOutputPage<TPanel>;
  });
}

/**
 * Découpe une liste de panels (tous ordonnés, éventuellement d'une même
 * scène) en groupes de taille valide (1..6, jamais 5), en isolant les panels
 * `splash` sur leur propre page.
 */
function chunkWithSplashIsolation<TPanel extends MangaPaginatorPanel>(
  panels: TPanel[],
): TPanel[][] {
  if (panels.length === 0) return [];

  const chunks: TPanel[][] = [];
  let buffer: TPanel[] = [];

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    const sizes = computePageSizes(buffer.length);
    let cursor = 0;
    for (const size of sizes) {
      chunks.push(buffer.slice(cursor, cursor + size));
      cursor += size;
    }
    buffer = [];
  };

  for (const panel of panels) {
    const importance = deriveImportance(panel);
    if (importance === "splash") {
      flushBuffer();
      chunks.push([panel]);
    } else {
      buffer.push(panel);
    }
  }
  flushBuffer();

  return chunks;
}

/**
 * Regroupe les panels contigus partageant le même `sceneId`. On ne réordonne
 * JAMAIS : on fait confiance à l'ordre d'entrée.
 */
function groupBySceneId<TPanel extends MangaPaginatorPanel>(
  panels: ReadonlyArray<TPanel>,
): TPanel[][] {
  const groups: TPanel[][] = [];
  let current: TPanel[] = [];
  let currentSceneId: string | null | undefined = undefined;

  for (const panel of panels) {
    const sceneId = panel.sceneId ?? null;
    if (currentSceneId === undefined) {
      currentSceneId = sceneId;
      current.push(panel);
      continue;
    }
    if (sceneId === currentSceneId) {
      current.push(panel);
    } else {
      if (current.length > 0) groups.push(current);
      current = [panel];
      currentSceneId = sceneId;
    }
  }
  if (current.length > 0) groups.push(current);

  return groups;
}

function pickDominantSceneId(panels: ReadonlyArray<MangaPaginatorPanel>): string | null {
  const counts = new Map<string, number>();
  for (const p of panels) {
    if (!p.sceneId) continue;
    counts.set(p.sceneId, (counts.get(p.sceneId) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

function deriveImportance(panel: MangaPaginatorPanel): PanelImportance {
  return derivePanelImportance(panel);
}
