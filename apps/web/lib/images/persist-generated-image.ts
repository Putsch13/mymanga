/**
 * P2.1 — Persist helper web-side.
 *
 * Depuis P2.1, toute la logique de download / upload / multi-bucket fallback
 * vit dans `@manga-ai-studio/workflow` (`persistImageIfNeeded`). Ce module
 * est maintenant un **fin adapter** qui :
 *   1. Délègue l'upload au contrat partagé.
 *   2. Convertit le résultat strict `PersistedImageResult` en l'ancien
 *      `PersistGeneratedImageResult` pour rester rétro-compatible avec les
 *      callsites web existants.
 *   3. Gère l'opt-in `allowTemporary` : les routes web qui ne font PAS
 *      d'écriture canonique (aperçu éphémère, miniature UI…) peuvent accepter
 *      un `ok:true / persisted:false / temporary:true` quand le storage n'est
 *      pas configuré. Les écritures canoniques (mediaAsset, characterVisualRef,
 *      canonicalRefUrls) NE DOIVENT PAS activer `allowTemporary` — elles
 *      doivent propager l'erreur pour refuser le chemin "URL provider en DB".
 */
import {
  persistImageIfNeeded as persistImageIfNeededShared,
  type PersistedImageResult,
} from "@manga-ai-studio/workflow";

export type PersistGeneratedImageResult =
  | { ok: true; url: string; persisted: true; storageKey: string }
  | { ok: true; url: string; persisted: false; storageKey: null }
  | { ok: true; url: string; persisted: false; storageKey: null; temporary: true; warning?: string }
  | { ok: false; error: string };

function adaptSharedResult(
  result: PersistedImageResult,
  opts: { originalUrl: string; allowTemporary?: boolean },
): PersistGeneratedImageResult {
  if (result.ok && result.persisted) {
    return { ok: true, url: result.url, persisted: true, storageKey: result.storageKey };
  }
  if (result.ok && !result.persisted) {
    return { ok: true, url: result.url, persisted: false, storageKey: null };
  }
  // result.ok === false
  if (opts.allowTemporary) {
    return {
      ok: true,
      url: opts.originalUrl,
      persisted: false,
      storageKey: null,
      temporary: true,
      warning: `${result.reason}:${result.message}`,
    };
  }
  if (result.reason === "no_storage_configured") {
    return {
      ok: false,
      error:
        "Stockage non configuré (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). L'image a été générée mais ne peut pas être sauvegardée de façon permanente.",
    };
  }
  return { ok: false, error: `${result.reason}:${result.message}` };
}

export async function persistGeneratedImageIfNeeded(opts: {
  imageUrl: string;
  objectPath: string;
  /**
   * Si true : retourner ok:true / temporary:true avec l'URL originale quand le
   * storage ne peut pas persister. Ne PAS activer pour les écritures canoniques
   * (mediaAsset, characterVisualRef, canonicalRefUrls) — cf. assertStableImageUrl.
   */
  allowTemporary?: boolean;
}): Promise<PersistGeneratedImageResult> {
  const shared = await persistImageIfNeededShared({
    imageUrl: opts.imageUrl,
    objectPath: opts.objectPath,
    logContext: `web:${opts.objectPath}`,
  });
  return adaptSharedResult(shared, {
    originalUrl: opts.imageUrl,
    allowTemporary: opts.allowTemporary,
  });
}
