/**
 * Helpers partagés pour la construction du canon perso (studio + runtime).
 * Alignés sur l’historique `apps/web/lib/canon/character-canon-helpers.ts`.
 */

/** Normaliseur LoRA interne (structure objet). */
export interface CharacterLoraBinding {
  triggerWord: string;
  url: string | null;
  scale: number;
}

/**
 * Agrège les URLs de références visuelles (lock canonique en priorité, puis
 * visualRefs) et dédoublonne en conservant l’ordre de première apparition.
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
 * Construit l’éventuel binding LoRA actif du perso. Retourne `null` si aucun
 * lock actif n’a de `triggerWord`.
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

/** Encode le format string legacy `triggerWord|url` pour CharacterCanon studio. */
export function encodeLegacyLoraBindingString(binding: CharacterLoraBinding | null): string | null {
  if (!binding) return null;
  return `${binding.triggerWord}|${binding.url ?? ""}`;
}

/**
 * Merge unifié du fingerprint utilisé par le canon studio : DNA stable de base,
 * complétée par le `characterFingerprint`, avec `bodyState` injecté.
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
