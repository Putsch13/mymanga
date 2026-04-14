"use client";

import { useEffect, useState } from "react";

interface SplashPageRendererProps {
  imageUrl: string;
  beatTitle?: string | null;
  chapterTitle?: string | null;
  chapterNumber: number;
  isOpening?: boolean;
  onTap?: () => void;
}

export function SplashPageRenderer({
  imageUrl,
  beatTitle,
  chapterTitle,
  chapterNumber,
  isOpening = false,
  onTap,
}: SplashPageRendererProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className="relative w-full overflow-hidden bg-black cursor-pointer select-none"
      style={{ aspectRatio: "3/4" }}
      onClick={onTap}
    >
      {/* Image pleine page avec animation fade-in */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        className={`w-full h-full object-cover transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        draggable={false}
      />

      {/* Skeleton pendant le chargement */}
      {!loaded && (
        <div className="absolute inset-0 bg-neutral-900 animate-pulse" />
      )}

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

      {/* Titre du chapitre en overlay (page d'ouverture) */}
      {isOpening && (
        <div
          className={`absolute bottom-10 left-0 right-0 text-center transition-all duration-700 ${loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          style={{ transitionDelay: "300ms" }}
        >
          <p className="text-white/50 text-xs tracking-[0.35em] uppercase mb-2 font-medium">
            Chapitre {chapterNumber}
          </p>
          {(beatTitle ?? chapterTitle) && (
            <h1
              className="text-white text-2xl sm:text-3xl font-bold tracking-tight drop-shadow-2xl px-6"
              style={{ textShadow: "0 2px 20px rgba(0,0,0,0.8)" }}
            >
              {beatTitle ?? chapterTitle}
            </h1>
          )}
        </div>
      )}

      {/* Badge Splash en haut à gauche */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <span className="bg-black/40 backdrop-blur-sm text-white/60 text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/10">
          Full page
        </span>
      </div>
    </div>
  );
}
