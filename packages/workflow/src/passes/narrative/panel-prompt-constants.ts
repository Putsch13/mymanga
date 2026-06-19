/**
 * panel-prompt-constants — constantes partagées autour de la génération
 * de panels legacy (narrative-pass + image-generation-pass).
 *
 * NB : pour le render-pass v3, on utilise des négatifs construits à la
 * volée par `buildMinimalPanelPrompt`. Ce fichier reste la source de
 * vérité du legacy uniquement.
 */

export const LEGACY_STD_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, watermark, text overlay, low quality, duplicate character";
