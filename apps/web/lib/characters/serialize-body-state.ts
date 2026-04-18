/**
 * P1.4 — Sérialiseur dédié pour `Character.bodyState`.
 *
 * Extrait de `lib/retry/build-character-retry-hints.ts` pour respecter la
 * séparation imposée par le plan d'assainissement :
 *   - `lib/characters/serialize-body-state.ts` (serializer pur)
 *   - `lib/retry/build-character-retry-hints.ts` (consommateur retry)
 *
 * Règle d'or : aucun `String(blob)` naïf dans un prompt. On gère string /
 * array / object / null de façon explicite.
 */

export { serializeBodyStateForPrompt } from "@/lib/retry/build-character-retry-hints";
