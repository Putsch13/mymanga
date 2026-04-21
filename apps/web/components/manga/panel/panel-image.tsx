"use client";

/**
 * Sprint 2 — Composition des panels
 *
 * Rendu pur de l'image d'un panel. Extrait de `manga-panel.tsx` pour isoler
 * la logique image / statut / retry des overlays texte.
 *
 * Responsabilités :
 *   - rendu de l'image (cover/contain, focal point)
 *   - état "en cours de génération" (spinner)
 *   - état "échec" (avec bouton retry)
 *   - état "completed mais vide" (case à regénérer)
 *   - auto-retry silencieux si provider=cache et URL cassée
 *
 * Ne gère PAS : bulles, SFX, narration, status badge, edit controls.
 * Ces concerns sont traités par `panel-composed-view.tsx` et les overlays
 * dédiés.
 */

import { useRef, useState } from "react";

export interface PanelImageProps {
  imageUrl?: string | null;
  status?: string;
  provider?: string | null;
  error?: string | null;
  sceneImageId?: string;
  caption?: string;
  panelIndex?: number;
  /** "contain" respecte le ratio d'origine, "cover" remplit le slot. */
  cropMode?: "contain" | "cover";
  /** Point focal en `x% y%` (ex: "50% 30%"). */
  objectPosition?: string;
  /** En mode webtoon, fond et bordures légèrement différents. */
  isWebtoon?: boolean;
  className?: string;
  /** Callback déclenché quand l'image charge (pour mesurer la taille réelle). */
  onLoad?: (el: HTMLImageElement) => void;
}

export function PanelImage({
  imageUrl,
  status,
  provider,
  error,
  sceneImageId,
  caption,
  panelIndex,
  cropMode = "cover",
  objectPosition = "center top",
  isWebtoon = false,
  className,
  onLoad,
}: PanelImageProps) {
  const [imageBroken, setImageBroken] = useState(false);
  const autoRetryRef = useRef(false);

  const isPending = !imageUrl && (status === "planned" || status === "pending");
  const isFailed = !imageUrl && (status === "failed" || status === "blocked");
  const isCompletedButEmpty = !imageUrl && status === "completed";
  const isCachedProvider = provider === "cache";
  const alt = caption ?? `Panel ${(panelIndex ?? 0) + 1}`;

  if (imageUrl && !imageBroken) {
    return (
      <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`}>
        {cropMode === "contain" && (
          <div className="absolute inset-0 bg-gradient-to-b from-stone-900 via-stone-950 to-stone-900" />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          className={`h-full w-full ${cropMode === "contain" ? "object-contain" : "object-cover"} ${
            isWebtoon ? "bg-stone-950" : ""
          }`}
          style={{ objectPosition }}
          onLoad={(e) => onLoad?.(e.currentTarget)}
          onError={() => {
            setImageBroken(true);
            if (isCachedProvider && sceneImageId && !autoRetryRef.current) {
              autoRetryRef.current = true;
              fetch(`/api/scene-images/${sceneImageId}/retry?mode=environment`, {
                method: "POST",
              }).catch(() => {
                /* ignore */
              });
            }
          }}
        />
      </div>
    );
  }

  if (isPending) {
    return (
      <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-900">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-600 border-t-stone-300" />
          <p className="text-[10px] text-stone-500">Génération en cours…</p>
        </div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stone-900 p-3 text-center">
          <div className="text-2xl opacity-40">✕</div>
          <p className="text-[10px] text-stone-500">Image non disponible</p>
          {error ? <p className="line-clamp-3 text-[10px] text-stone-400/80">{error}</p> : null}
          {sceneImageId && (
            <button
              type="button"
              className="mt-2 rounded-md border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-medium text-white/80 hover:bg-white/20"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const res = await fetch(`/api/scene-images/${sceneImageId}/retry`, {
                    method: "POST",
                  });
                  if (res.ok) window.location.reload();
                } catch {
                  /* ignore */
                }
              }}
            >
              Réessayer
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isCompletedButEmpty || imageBroken) {
    // READ-PREMIUM — panel "completed" sans image servie : on n'affiche pas
    // une case noire facturée silencieusement mais un skeleton explicite.
    return (
      <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-stone-900 to-stone-950 p-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/30 bg-amber-950/30 text-amber-300">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
          </div>
          <p className="text-[11px] font-semibold text-stone-200">Case à regénérer</p>
          <p className="max-w-[180px] text-[10px] leading-snug text-stone-500">
            {isCachedProvider
              ? "Réutilisation de décor indisponible — nouvelle génération relancée."
              : "L'image n'a pas pu être servie — relance manuelle possible."}
          </p>
          {sceneImageId ? (
            <button
              type="button"
              className="mt-1 rounded-md border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-medium text-white/80 hover:bg-white/20"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const res = await fetch(`/api/scene-images/${sceneImageId}/retry`, {
                    method: "POST",
                  });
                  if (res.ok) window.location.reload();
                } catch {
                  /* ignore */
                }
              }}
            >
              Regénérer
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return <div className={`relative h-full w-full ${className ?? ""}`} />;
}

export default PanelImage;
