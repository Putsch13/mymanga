/**
 * P5.2 — Hook de navigation clavier + tactile du reader manga.
 *
 * Gère :
 * - les flèches clavier (sens RTL/LTR respecté) + barre espace,
 * - Escape pour quitter le fullscreen,
 * - le swipe tactile (delta > 50px),
 * - la mise en pause des listeners en mode webtoon
 *   (le scroll vertical a sa propre logique).
 *
 * Extrait 1:1 du composant pour être testable indépendamment.
 */

"use client";

import { useEffect, useRef } from "react";

export type UseReaderNavigationInput = {
  readerMode: "manga" | "webtoon";
  mangaRtl: boolean;
  fullscreen: boolean;
  goNext: () => void;
  goPrev: () => void;
  onExitFullscreen: () => void;
};

export function useReaderNavigation(input: UseReaderNavigationInput): void {
  const { readerMode, mangaRtl, fullscreen, goNext, goPrev, onExitFullscreen } = input;
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (readerMode === "webtoon") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        if (mangaRtl) goPrev();
        else goNext();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (mangaRtl) goNext();
        else goPrev();
      }
      if (e.key === "Escape" && fullscreen) onExitFullscreen();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readerMode, mangaRtl, fullscreen, goNext, goPrev, onExitFullscreen]);

  useEffect(() => {
    if (readerMode === "webtoon") return;
    function onTouchStart(e: TouchEvent) {
      touchStartX.current = e.touches[0]?.clientX ?? null;
    }
    function onTouchEnd(e: TouchEvent) {
      if (touchStartX.current === null) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(dx) < 50) return;
      if (dx < 0) {
        if (mangaRtl) goPrev();
        else goNext();
      } else {
        if (mangaRtl) goNext();
        else goPrev();
      }
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [readerMode, mangaRtl, goNext, goPrev]);
}
