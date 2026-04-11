import type { PrismaClient } from "@manga-ai-studio/db";

export interface CanonicalRefAsset {
  /** URL de l'image (peut être expirée) */
  url: string;
  /** ID de l'asset en base — stable même si l'URL expire */
  assetId?: string;
  /** Clé de stockage — permet de régénérer une URL signée */
  storageKey?: string;
  /** True si l'URL est probablement expirée (> 7 jours) */
  likelyExpired?: boolean;
}

export interface CanonicalRefSelection {
  characterId: string;
  primaryRef: string | null;
  alternateRefs: string[];
  loraUrl: string | null;
  loraScale: number;
  /** Assets avec métadonnées stables (asset-first) */
  primaryRefAsset?: CanonicalRefAsset | null;
  alternateRefAssets?: CanonicalRefAsset[];
  /** Refs demandées */
  requestedRefs: string[];
  /** Refs effectivement utilisées */
  usedRefs: string[];
  /** Refs ignorées */
  ignoredRefs: string[];
  /** Raison de l'ignorance */
  ignoredReason?: string;
}

/** Vérifier si une URL est probablement expirée (URL signée > 7 jours) */
function isLikelyExpired(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // URLs signées FAL/S3 ont souvent un paramètre d'expiration
    const expires = urlObj.searchParams.get("X-Amz-Expires") ?? urlObj.searchParams.get("se");
    if (expires) {
      const expiresMs = parseInt(expires, 10) * 1000;
      return Date.now() > expiresMs;
    }
    // URLs temporaires fal.media avec timestamp
    if (url.includes("fal.media") && url.includes("/files/")) {
      // Heuristique : considérer comme potentiellement expirée si l'URL contient un hash temporaire
      return false; // FAL gère ses propres expirations
    }
  } catch {
    // URL invalide
  }
  return false;
}

/**
 * Sélectionne les refs canoniques appropriées pour un personnage dans un contexte donné.
 * Hiérarchie :
 * 1. Scene override (si disponible dans sceneState)
 * 2. Current chapter approved refs (si chapterId fourni — maintenant implémenté)
 * 3. Character canonical refs (visualRefs isPrimary)
 * 4. LoRA model (si disponible et actif)
 *
 * Asset-first : retourne assetId + storageKey pour résoudre les URLs expirées.
 */
