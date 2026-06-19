"use client";

import { useEffect } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";

/**
 * SPRINT 4 — Lightbox panel zoom.
 *
 * Un overlay full-screen affichant l'image d'un panel à 100% de sa résolution
 * native. Avant ce composant (audit v7), aucun moyen de regarder un détail
 * de panel — frustration #1 des bêta-testeurs en mode webtoon.
 *
 * UX :
 *   - Click hors image, touche Escape, ou clic sur ✕ pour fermer
 *   - +/- pour zoom navigateur (delegation au browser)
 *   - sr-only pour l'accessibilité
 */

interface Props {
  imageUrl: string | null;
  caption?: string | null;
  onClose: () => void;
}

export function PanelLightbox({ imageUrl, caption, onClose }: Props) {
  useEffect(() => {
    if (!imageUrl) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [imageUrl, onClose]);

  if (!imageUrl) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu agrandi du panel"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Fermer"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80">
        <ZoomIn className="h-3.5 w-3.5" />
        Pincer / molette pour zoomer
        <ZoomOut className="h-3.5 w-3.5 opacity-50" />
      </div>
      <div
        className="relative max-h-[92vh] max-w-[92vw] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={caption ?? "Panel agrandi"}
          className="block max-h-[92vh] max-w-[92vw] object-contain shadow-2xl shadow-black"
        />
      </div>
      {caption ? (
        <p className="absolute bottom-4 left-1/2 max-w-[80vw] -translate-x-1/2 rounded-lg bg-black/60 px-4 py-2 text-center text-sm text-white">
          {caption}
        </p>
      ) : null}
    </div>
  );
}
