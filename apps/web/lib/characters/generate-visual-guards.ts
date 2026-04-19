/**
 * P2.1 (sprint 3) — Guards purs extraits de la route
 * `/api/characters/[characterId]/generate-visual`.
 *
 * Objectif : pouvoir tester en isolation les garde-fous critiques sans avoir
 * à orchestrer FAL / OpenAI / Prisma / Billing. Chaque helper est pur et
 * réutilisable par d'autres routes (retry, rerun, etc.).
 */

export type CharacterLockState = {
  visualRefsCount: number;
  visualLocksCount: number;
  activeLoraCount: number;
  canonLocked: boolean;
  hasFingerprint: boolean;
};

/**
 * Un "lock" est attendu dès qu'au moins un signal canonique existe sur le
 * character. Dans ce cas, une génération sans la moindre référence stable
 * doit être refusée (on refuserait sinon une perte silencieuse de canon).
 */
export function isCharacterLockExpected(state: CharacterLockState): boolean {
  return (
    state.visualRefsCount > 0
    || state.visualLocksCount > 0
    || state.activeLoraCount > 0
    || state.canonLocked === true
    || state.hasFingerprint === true
  );
}

/**
 * Retourne `true` si la route DOIT refuser la génération avec 422 car un
 * lock est attendu mais aucune ref canonique stable ni LoRA actif n'est
 * disponible pour guider la génération.
 */
export function shouldRefuseCharacterVisualForMissingRefs(args: {
  state: CharacterLockState;
  stableRefUrlCount: number;
  activeLoraCount: number;
}): boolean {
  const lockExpected = isCharacterLockExpected(args.state);
  if (!lockExpected) return false;
  return args.stableRefUrlCount === 0 && args.activeLoraCount === 0;
}

/**
 * Politique `referencePolicy` pour la génération :
 *   - `STRONG` dès qu'un lock est attendu (on veut conserver l'identité)
 *   - `LIGHT` sinon (character sheet totalement neuf)
 */
export function resolveCharacterReferencePolicy(state: CharacterLockState): "STRONG" | "LIGHT" {
  return isCharacterLockExpected(state) ? "STRONG" : "LIGHT";
}
