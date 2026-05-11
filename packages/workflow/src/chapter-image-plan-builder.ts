/**
 * ChapterImagePlanBuilder — compilateur visuel de chapitre.
 *
 * À partir du chapitre validé en 10 temps + de l'outline approuvé, produit
 * un plan complet des ~70–75 images du chapitre. Chaque item est un contrat
 * d'image minimal mais exhaustif, qui sera ensuite enrichi en
 * `CanonicalImagePromptPacket` avant l'envoi au provider.
 *
 * Règles :
 *   - aucune image n'est générée sans `ChapterImagePlanItem`
 *   - chaque image a une `imageIntentType` et un `dominantSubject` explicites
 *   - pas de "default = hero_portrait" : un cutaway reste un cutaway
 *
 * Façade fine — l'implémentation vit dans `_chapter-image-plan-builder/*`.
 */

export type {
  ChapterBeatPlanInput,
  ChapterImagePlanBuilderInput,
  ChapterImagePlanItem,
  ChapterImagePlanValidationResult,
  ChapterPanelPlanInput,
} from "./_chapter-image-plan-builder/types";

export { buildChapterImagePlan } from "./_chapter-image-plan-builder/build";
export { resolveDominantSubjectForIntent } from "./_chapter-image-plan-builder/dominant-subject";
export { resolveImageIntent } from "./_chapter-image-plan-builder/intent-resolution";
export { validateChapterImagePlan } from "./_chapter-image-plan-builder/validate";
