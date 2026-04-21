/**
 * Anti-repetition des prompts au sein d'une meme scene.
 *
 * But : detecter quand deux panels consecutifs d'une meme scene partent avec
 * le meme prompt (hash SHA-256 identique) et appliquer une variation
 * deterministe (seed + hint de cadrage) pour eviter une image quasi clone.
 *
 * Extrait de `image-generation-pass.ts` Sprint C. Helper pur, sans state global
 * : le caller (la boucle de generation) possede le `promptHashByScene: Map`
 * partage entre tous les panels du chapitre.
 */

import { createHash } from "crypto";

export interface AntiRepeatResult {
  /** Hash SHA-256 (16 premiers hex) du prompt d'origine. */
  promptHash: string;
  /** Prompt a envoyer a FAL apres eventuelle variation. */
  effectivePrompt: string;
  /** Seed aleatoire si une collision a force une variation. */
  antiRepeatSeed?: number;
  /** Vrai si on a detecte une collision avec le prompt precedent de la scene. */
  hadCollision: boolean;
}

/**
 * Calcule le hash du prompt courant, compare au dernier hash connu pour la
 * scene et applique une micro-variation si collision.
 *
 * Mutation : met a jour `promptHashByScene` avec le nouveau hash.
 */
export function applyPromptAntiRepeat(input: {
  positivePrompt: string;
  sceneId: string;
  /** Optionnel : cameraAngle issue du shotPlan pour varier la consigne. */
  cameraAngleHint?: string;
  promptHashByScene: Map<string, string>;
}): AntiRepeatResult {
  const { positivePrompt, sceneId, cameraAngleHint, promptHashByScene } = input;

  const promptHash = createHash("sha256")
    .update(positivePrompt ?? "")
    .digest("hex")
    .slice(0, 16);

  const prevHash = promptHashByScene.get(sceneId);
  const hadCollision = Boolean(prevHash && prevHash === promptHash && promptHash.length > 0);

  let effectivePrompt = positivePrompt;
  let antiRepeatSeed: number | undefined;

  if (hadCollision) {
    antiRepeatSeed = Math.floor(Math.random() * 2147483647);
    const shotVariation = cameraAngleHint
      ? `, ${cameraAngleHint}`
      : ", slightly different camera angle";
    effectivePrompt = (positivePrompt ?? "") + shotVariation;
  }

  promptHashByScene.set(sceneId, promptHash);

  return { promptHash, effectivePrompt, antiRepeatSeed, hadCollision };
}
