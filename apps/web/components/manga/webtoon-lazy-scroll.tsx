"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MangaPanel } from "./manga-panel";
import type { AnyPanelMood } from "./manga-panel";

/* ── Types ─────────────────────────────────────────────────────── */

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
    isSplashPage?: boolean;
    isDoublePage?: boolean;
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

/* ── Helpers ───────────────────────────────────────────────────── */

// BUG-READER-B : on préchargeait seulement 5 panels et le rootMargin était
// trop petit (400px), ce qui faisait voir des skeletons vides en scroll rapide
// et ne montrait jamais de panels hors-écran pour les webtoons. Passage à 12
// panels préchargés + marge de 600px.
const PRELOAD_COUNT = 12;
const ROOT_MARGIN = "600px 0px";

function isSplash(panel: WebtoonPanel): boolean {
  return !!(panel.layoutMeta?.isSplashPage || panel.layoutMeta?.isDoublePage);
}

// Un panel doit avoir été généré (status completed) ou avoir une imageUrl
// visible pour être rendu en webtoon. Sinon on évite d'afficher un "trou".
function hasRenderableImage(panel: WebtoonPanel): boolean {
  if (panel.imageUrl) return true;
  const status = (panel.status ?? "").toLowerCase();
  return status === "completed" || status === "pending" || status === "generating";
}

function SceneSeparator({ index }: { index: number }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="h-px w-2/3 bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />
      <span className="flex items-center gap-2 text-[11px] font-medium tracking-widest text-zinc-500 uppercase">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500" />
        Scène {index}
      </span>
    </div>
  );
}

function ChapterEnd() {
  return (
    <div className="flex flex-col items-center gap-4 pb-8 pt-12">
      <div className="h-px w-1/2 bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />
      <p className="text-sm font-light tracking-wide text-zinc-500">
        Fin du chapitre
      </p>
    </div>
  );
}

function PanelSkeleton({ aspectRatio }: { aspectRatio: string }) {
  return (
    <div
      className="w-full animate-pulse rounded-2xl bg-neutral-900/80"
      style={{ aspectRatio }}
    />
  );
}

/* ── Main component ────────────────────────────────────────────── */

export default function WebtoonLazyScroll({ pages }: WebtoonLazyScrollProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(new Set());
  const [revealedPanels, setRevealedPanels] = useState<Set<string>>(new Set());

  // Preload first N panels immediately
  useEffect(() => {
    const initial = new Set<string>();
    let count = 0;
    outer: for (const page of pages) {
      for (const [pIdx, panel] of page.panels.entries()) {
        initial.add(panel.id ?? `0-${pIdx}`);
        if (++count >= PRELOAD_COUNT) break outer;
      }
    }
    setVisiblePanels(initial);
    // Reveal first panels with a tiny delay so the transition plays
    requestAnimationFrame(() => setRevealedPanels(initial));
  }, [pages]);

  // IntersectionObserver — lazy load + reveal trigger
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
          requestAnimationFrame(() =>
            setRevealedPanels((prev) => new Set([...prev, ...toAdd])),
          );
        }
      },
      { rootMargin: ROOT_MARGIN, threshold: 0 },
    );
    return () => observerRef.current?.disconnect();
  }, []);

  const registerEl = useCallback((el: HTMLDivElement | null) => {
    if (el && observerRef.current) observerRef.current.observe(el);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[860px]">
      {/* Top fade gradient */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/60 to-transparent" />

      <div className="space-y-5 md:space-y-7">
        {pages.map((page, pageIdx) => {
          // Webtoon UX : la numérotation de scène est dérivée de pageIdx
          // (stable entre re-renders). On affiche un séparateur dès la
          // deuxième scène pour marquer visuellement les transitions.
          const sceneNumber = pageIdx + 1;
          const showSeparator = pageIdx > 0;

          // BUG-READER-B : on filtre les panels qui n'ont aucune chance d'être
          // rendus (status failed sans imageUrl) pour ne pas générer des trous.
          const renderablePanels = page.panels.filter(hasRenderableImage);
          if (renderablePanels.length === 0) return null;

          return (
            <div key={page.id ?? `page-${pageIdx}`}>
              {showSeparator && <SceneSeparator index={sceneNumber} />}

              {renderablePanels.map((panel, panelIdx) => {
                const panelKey = panel.id ?? `${pageIdx}-${panelIdx}`;
                const isLoaded = visiblePanels.has(panelKey);
                const isRevealed = revealedPanels.has(panelKey);
                const splash = isSplash(panel);

                const raw = panel.layoutMeta?.targetAspectRatio ?? "3/4";
                const [w, h] = raw.split(/[:/]/).map(Number);
                const aspectNum = w && h ? `${w}/${h}` : "3/4";

                return (
                  <div
                    key={panelKey}
                    ref={registerEl}
                    data-panel-id={panelKey}
                    className={`transition-all duration-700 ease-out ${
                      isRevealed
                        ? "translate-y-0 opacity-100"
                        : "translate-y-6 opacity-0"
                    } ${!splash ? "px-2 sm:px-4" : ""}`}
                    style={{ marginBottom: "1.25rem" }}
                  >
                    {!splash && (
                      <div className="mb-1 flex items-center justify-end">
                        <span className="text-[10px] font-mono tracking-wider text-zinc-600">
                          {sceneNumber}.{panelIdx + 1}
                        </span>
                      </div>
                    )}
                    {isLoaded ? (
                      <div className={splash ? "" : "overflow-hidden rounded-2xl border border-white/5"}>
                        <MangaPanel
                          mood={panel.mood ?? "dramatic"}
                          imageUrl={panel.imageUrl}
                          status={panel.status}
                          provider={panel.provider}
                          model={panel.model}
                          error={panel.error ?? undefined}
                          sceneImageId={panel.sceneImageId ?? panel.id ?? ""}
                          dialogue={
                            typeof panel.dialogue === "object" && panel.dialogue !== null
                              ? panel.dialogue.text
                              : undefined
                          }
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
                      </div>
                    ) : (
                      <PanelSkeleton aspectRatio={aspectNum} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        <ChapterEnd />
      </div>
    </div>
  );
}

export { WebtoonLazyScroll };
export type { WebtoonLazyScrollProps, WebtoonPage, WebtoonPanel };