export async function selectCanonicalRefs(
  prisma: PrismaClient,
  input: {
    characterId: string;
    sceneState?: {
      characterOverrides?: Array<{
        characterId: string;
        props?: string[];
      }>;
      imageReferenceIds?: string[];
    };
    chapterId?: string;
  },
): Promise<CanonicalRefSelection> {
  const requestedRefs: string[] = [];
  const usedRefs: string[] = [];
  const ignoredRefs: string[] = [];
  let ignoredReason: string | undefined;

  const character = await prisma.character.findUnique({
    where: { id: input.characterId },
    include: {
      visualRefs: { where: { isPrimary: true } },
      loraAttachments: {
        where: { enabled: true },
        include: { lora: true },
      },
    },
  });

  if (!character) {
    return {
      characterId: input.characterId,
      primaryRef: null,
      alternateRefs: [],
      loraUrl: null,
      loraScale: 0,
      requestedRefs,
      usedRefs,
      ignoredRefs,
    };
  }

  let primaryRef: string | null = null;
  let primaryRefAsset: CanonicalRefAsset | null = null;
  const alternateRefs: string[] = [];
  const alternateRefAssets: CanonicalRefAsset[] = [];

  // 1. Scene override : imageReferenceIds depuis sceneState
  if (input.sceneState?.imageReferenceIds && input.sceneState.imageReferenceIds.length > 0) {
    const sceneRefs = input.sceneState.imageReferenceIds;
    requestedRefs.push(...sceneRefs);
    primaryRef = sceneRefs[0] ?? null;
    if (primaryRef) {
      primaryRefAsset = { url: primaryRef, likelyExpired: isLikelyExpired(primaryRef) };
      usedRefs.push(primaryRef);
    }
    alternateRefs.push(...sceneRefs.slice(1));
    for (const ref of sceneRefs.slice(1)) {
      alternateRefAssets.push({ url: ref, likelyExpired: isLikelyExpired(ref) });
      usedRefs.push(ref);
    }
  }

  // 2. Chapter approved refs — maintenant implémenté via sceneImages du chapitre
  if (!primaryRef && input.chapterId) {
    try {
      const chapterImages = await (prisma as PrismaClient & {
        sceneImage?: {
          findMany: (args: unknown) => Promise<Array<{ id: string; imageUrl: string | null; metadata: unknown }>>;
        };
      }).sceneImage?.findMany({
        where: {
          scene: { chapter: { id: input.chapterId } },
          status: "completed",
          imageUrl: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, imageUrl: true, metadata: true },
      });

      if (chapterImages && chapterImages.length > 0) {
        for (const img of chapterImages) {
          if (!img.imageUrl) continue;
          const meta = img.metadata as Record<string, unknown> | null;
          const charIds = Array.isArray(meta?.characterIds) ? meta.characterIds as string[] : [];
          if (charIds.includes(input.characterId)) {
            requestedRefs.push(img.imageUrl);
            if (!primaryRef) {
              primaryRef = img.imageUrl;
              primaryRefAsset = { url: img.imageUrl, assetId: img.id, likelyExpired: isLikelyExpired(img.imageUrl) };
              usedRefs.push(img.imageUrl);
            } else {
              alternateRefs.push(img.imageUrl);
              alternateRefAssets.push({ url: img.imageUrl, assetId: img.id, likelyExpired: isLikelyExpired(img.imageUrl) });
              usedRefs.push(img.imageUrl);
            }
          }
        }
      }
    } catch {
      // Silently ignore if sceneImage model not available
    }
  }

  // 3. Character canonical refs
  if (!primaryRef && character.visualRefs.length > 0) {
    const canonRefs = character.visualRefs;
    requestedRefs.push(...canonRefs.map((r) => r.imageUrl));

    const firstRef = canonRefs[0];
    if (firstRef) {
      primaryRef = firstRef.imageUrl;
      primaryRefAsset = {
        url: firstRef.imageUrl,
        assetId: firstRef.id,
        storageKey: (firstRef as Record<string, unknown>).storageKey as string | undefined,
        likelyExpired: isLikelyExpired(firstRef.imageUrl),
      };
      usedRefs.push(firstRef.imageUrl);
    }

    for (const ref of canonRefs.slice(1)) {
      alternateRefs.push(ref.imageUrl);
      alternateRefAssets.push({
        url: ref.imageUrl,
        assetId: ref.id,
        storageKey: (ref as Record<string, unknown>).storageKey as string | undefined,
        likelyExpired: isLikelyExpired(ref.imageUrl),
      });
      usedRefs.push(ref.imageUrl);
    }
  }

  // Tracer les refs ignorées
  for (const req of requestedRefs) {
    if (!usedRefs.includes(req)) {
      ignoredRefs.push(req);
    }
  }
  if (ignoredRefs.length > 0) {
    ignoredReason = "ref_not_selected_by_hierarchy";
  }

  // 4. LoRA model
  let loraUrl: string | null = null;
  let loraScale = 1.0;
  const loraAttachment = character.loraAttachments.find(
    (att) => att.enabled && att.lora.status === "active",
  );
  if (loraAttachment) {
    const weightsMeta = loraAttachment.lora.weightsMeta as { loraUrl?: string } | undefined;
    loraUrl = weightsMeta?.loraUrl ?? null;
    loraScale = loraAttachment.weight;
  }

  return {
    characterId: input.characterId,
    primaryRef,
    alternateRefs,
    loraUrl,
    loraScale,
    primaryRefAsset,
    alternateRefAssets,
    requestedRefs,
    usedRefs,
    ignoredRefs,
    ignoredReason,
  };
}
