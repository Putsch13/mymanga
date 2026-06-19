/**
 * planned-image-types — types d'échange entre le compositeur de prompt
 * (dans narrative-pass) et le writer d'images (persist-planned-images).
 *
 * Ces types étaient déclarés inline dans `narrative-pass.ts`. Les
 * extraire ici permet :
 *   - de déplacer le writer DB sans casser l'API interne de narrative-pass
 *   - de réutiliser les types dans les passes v3 si besoin
 *   - de rendre visibles les sorties exactes de narrative-pass dans l'IDE
 *
 * Le champ `panel` reste volontairement typé `unknown` / générique
 * parce qu'il porte encore les 70+ champs legacy StoryboardPanel. Le
 * render-pass v3 utilise un `PanelRenderSpec` strict.
 */

import type { StoryboardPanel } from "@manga-ai-studio/ai";

/**
 * Image planifiée pour un panel donné, dans le flux narrative legacy.
 *
 * Source de vérité : la ligne `SceneImage` côté Prisma. `sceneImageId`
 * permet au render-pass legacy de retrouver la ligne à rendre.
 */
export interface LegacyPlannedImage {
  sceneImageId: string;
  panel: StoryboardPanel;
  sceneIndex: number;
  baseMetadata: Record<string, unknown>;
}

/**
 * Enregistrement en attente d'écriture DB, émis par le compositeur de
 * prompt dans narrative-pass et consommé par `persistPlannedImages`.
 *
 * Le type est construit hors DB, puis un batch de 8 est écrit par
 * transaction dans `persistPlannedImages` (limite la durée tx à <15s).
 */
export interface LegacyPendingImageWrite {
  sceneId: string;
  sceneKeyframeId: string;
  panelNumber: number;
  panel: StoryboardPanel;
  composedPositive: string | undefined;
  composedNegative: string | undefined;
  baseMetadata: Record<string, unknown>;
  panelCast: unknown;
  panelCanonRefs: string[];
  sceneIndex: number;
}
