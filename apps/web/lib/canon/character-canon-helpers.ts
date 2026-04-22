/**
 * AUDIT COMMIT 7 — helpers partagés pour la construction du canon perso.
 *
 * Avant, `apps/web/lib/chapter-studio/character-canon.ts` et
 * `apps/web/lib/canon/resolve-character-visual-canon.ts` construisaient
 * chacun leur propre représentation de :
 *   - referenceAssets (URLs)
 *   - loraBindings
 *   - fingerprint mergé
 *
 * Les deux s'étaient mises à diverger (ordre, dédoublonnage, merge bodyState),
 * ce qui produisait des incohérences entre studio et runtime. Ce module
 * centralise les briques pures pour que studio et runtime partagent une
 * seule vérité.
 */

/** Normaliseur LoRA interne (structure objet). */
export interface CharacterLoraBinding {
  triggerWord: string;
  url: string | null;
  scale: number;
}

/**
 * Agrège les URLs de références visuelles (lock canonique en priorité, puis
 * visualRefs) et dédoublonne en conservant l'ordre de première apparition.
 */
export function collectCharacterReferenceAssets(input: {
  lockCanonicalRefUrls?: unknown;
  visualRefs?: Array<{
    mediaAsset?: { publicUrl?: string | null } | null;
    imageUrl?: string | null;
  }> | null;
}): string[] {
  const lockRefUrls = Array.isArray(input.lockCanonicalRefUrls)
    ? (input.lockCanonicalRefUrls as unknown[]).filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];
  const refs = input.visualRefs ?? [];
  const derivedRefs = refs
    .map((ref) => ref.mediaAsset?.publicUrl ?? ref.imageUrl ?? null)
    .filter((value): value is string => Boolean(value));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...lockRefUrls, ...derivedRefs]) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Construit l'éventuel binding LoRA actif du perso. Retourne `null` si aucun
 * lock actif n'a de `triggerWord`. Structure objet, avec échelle par défaut
 * alignée sur `resolve-character-visual-canon.ts` (0.85).
 */
export function resolveActiveCharacterLoraBinding(input: {
  activeLock?: {
    triggerWord?: string | null;
    loraAsset?: { publicUrl?: string | null } | null;
  } | null;
  scale?: number;
}): CharacterLoraBinding | null {
  const trigger = input.activeLock?.triggerWord;
  if (!trigger) return null;
  return {
    triggerWord: trigger,
    url: input.activeLock?.loraAsset?.publicUrl ?? null,
    scale: typeof input.scale === "number" ? input.scale : 0.85,
  };
}

/**
 * Encode un binding LoRA dans le format string legacy `triggerWord|url`
 * attendu par le schéma `CharacterCanon` studio (z.array(z.string())).
 * Ce wrapper isolera la migration future vers une structure objet.
 */
export function encodeLegacyLoraBindingString(binding: CharacterLoraBinding | null): string | null {
  if (!binding) return null;
  return `${binding.triggerWord}|${binding.url ?? ""}`;
}

/**
 * Merge unifié du fingerprint utilisé par le canon studio : DNA stable de base,
 * complétée (et écrasée champ par champ) par le `characterFingerprint`
 * Prisma, avec `bodyState` injecté comme sous-objet.
 *
 * Retourne le `stableDNA` seul si le fingerprint est vide (cas legacy).
 */
export function mergeCharacterFingerprint(input: {
  stableDNA: Record<string, unknown>;
  characterFingerprint: Record<string, unknown>;
  bodyState: Record<string, unknown>;
}): Record<string, unknown> {
  if (Object.keys(input.characterFingerprint).length === 0) {
    return input.stableDNA;
  }
  return {
    ...input.stableDNA,
    ...input.characterFingerprint,
    bodyState: input.bodyState,
  };
}
