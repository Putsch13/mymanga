/**
 * P0.4 — Helper centralisé pour résoudre l'URL stable d'un SceneImage.
 *
 * Contexte : on a historiquement deux colonnes URL sur `SceneImage` :
 *   - `persistedUrl` : URL stable (Supabase Storage), écrite si la persistence
 *     a réussi. C'est la vérité canonique.
 *   - `imageUrl` : URL active (parfois provider temporaire, parfois identique
 *     à persistedUrl). Conservée en fallback pour :
 *        1. les rows legacy qui n'ont pas encore `persistedUrl` set ;
 *        2. les panels où la persistence a échoué mais où l'image est quand
 *           même accessible via le provider (fenêtre temporaire acceptable
 *           en lecture, interdite en canon — voir assert-stable-image-url).
 *
 * Règle : `persistedUrl` a TOUJOURS la priorité. `imageUrl` n'est utilisé
 * qu'en dernier recours. Aucune route d'écriture canon n'accepte
 * `imageUrl` nu (guard `assertStableImageUrl`).
 *
 * Ce helper remplace les `img.persistedUrl ?? img.imageUrl` disséminés.
 */

export type StableUrlInput = {
  persistedUrl?: string | null;
  imageUrl?: string | null;
};

/**
 * Retourne l'URL stable prioritaire d'une image ou null si aucune disponible.
 * N'effectue AUCUN check de stabilité (signed-url / provider-tmp) : pour ça,
 * voir `assertStableImageUrl` qui sert au MOMENT de l'écriture canon.
 */
export function getStableImageUrl(img: StableUrlInput | null | undefined): string | null {
  if (!img) return null;
  if (img.persistedUrl && img.persistedUrl.length > 0) return img.persistedUrl;
  if (img.imageUrl && img.imageUrl.length > 0) return img.imageUrl;
  return null;
}

/**
 * Même chose mais retourne une chaîne vide plutôt que null, pour les usages
 * `<Image src={...} />` qui n'acceptent pas null.
 */
export function getStableImageUrlOrEmpty(img: StableUrlInput | null | undefined): string {
  return getStableImageUrl(img) ?? "";
}

/**
 * True si l'image a au moins une URL disponible (stable ou legacy).
 * Utile pour filtrer les rows "completed mais URL missing".
 */
export function hasDisplayableImageUrl(img: StableUrlInput | null | undefined): boolean {
  return getStableImageUrl(img) !== null;
}
