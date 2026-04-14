"use client";

/**
 * READ-3 — WebtoonLazyScroll : scroll infini avec lazy loading via IntersectionObserver.
 * Précharge les images 300px avant qu'elles entrent dans le viewport.
 */

import { useEffect, useRef, useState } from "react";
import { MangaPanel } from "./manga-panel";
import type { AnyPanelMood } from "./manga-panel";
import { BookOpen } from "lucide-react";

interface WebtoonPanel {
  id?: string;
  imageUrl?: string | null;
  status?: string;
  provider?: string | null;
  model?: string | null;
  error?: string | null;
  sceneImageId?: string;
  dialogue?: { speaker: string; text: string } | string | null;
  dialogues?: Array<{ speaker: string; text: string }>;
  speaker?: string | null;
  narration?: string | null;
  sfx?: string | null;
  caption?: string | null;
  mood?: AnyPanelMood;
  textScale?: "normal" | "compact" | "micro";
  renderMeta?: {
    cropMode?: "contain" | "cover";
    focalPoint?: { x: number; y: number };
    safeArea?: { top: number; right: number; bottom: number; left: number };
    reservedTextZones?: Array<"top-left" | "top-right" | "bottom-left" | "bottom-right" | "center">;
  };
  layoutMeta?: {
    slotType?: "wide" | "tall" | "square" | "closeup" | "dialogue";
    targetAspectRatio?: string;
    layoutTemplate?: string;
  };
  pageIndex: number;
}

interface WebtoonPage {
  id: string;
  panels: WebtoonPanel[];
}

interface WebtoonLazyScrollProps {
  pages: WebtoonPage[];
  onRetryPanel?: (panelId: string, mode: "environment" | "character" | "composition") => void;
  retryingPanel?: string | null;
}


export function WebtoonLazyScroll({ pages }: WebtoonLazyScrollProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(new Set());

  // Initialiser le premier écran visible
  useEffect(() => {
    const initialVisible = new Set<string>();
    let count = 0;
    outer: for (const page of pages) {
      for (const [pIdx, panel] of page.panels.entries()) {
        initialVisible.add(panel.id ?? `0-${pIdx}`);
        count++;
        if (count >= 4) break outer; // Précharger les 4 premiers panels immédiatement
      }
    }
    setVisiblePanels(initialVisible);
  }, [pages]);

  // IntersectionObserver pour le lazy loading
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const toAdd: string[] = [];
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const key = (entry.target as HTMLElement).dataset.panelId;
            if (key) toAdd.push(key);
          }
        });
        if (toAdd.length > 0) {
          setVisiblePanels((prev) => new Set([...prev, ...toAdd]));
        }
      },
      { rootMargin: "350px 0px", threshold: 0 },
    );

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  const registerEl = (el: HTMLDivElement | null) => {
    if (el && observerRef.current) {
      observerRef.current.observe(el);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="space-y-12 md:space-y-16">
        {pages.map((page, pageIdx) => (
          <section
            key={page.id ?? `page-${pageIdx}`}
            className="space-y-4 rounded-[32px] border border-white/5 bg-white/[0.02] px-2 py-4 sm:px-4"
          >
            {/* Badge page sticky */}
            <div className="sticky top-3 z-20 mx-auto flex w-fit items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs text-stone-200 backdrop-blur">
              <BookOpen className="h-3.5 w-3.5 text-accent" />
              <span>Page {pageIdx + 1}</span>
            </div>

            {/* Panels avec lazy loading */}
            <div className="space-y-6 md:space-y-8">
              {page.panels.map((panel, panelIdx) => {
                const panelKey = panel.id ?? `${pageIdx}-${panelIdx}`;
                const isLoaded = visiblePanels.has(panelKey);
                const aspectRatio = panel.layoutMeta?.targetAspectRatio ?? "3/4";
                const [w, h] = aspectRatio.split(/[:/]/).map(Number);
                const aspectNum = (w && h) ? `${w}/${h}` : "3/4";

                return (
                  <div
                    key={panel.id ?? `${pageIdx}-${panelIdx}`}
                    ref={registerEl}
                    data-panel-id={panel.id ?? `${pageIdx}-${panelIdx}`}
                  >
                    {isLoaded ? (
                      <MangaPanel
                        mood={panel.mood ?? "dramatic"}
                        imageUrl={panel.imageUrl}
                        status={panel.status}
                        provider={panel.provider}
                        model={panel.model}
                        error={panel.error ?? undefined}
                        sceneImageId={panel.sceneImageId ?? panel.id ?? ""}
                        dialogue={typeof panel.dialogue === "object" && panel.dialogue !== null ? panel.dialogue.text : undefined}
                        dialogues={panel.dialogues}
                        speaker={panel.speaker ?? undefined}
                        narration={panel.narration ?? undefined}
                        sfx={panel.sfx ?? undefined}
                        caption={panel.caption ?? undefined}
                        textScale={panel.textScale}
                        renderMeta={panel.renderMeta}
                        layoutMeta={panel.layoutMeta}
                        renderMode="webtoon"
                        panelIndex={panelIdx}
                      />
                    ) : (
                      // Skeleton placeholder avec aspect ratio correct
                      <div
                        className="w-full rounded-lg bg-neutral-900 animate-pulse"
                        style={{ aspectRatio: aspectNum }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
