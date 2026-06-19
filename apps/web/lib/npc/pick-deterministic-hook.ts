/**
 * P0.2 — Sélection déterministe d'un `narrativeHook` depuis une liste.
 *
 * Problème : `npc-resolve` utilisait `Math.random()` pour piocher un hook,
 * ce qui rendait la route non reproductible (audit, debug, replay, cache
 * applicatif côté client, tout était faussé). Deux appels consécutifs sur
 * la même entrée pouvaient renvoyer deux hooks différents.
 *
 * Correctif : on hash les entrées stables (projectId + description + univers
 * + ton + lieu) via SHA-256 et on en extrait un index dans la liste des
 * hooks. Même entrée ⇒ même sortie, sur n'importe quelle machine.
 *
 * Pourquoi SHA-256 plutôt qu'un simple hash Fowler/Noll/Vo ? Pas de raison
 * cryptographique ici — c'est juste la primitive la plus disponible (Node
 * `crypto`) et qui donne une distribution bien uniforme sur l'espace des
 * entrées courtes. Les 4 premiers bytes suffisent largement.
 */

import { createHash } from "crypto";

export interface DeterministicHookInput {
  projectId: string;
  rawDescription: string;
  universe?: string | null;
  tone?: string | null;
  sceneLocation?: string | null;
}

/**
 * Construit une clé stable à partir des entrées sémantiques. Les champs
 * optionnels sont normalisés (trim + lowercase) pour que "Fantasy " et
 * "fantasy" aboutissent au même hook. `projectId` n'est pas normalisé (il
 * doit matcher strictement).
 */
export function buildDeterministicHookSeed(input: DeterministicHookInput): string {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  return [
    input.projectId,
    norm(input.rawDescription),
    norm(input.universe),
    norm(input.tone),
    norm(input.sceneLocation),
  ].join("|");
}

/**
 * Retourne toujours le MÊME élément de `options` pour une entrée donnée.
 * Si la liste est vide, retourne `null`.
 */
export function pickDeterministicHook<T>(
  options: ReadonlyArray<T>,
  input: DeterministicHookInput,
): T | null {
  if (options.length === 0) return null;
  const seed = buildDeterministicHookSeed(input);
  const digest = createHash("sha256").update(seed).digest();
  const idx = digest.readUInt32BE(0) % options.length;
  return options[idx] ?? null;
}
