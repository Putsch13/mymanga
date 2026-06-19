/**
 * P0.3 (sprint 5) — Politique "Option B traçable" pour les visual refs
 * manuelles (PATCH /api/characters/[id]).
 *
 * Un import manuel (payload sans `mediaAssetId` associé en DB) :
 *   - n'est jamais canonique (`metadata.isCanonical = false`)
 *   - a une provenance explicite (`metadata.source = "manual_import"`,
 *     `metadata.assetProvenance = "external_stable_url"`)
 *   - ne peut pas devenir la ref primary (pilotage via `generate-visual`
 *     uniquement)
 *
 * Une ref existante déjà liée à un `mediaAsset` (produite par
 * `generate-visual`) conserve son `isPrimary` d'origine car sa provenance
 * asset est vérifiée (storageKey + storageProvider + assertStableCanonicalAsset).
 */
export type ManualVisualRefMetadata = {
  source: "manual_import";
  assetProvenance: "external_stable_url";
  isCanonical: false;
  importedAt: string;
  importedByUserId: string;
};

export function buildManualRefMetadata(userId: string, now: Date = new Date()): ManualVisualRefMetadata {
  return {
    source: "manual_import",
    assetProvenance: "external_stable_url",
    isCanonical: false,
    importedAt: now.toISOString(),
    importedByUserId: userId,
  };
}

/**
 * Règle de promotion `isPrimary` :
 *   - si `prevMediaAssetId` est non-null (ref déjà canonique créée par
 *     generate-visual) → on respecte le `isPrimary` demandé par le payload.
 *   - sinon (ref manuelle ou nouvelle) → on force `isPrimary=false`.
 */
export function resolveIsPrimary(args: {
  requestedIsPrimary: boolean;
  prevMediaAssetId: string | null | undefined;
}): boolean {
  if (args.prevMediaAssetId) return args.requestedIsPrimary;
  return false;
}
