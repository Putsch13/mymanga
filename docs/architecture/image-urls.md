# Image URLs — Source of truth

> Référence canonique pour les champs URL liés aux images (personnages,
> panels, keyframes, décors). Toute nouvelle colonne doit respecter les
> invariants documentés ici.

## TL;DR

| Champ                                     | Rôle            | Doit être stable ? | Peut être signé ? |
|-------------------------------------------|-----------------|--------------------|-------------------|
| `MediaAsset.publicUrl`                    | canonique       | ✅ oui             | ❌ non            |
| `MediaAsset.storageKey`                   | clé Supabase    | ✅ oui             | n/a               |
| `CharacterVisualRef.imageUrl`             | canonique       | ✅ oui             | ❌ non            |
| `CharacterVisualLock.canonicalRefUrls[]`  | canonique       | ✅ oui             | ❌ non            |
| `Location.visualRefs[].url`               | canonique       | ✅ oui             | ❌ non            |
| `SceneImage.imageUrl`                     | canonique       | ✅ oui             | ❌ non            |
| `SceneImage.persistedUrl`                 | miroir public   | ✅ oui             | ❌ non            |
| `<signed on read>` (helpers)              | éphémère        | ❌ non             | ✅ oui (1h TTL)   |

## Règle d'or

> **Ne jamais persister en DB une URL signée ou provider-temporaire.**
> Les URLs signées (Supabase `object/sign/…?token=…`) ou les CDN providers
> (`v3b.fal.media`, `cdn.fal.ai`, `delivery-*.bfl.ai`) ont un TTL. Si elles
> atterrissent dans une colonne canonique, le canon visuel se dégrade
> silencieusement à chaque expiration de token.

Le guard `apps/web/lib/images/assert-stable-image-url.ts` fait respecter
cette règle à l'écriture. Il est appelé dans :

- `apps/web/app/api/characters/[characterId]/generate-visual/route.ts`
- `apps/web/app/api/scene-images/[sceneImageId]/retry/route.ts`
- à chaque fois que `canonicalRefUrls`, `visualRefs.imageUrl`,
  `mediaAsset.publicUrl` sont écrits.

## Flow canonique de stockage

1. L'image est générée par le provider (Fal / BFL / OpenAI).
2. `persistGeneratedImageIfNeeded(opts)` la télécharge et la pousse dans
   le bucket Supabase configuré (`SUPABASE_STORAGE_BUCKET`).
3. La fonction retourne `{ ok: true, url, storageKey, persisted: true }`
   où :
   - `url` = `MediaAsset.publicUrl` → toujours lisible sans signature en
     bucket public, ou proxifié par `/api/images/proxy` en bucket privé.
   - `storageKey` = chemin réel uploadé incluant l'extension
     (ex. `projects/<pid>/characters/<cid>/refs/<ts>.png`).
4. `MediaAsset.create` est appelé avec `publicUrl` ET `storageKey` issus
   du même retour (≡ zéro divergence entre les deux).
5. La DB n'écrit JAMAIS `persisted: false` dans une colonne canonique :
   si Supabase est DOWN, l'endpoint retourne `422
   character_visual_not_persisted` et la réservation de tokens est
   remboursée.

## Flow canonique de lecture

Côté lecture (API studio, retry, reader), les URLs canoniques sont
converties au moment d'être passées :

- **à l'UI** : `signSupabaseUrlIfNeeded(url)` si le bucket est privé,
  sinon le proxy `/api/images/proxy?url=<encodé>` qui redirige via
  service role (utilisé pour les miniatures Studio — voir P0.7).
- **à un provider d'image** (retry, IP-Adapter, LoRA ref) : on signe
  avec `signSupabaseUrlIfNeeded(url)` juste avant l'appel HTTP et on ne
  stocke JAMAIS la version signée.

## Migration / check

- Script de vérification manuelle :
  ```sql
  SELECT 'character_visual_ref' AS col, count(*)
  FROM "CharacterVisualRef"
  WHERE "imageUrl" ILIKE '%token=%'
     OR "imageUrl" ILIKE '%/object/sign/%'
     OR "imageUrl" ILIKE '%v3b.fal.media%'
     OR "imageUrl" ILIKE '%cdn.fal.ai%'
     OR "imageUrl" ILIKE '%delivery-%.bfl.ai%';
  ```
  Doit retourner `0` pour toute colonne canonique listée en TL;DR.
- Test unitaire : `apps/web/tests/stable-image-url-guard.test.ts`
  verrouille la logique de rejet des URLs instables (P5.1).

## Historique

- **P0.1 → P0.3** (commit `04bf4ce`) : interdiction des URLs temporaires
  en canon + alignement `storageKey` réel + guard stable à l'écriture.
- **P0.7** : miniatures Studio proxifiées pour support bucket privé.
- **P1.3** : ajout `Location.visualRefs` avec mêmes garanties qu'au
  canon personnage.
- **P4.5** (ce fichier) : documentation définitive.
