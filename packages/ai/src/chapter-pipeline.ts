/**
 * chapter-pipeline — façade publique de la pipeline narrative chapitre.
 *
 * Le module a été splitté (audit-v9) pour rester sous 500 lignes.
 * Tous les imports historiques restent valides via ce fichier.
 *
 * Couches :
 *   - `chapter/pipeline-helpers`        : normalisation contrôle créatif,
 *                                         casting, plot options, templates page-role
 *   - `chapter/pipeline-panel-builders` : `buildPanelBlueprints`,
 *                                         `buildPanelsForScene`, prompts panel,
 *                                         `buildNarrativeSummary`,
 *                                         `buildMemoryTimelineEventsFromScenes`,
 *                                         `buildRegeneratedBlueprints`
 *   - `chapter/generate-bundle-core`    : `generateChapterBundle` (orchestration)
 */

export type {
  ProjectContextForChapter,
  PanelMood,
  GridLayout,
  StoryboardPanel,
  StoryboardPage,
  GeneratedChapterBundle,
} from "./chapter/shared-types";

export { generateChapterBundle } from "./chapter/generate-bundle-core";
