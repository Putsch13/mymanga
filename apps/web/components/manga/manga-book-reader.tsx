"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileText,
  ImageIcon,
  Maximize2,
  Minimize2,
  Pause,
  RefreshCw,
  Repeat2,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@manga-ai-studio/ui";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MangaPageGrid } from "./manga-page-grid";
import { WebtoonLazyScroll } from "./webtoon-lazy-scroll";
import { SplashPageRenderer } from "./splash-page-renderer";
import { MangaCanvasRenderer } from "./manga-canvas-renderer";
// P5.2 — extractions pour alléger ce composant monolithique. Les shapes
// sont strictement identiques à celles précédemment inline : la typo a été
// déplacée, pas modifiée.
import type {
  CanonStateData,
  ChapterPayload,
  ReaderResponse,
} from "./reader/reader-types";
import { buildPagesFromChapter, flattenPagesToPanels } from "./reader/build-reader-pages";
import { computeCanvasPanelsFromReaderPage } from "./reader/page-template-registry";
import { READER_QUICK_TAGS, READER_SUGGESTIONS } from "./reader/reader-constants";
import { computeReaderDegradedWarning } from "./reader/compute-degraded-warning";
import { useReaderTts } from "./reader/use-reader-tts";
import { useReaderNavigation } from "./reader/use-reader-navigation";
import { PREMIUM_PANEL_RANGE } from "@manga-ai-studio/core";

type Props = {
  projectId: string;
  chapterId: string;
  /** READ-PREMIUM : démarre directement en mode fullscreen immersif */
  autoFullscreen?: boolean;
  /** READ-PREMIUM : URL de sortie (bouton "Fermer" en fullscreen) */
  exitHref?: string;
  /**
   * READ-PREMIUM : cible d'images pour badge compteur.
   *
   * COMMIT E — défaut tiré de `PREMIUM_PANEL_RANGE.target` (72), plus de
   * `75` hardcodé. Un caller peut forcer une autre valeur pour un usage
   * spécifique, mais la valeur par défaut reste la cible produit unique.
   */
  targetImages?: number;
};

export function MangaBookReader({
  projectId,
  chapterId,
  autoFullscreen = false,
  exitHref,
  targetImages = PREMIUM_PANEL_RANGE.target,
}: Props) {
  const [chapter, setChapter] = useState<ChapterPayload | null>(null);
  const [memorySummary, setMemorySummary] = useState<string | null>(null);
  const [imageStats, setImageStats] = useState<ReaderResponse["imageStats"]>(null);
  const [activeJob, setActiveJob] = useState<ReaderResponse["activeJob"]>(null);
  const [generationDiagnostics, setGenerationDiagnostics] = useState<ReaderResponse["generationDiagnostics"]>(null);
  const [canonState, setCanonState] = useState<CanonStateData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [showTextOnly, setShowTextOnly] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [fullscreen, setFullscreen] = useState(autoFullscreen);
  const [spreadMode, setSpreadMode] = useState(true);
  // PHASE 5: Le mode lecteur initial est déterminé par le format du projet (manga/webtoon)
  // Le state sera mis à jour après le chargement du chapitre avec le format réel du projet
  const [readerMode, setReaderMode] = useState<"manga" | "webtoon">("manga");
  const [inspectOpen, setInspectOpen] = useState(false);
  const [mangaRtl, setMangaRtl] = useState(true);
  const [turn, setTurn] = useState<null | { dir: "next" | "prev"; at: number }>(null);
  const [intent, setIntent] = useState("");
  const [continuing, setContinuing] = useState(false);
  const [continueMsg, setContinueMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [retryingPanel, setRetryingPanel] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  const { playingTtsId, playDialogue } = useReaderTts();
  const degradedReaderWarning = computeReaderDegradedWarning(generationDiagnostics);

  const load = useCallback(async (options?: { preserveIndex?: boolean; skipModeInit?: boolean }) => {
    setLoadError(null);
    const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}`);
    if (!res.ok) {
      setLoadError("Chapitre introuvable");
      return;
    }
    const j = (await res.json()) as ReaderResponse;
    setChapter(j.chapter);
    setMemorySummary(j.memorySnapshot?.narrativeSummary ?? null);
    setImageStats(j.imageStats ?? null);
    setActiveJob(j.activeJob ?? null);
    setGenerationDiagnostics(j.generationDiagnostics ?? null);
    if (!options?.preserveIndex) {
      setPageIndex(0);
      setShowEnd(false);
    }
    // PHASE 5: Initialiser le mode lecteur basé sur le format du projet
    if (!options?.skipModeInit && j.projectFormat) {
      setReaderMode(j.projectFormat);
      console.info("[reader] projectFormat", j.projectFormat, "initialMode", j.projectFormat);
    }
    // Charger le canon state
    fetch(`/api/projects/${projectId}/chapters/${chapterId}/canon-state`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setCanonState(data as CanonStateData))
      .catch(() => setCanonState(null));
  }, [projectId, chapterId]);

  const retryPanel = useCallback(async (panelId: string, mode: "environment" | "character" | "composition") => {
    setRetryingPanel(`${panelId}:${mode}`);
    try {
      // BUG-READER-C : on passe désormais `mode` en body JSON plutôt qu'en
      // query string. Le endpoint /retry supporte les deux pendant la
      // transition mais le body est la voie officielle (BUG-13/BUG-14).
      const res = await fetch(`/api/scene-images/${panelId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (res.ok) {
        await load({ preserveIndex: true, skipModeInit: true });
      }
    } finally {
      setRetryingPanel(null);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh pendant une génération d'images / pipeline pour éviter le besoin de refresh manuel.
  useEffect(() => {
    if (!activeJob) return;
    if (!["queued", "running", "waiting_external"].includes(activeJob.status)) return;
    const interval = window.setInterval(() => {
      void load({ preserveIndex: true, skipModeInit: true });
    }, 2500);
    return () => window.clearInterval(interval);
  }, [activeJob, load]);

  // Responsive: double page uniquement sur écrans larges
  useEffect(() => {
    if (readerMode !== "manga") return;
    const update = () => {
      const wide = window.innerWidth >= 1024;
      if (!wide) setSpreadMode(false);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [readerMode]);

  const pages = useMemo(() => {
    if (!chapter) return [];
    return buildPagesFromChapter(chapter);
  }, [chapter]);

  const totalPages = pages.length;
  const webtoonPanels = useMemo(() => flattenPagesToPanels(pages), [pages]);

  const panelQaByPanelId = useMemo(() => {
    if (!chapter?.scenes) return undefined;
    const map: Record<string, { score?: number; reasons?: string[] }> = {};
    for (const scene of chapter.scenes) {
      for (const img of scene.images) {
        const raw = img.metadata as Record<string, unknown> | undefined;
        const v = raw?.visualQa;
        if (v && typeof v === "object") {
          const o = v as { score?: unknown; reasons?: unknown };
          const score = typeof o.score === "number" ? o.score : undefined;
          const reasons = Array.isArray(o.reasons)
            ? o.reasons.filter((x): x is string => typeof x === "string")
            : undefined;
          map[img.id] = { score, reasons };
        }
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }, [chapter]);

  const goNext = useCallback(() => {
    setTurn({ dir: "next", at: Date.now() });
    setShowSwipeHint(false);
    const step = spreadMode ? 2 : 1;
    setTransitioning(true);
    setTimeout(() => {
      if (pageIndex < totalPages - step) {
        setPageIndex((i) => i + step);
      } else {
        setShowEnd(true);
      }
      setTransitioning(false);
    }, 180);
  }, [pageIndex, totalPages, spreadMode]);

  const goPrev = useCallback(() => {
    setTurn({ dir: "prev", at: Date.now() });
    setTransitioning(true);
    setTimeout(() => {
      if (showEnd) {
        setShowEnd(false);
      } else {
        const step = spreadMode ? 2 : 1;
        setPageIndex((i) => Math.max(0, i - step));
      }
      setTransitioning(false);
    }, 180);
  }, [showEnd, spreadMode]);

  // P5.2 — keyboard + swipe + Escape handler extraits dans useReaderNavigation.
  useReaderNavigation({
    readerMode,
    mangaRtl,
    fullscreen,
    goNext,
    goPrev,
    onExitFullscreen: () => setFullscreen(false),
  });

  useEffect(() => {
    if (!showSwipeHint) return;
    const t = setTimeout(() => setShowSwipeHint(false), 3500);
    return () => clearTimeout(t);
  }, [showSwipeHint]);

  async function submitContinue(quickTag?: string) {
    const text = intent.trim();
    if (!text && !quickTag) return;
    setContinuing(true);
    setContinueMsg(null);
    const res = await fetch(
      `/api/projects/${projectId}/chapters/${chapterId}/continue`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIntent: text || `Préférence : ${quickTag}`, quickTag }),
      },
    );
    const j = (await res.json()) as { message?: string; nextChapterId?: string };
    setContinuing(false);
    if (!res.ok) {
      setContinueMsg(j.message ?? "Erreur");
      return;
    }
    setContinueMsg(j.message ?? "OK");
    if (j.nextChapterId) {
      window.location.href = `/projects/${projectId}/chapters/${j.nextChapterId}/read`;
    }
  }

  async function exportChapter() {
    setExporting(true);
    const res = await fetch(`/api/chapters/${chapterId}/export/pdf`, { method: "POST" });
    setExporting(false);
    if (!res.ok) {
      setContinueMsg("Export impossible");
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chapter-${chapter?.chapterNumber ?? chapterId}.pdf`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  if (loadError) return <p className="text-red-400">{loadError}</p>;
  if (!chapter)
    return <p className="text-sm text-muted-foreground">Ouverture du livre&hellip;</p>;

  const leftPage = pages[pageIndex];
  const spreadFirstPage = spreadMode ? pages[pageIndex] : undefined;
  const spreadSecondPage = spreadMode ? pages[pageIndex + 1] : undefined;
  const spreadLeftPage = spreadMode ? (mangaRtl ? spreadSecondPage : spreadFirstPage) : undefined;
  const spreadRightPage = spreadMode ? (mangaRtl ? spreadFirstPage : spreadSecondPage) : undefined;

  const renderPage = () => {
    if (!leftPage) return null;

    // READ-FINAL-2 : double-page spread authentique (pleine largeur 2 colonnes)
    const isDoublePage = (leftPage as { isDoublePage?: boolean }).isDoublePage;
    if (isDoublePage && leftPage.id) {
      const compositeUrl = `/api/projects/${projectId}/chapters/${chapterId}/composite-page?sceneId=${leftPage.id}&mode=double`;
      return (
        <div
          className={cn("relative mx-auto transition-opacity duration-200", transitioning ? "opacity-0" : "opacity-100 page-flip-in")}
          style={{ maxWidth: fullscreen ? "100%" : "1440px" }}
          role="button"
          tabIndex={0}
          onClick={() => mangaRtl ? goPrev() : goNext()}
          onKeyDown={(e) => e.key === "Enter" && (mangaRtl ? goPrev() : goNext())}
          aria-label="Double page manga"
        >
          {/* Intentionnel : image composite servie par notre route, on garde <img> (pas d'optimisation Next/Image ici). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={compositeUrl}
            alt={`Double page manga ${pageIndex + 1}`}
            className="w-full object-contain"
          />
          <div className="absolute bottom-3 right-3 z-20 rounded-full border border-black/20 bg-white/85 px-2 py-1 text-[10px] font-medium text-stone-900">
            Pages {pageIndex + 1}–{pageIndex + 2}
          </div>
        </div>
      );
    }

    // READ-2 : splash page pleine page
    const splashImage = leftPage.panels[0]?.imageUrl;
    const isSplash = (leftPage as { isSplashPage?: boolean }).isSplashPage && Boolean(splashImage);

    if (isSplash && splashImage) {
      return (
        <div
          className={cn("transition-opacity duration-200", transitioning ? "opacity-0 splash-reveal" : "opacity-100 splash-reveal")}
          style={{ maxWidth: fullscreen ? "100%" : "720px", margin: "0 auto" }}
        >
          <SplashPageRenderer
            imageUrl={splashImage}
            chapterNumber={chapter?.chapterNumber ?? 0}
            beatTitle={leftPage.title ?? null}
            isOpening={pageIndex === 0}
            onTap={() => mangaRtl ? goPrev() : goNext()}
          />
        </div>
      );
    }

    return (
      <div
        className={cn("relative mx-auto cursor-pointer transition-opacity duration-200", transitioning ? "opacity-0" : "opacity-100 page-flip-in")}
        style={{ maxWidth: fullscreen ? "100%" : spreadMode ? "1040px" : "720px" }}
        role="region"
        aria-roledescription="Lecteur manga"
        aria-label={`Lecture manga${mangaRtl ? " (mode droite→gauche)" : ""}, page ${pageIndex + 1}`}
        aria-live="polite"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && (mangaRtl ? goPrev() : goNext())}
      >
        {/* Livre ouvert — ombre de reliure */}
        <div
          className={cn(
            "overflow-hidden rounded-lg border-2 border-stone-700/50 shadow-2xl shadow-black/50",
            "bg-stone-950",
          )}
        >
          {/* Reliure centrale */}
          <div className="absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-gradient-to-b from-stone-600/60 via-stone-500/40 to-stone-600/60 shadow-[0_0_8px_rgba(0,0,0,0.8)]" />

          <div
            className="relative"
            style={{ height: fullscreen ? "calc(100vh - 120px)" : "min(75vh, 640px)" }}
          >
            {/* Page paper + légère courbure */}
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.10),transparent_40%),radial-gradient(circle_at_bottom,rgba(0,0,0,0.40),transparent_55%)]" />

            {spreadMode ? (
              <div
                className="relative z-10 grid h-full grid-cols-2"
                style={{
                  transform:
                    turn?.dir === "next"
                      ? "perspective(1200px) rotateY(-0.9deg)"
                      : turn?.dir === "prev"
                        ? "perspective(1200px) rotateY(0.9deg)"
                        : undefined,
                  transition: "transform 180ms ease-out",
                }}
                onTransitionEnd={() => setTurn(null)}
              >
                {/* Page gauche */}
                <div
                  className="relative h-full"
                  onClick={mangaRtl ? goNext : goPrev}
                  role="button"
                  tabIndex={0}
                  aria-label={mangaRtl ? "Page suivante (manga, droite→gauche)" : "Page précédente"}
                  onKeyDown={(e) => e.key === "Enter" && (mangaRtl ? goNext() : goPrev())}
                >
                  <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/30 to-transparent" />
                  {spreadLeftPage ? (
                    <div className="absolute bottom-3 left-3 z-20 rounded-full border border-black/20 bg-white/85 px-2 py-1 text-[10px] font-medium text-stone-900">
                      Page {mangaRtl ? pageIndex + 2 : pageIndex + 1}
                    </div>
                  ) : null}
                  {spreadLeftPage ? (
                  showTextOnly ? (
                    <div className="h-full overflow-y-auto p-5">
                      <h3 className="font-serif text-base font-bold text-stone-200">
                        Page {mangaRtl ? pageIndex + 2 : pageIndex + 1}
                      </h3>
                      <div className="mt-3 space-y-3">
                        {spreadLeftPage.panels.map((panel, i) => (
                          <div key={i} className="relative rounded-lg border border-stone-700 bg-stone-900 p-3">
                            {panel.narration ? (
                              <p className="mb-1 text-xs italic text-stone-400">{panel.narration}</p>
                            ) : null}
                            {panel.dialogue ? (
                              <p className="text-xs text-stone-200">
                                {panel.speaker ? (
                                  <span className="font-bold text-violet-400">{panel.speaker}: </span>
                                ) : null}
                                {panel.dialogue}
                              </p>
                            ) : null}
                            {panel.sfx ? (
                              <p className="mt-1 text-center text-xs font-black italic text-red-400">{panel.sfx}</p>
                            ) : null}
                            {panel.dialogue && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const spreadPageIdx = mangaRtl ? pageIndex + 1 : pageIndex;
                                  void playDialogue(panel.dialogue!, panel.speaker, `spread-${spreadPageIdx}-${i}`);
                                }}
                                className="absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/80 hover:text-white transition-colors"
                                aria-label="Écouter"
                              >
                                {playingTtsId === `spread-${mangaRtl ? pageIndex + 1 : pageIndex}-${i}` ? <Pause className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <MangaPageGrid page={spreadLeftPage} readingDirection={mangaRtl ? "rtl" : "ltr"} />
                  )
                  ) : (
                    <div className="flex h-full items-center justify-center bg-stone-950">
                      <span className="text-sm text-muted-foreground">Page vide</span>
                    </div>
                  )}
                </div>

                {/* Page droite */}
                <div
                  className="relative h-full"
                  onClick={mangaRtl ? goPrev : goNext}
                  role="button"
                  tabIndex={0}
                  aria-label={mangaRtl ? "Page précédente (manga, droite→gauche)" : "Page suivante"}
                  onKeyDown={(e) => e.key === "Enter" && (mangaRtl ? goPrev() : goNext())}
                >
                  <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/30 to-transparent" />
                  {spreadRightPage ? (
                    <div className="absolute bottom-3 right-3 z-20 rounded-full border border-black/20 bg-white/85 px-2 py-1 text-[10px] font-medium text-stone-900">
                      Page {mangaRtl ? pageIndex + 1 : pageIndex + 2}
                    </div>
                  ) : null}
                  {spreadRightPage ? (
                    showTextOnly ? (
                      <div className="h-full overflow-y-auto p-5">
                        <h3 className="font-serif text-base font-bold text-stone-200">
                          Page {mangaRtl ? pageIndex + 1 : pageIndex + 2}
                        </h3>
                        <div className="mt-3 space-y-3">
                          {spreadRightPage.panels.map((panel, i) => (
                            <div key={i} className="relative rounded-lg border border-stone-700 bg-stone-900 p-3">
                              {panel.narration ? (
                                <p className="mb-1 text-xs italic text-stone-400">{panel.narration}</p>
                              ) : null}
                              {panel.dialogue ? (
                                <p className="text-xs text-stone-200">
                                  {panel.speaker ? (
                                    <span className="font-bold text-violet-400">{panel.speaker}: </span>
                                  ) : null}
                                  {panel.dialogue}
                                </p>
                              ) : null}
                              {panel.sfx ? (
                                <p className="mt-1 text-center text-xs font-black italic text-red-400">{panel.sfx}</p>
                              ) : null}
                              {panel.dialogue && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const spreadPageIdx = mangaRtl ? pageIndex : pageIndex + 1;
                                    void playDialogue(panel.dialogue!, panel.speaker, `spread-${spreadPageIdx}-${i}`);
                                  }}
                                  className="absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/80 hover:text-white transition-colors"
                                  aria-label="Écouter"
                                >
                                  {playingTtsId === `spread-${mangaRtl ? pageIndex : pageIndex + 1}-${i}` ? <Pause className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <MangaPageGrid page={spreadRightPage} readingDirection={mangaRtl ? "rtl" : "ltr"} />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center bg-stone-950">
                      <span className="text-sm text-muted-foreground">Page vide</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                className="relative z-10 h-full"
                onClick={mangaRtl ? goPrev : goNext}
                role="button"
                tabIndex={0}
                aria-label="Page suivante"
                onKeyDown={(e) => e.key === "Enter" && (mangaRtl ? goPrev() : goNext())}
              >
                <div className="absolute bottom-3 right-3 z-20 rounded-full border border-black/20 bg-white/85 px-2 py-1 text-[10px] font-medium text-stone-900">
                  Page {pageIndex + 1}
                </div>
                {showTextOnly ? (
                  <div className="flex h-full flex-col gap-3 overflow-y-auto p-6">
                    <h3 className="font-serif text-lg font-bold text-stone-200">
                      Page {pageIndex + 1}
                    </h3>
                    {leftPage.panels.map((panel, i) => (
                      <div key={i} className="rounded-lg border border-stone-700 bg-stone-900 p-4">
                        {panel.narration && (
                          <p className="mb-2 text-sm italic text-stone-400">{panel.narration}</p>
                        )}
                        {panel.dialogue && (
                          <div className="flex items-start gap-1.5">
                            <p className="flex-1 text-sm text-stone-200">
                              {panel.speaker && (
                                <span className="font-bold text-violet-400">{panel.speaker}: </span>
                              )}
                              {panel.dialogue}
                            </p>
                            <button
                              type="button"
                              className={cn(
                                "mt-0.5 shrink-0 rounded p-0.5 transition-colors",
                                playingTtsId === `panel-${pageIndex}-${i}` ? "text-violet-400" : "text-stone-400 hover:text-white",
                              )}
                              onClick={(e) => { e.stopPropagation(); void playDialogue(panel.dialogue!, panel.speaker, `panel-${pageIndex}-${i}`); }}
                              aria-label="Écouter ce dialogue"
                            >
                              <Volume2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                        {panel.sfx && (
                          <p className="mt-1 text-center font-black italic text-red-400">
                            {panel.sfx}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  // URGENCE 6 → READ-FINAL-1 : hiérarchie de rendu
                  // 1. Image composite (Sharp, panels assemblés + bulles + SFX) si sceneId disponible
                  // 2. MangaCanvasRenderer (canvas client) si panels complétés
                  // 3. MangaPageGrid (CSS grid fallback)
                  leftPage.id && leftPage.panels.some((p) => p.imageUrl && p.status === "completed")
                    ? <div className="relative h-full w-full">
                        {/* Intentionnel : image composite servie par notre route, on garde <img> (pas d'optimisation Next/Image ici). */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/projects/${projectId}/chapters/${chapterId}/composite-page?sceneId=${leftPage.id}`}
                          alt={`Page manga ${pageIndex + 1}`}
                          className="h-full w-full object-contain"
                          loading="eager"
                          onError={(e) => {
                            // Fallback : masquer l'img, le MangaCanvasRenderer prend le relais
                            (e.target as HTMLImageElement).style.display = "none";
                            const fallback = (e.target as HTMLImageElement).nextElementSibling;
                            if (fallback) (fallback as HTMLElement).style.display = "block";
                          }}
                        />
                        <div style={{ display: "none" }} className="h-full">
                          <MangaCanvasRenderer
                            panels={computeCanvasPanelsFromReaderPage(leftPage, 800, 1130)}
                            pageWidth={800}
                            pageHeight={1130}
                            darkMode={false}
                            className="rounded-sm"
                          />
                        </div>
                      </div>
                    : <MangaPageGrid page={leftPage} readingDirection={mangaRtl ? "rtl" : "ltr"} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderWebtoon = () => (
    <WebtoonLazyScroll
      pages={pages.map((page, pageIdx) => ({
        id: page.id ?? `page-${pageIdx}`,
        panels: page.panels.map((panel, panelIdx) => ({
          id: panel.id ?? `${pageIdx}-${panelIdx}`,
          imageUrl: panel.imageUrl,
          status: panel.status,
          provider: panel.provider,
          model: panel.model,
          error: panel.error,
          sceneImageId: panel.id,
          dialogue: panel.dialogue ? { speaker: panel.speaker ?? "", text: panel.dialogue } : undefined,
          dialogues: panel.dialogues,
          speaker: panel.speaker,
          narration: panel.narration,
          sfx: panel.sfx,
          caption: panel.caption,
          textScale: panel.textScale,
          renderMeta: panel.renderMeta,
          layoutMeta: panel.layoutMeta,
          mood: panel.mood,
          pageIndex: pageIdx,
        })),
      }))}
      onRetryPanel={retryPanel}
      retryingPanel={retryingPanel}
      showDebug={inspectOpen}
      panelQaByPanelId={panelQaByPanelId}
    />
  );

  // READ-PREMIUM : badge compteur (rouge si sous la cible)
  // COMMIT E — cible maintenant paramétrée via prop targetImages (défaut =
  // PREMIUM_PANEL_RANGE.target). Fini le "/75" hardcodé.
  const completedCount = imageStats?.completed ?? webtoonPanels.filter((p) => p.imageUrl).length;
  const isUnderTarget = completedCount < targetImages;

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <BookOpen className="h-4 w-4 text-accent" />
        <span>
          {readerMode === "webtoon"
            ? `${webtoonPanels.length} cases · ${totalPages} pages`
            : spreadMode
              ? `Pages ${pageIndex + 1}-${Math.min(totalPages, pageIndex + 2)}`
              : `Page ${pageIndex + 1}`} / {totalPages}
          {showEnd ? " · fin" : ""}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            isUnderTarget
              ? "border-red-500/50 bg-red-950/30 text-red-300"
              : "border-emerald-500/50 bg-emerald-950/30 text-emerald-300",
          )}
          title={isUnderTarget ? `Cible premium : ${targetImages} cases` : "Chapitre au standard premium"}
        >
          <ImageIcon className="h-3 w-3" />
          {completedCount}/{targetImages}
        </span>
        <span className="hidden rounded-full border border-border/60 px-2 py-0.5 text-[11px] lg:inline-flex">
          {readerMode === "webtoon" ? "Lecture webtoon verticale" : mangaRtl ? "Lecture droite → gauche" : "Lecture gauche → droite"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={readerMode === "webtoon" ? "default" : "outline"} size="sm" onClick={() => setReaderMode((v) => v === "webtoon" ? "manga" : "webtoon")}>
          {readerMode === "webtoon" ? "Webtoon" : "Manga"}
        </Button>
        <Button type="button" variant={mangaRtl ? "default" : "outline"} size="sm" onClick={() => setMangaRtl((v) => !v)} className="gap-1">
          <Repeat2 className="h-4 w-4" />
          {mangaRtl ? "Manga RTL" : "LTR"}
        </Button>
        {readerMode === "manga" ? (
        <Button
          type="button"
          variant={spreadMode ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setSpreadMode((v) => {
              const next = !v;
              if (!v) {
                // passage en spread → forcer index pair
                setPageIndex((i) => Math.floor(i / 2) * 2);
              }
              return next;
            });
          }}
          className="gap-1"
        >
          <Columns2 className="h-4 w-4" />
          {spreadMode ? "Double" : "Simple"}
        </Button>
        ) : null}
        <Button
          type="button"
          variant={showTextOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setShowTextOnly((v) => !v)}
          className="gap-1"
        >
          {showTextOnly ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
          {showTextOnly ? "Texte" : "Cases"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const currentPage = pages[pageIndex];
            if (!currentPage) return;
            const allText = currentPage.panels
              .map((p) =>
                [p.narration, p.dialogue ? `${p.speaker ?? ""}: ${p.dialogue}` : null, p.sfx]
                  .filter(Boolean)
                  .join(". "),
              )
              .join(". ");
            if (allText) void playDialogue(allText, null, `page-${pageIndex}`);
          }}
          disabled={playingTtsId !== null && !playingTtsId.startsWith("page-")}
          className="gap-1"
        >
          <Volume2 className="h-4 w-4" />
          {playingTtsId?.startsWith("page-") ? "Lecture…" : "Écouter"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exportChapter}
          disabled={exporting}
        >
          {exporting ? "Export…" : "Exporter PDF"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="gap-1">
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setInspectOpen(true)}
          className="gap-1"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Inspecter
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setFullscreen((v) => !v)}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        {fullscreen && exitHref ? (
          <Link
            href={exitHref}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" />
            Fermer
          </Link>
        ) : null}
        {readerMode === "manga" ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={mangaRtl ? goNext : goPrev}
          disabled={pageIndex === 0 && !showEnd}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        ) : null}
        {readerMode === "manga" ? (
        <Button type="button" size="sm" onClick={mangaRtl ? goPrev : goNext} disabled={showEnd}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        ) : null}
      </div>
    </div>
  );

  const endCard = showEnd ? (
    <Card className="border-accent/30 bg-gradient-to-br from-card/90 to-violet-950/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Sparkles className="h-5 w-5 text-accent" />
          Fin du chapitre &mdash; quelle suite ?
        </CardTitle>
        <CardDescription>Instruction libre, suggestions ou tags rapides.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Ton idée</Label>
          <Textarea
            rows={4}
            placeholder="Ex. : Le mentor révèle qu'il connaissait le père du héros…"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Suggestions</p>
          <div className="flex flex-wrap gap-2">
            {READER_SUGGESTIONS.map((s) => (
              <Button
                key={s.label}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIntent(s.intent)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Tags rapides</p>
          <div className="flex flex-wrap gap-2">
            {READER_QUICK_TAGS.map((tag) => (
              <Button
                key={tag}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void submitContinue(tag)}
                disabled={continuing}
              >
                {tag}
              </Button>
            ))}
          </div>
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={continuing || !intent.trim()}
          onClick={() => void submitContinue()}
        >
          {continuing ? "Création…" : "Valider et ouvrir la suite"}
        </Button>
        {continueMsg ? <p className="text-sm text-muted-foreground">{continueMsg}</p> : null}
      </CardContent>
    </Card>
  ) : null;

  // READ-PREMIUM : slide-panel "Inspecter" regroupant mémoire/canon/debug
  const inspectPanel = (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-[70] transition-opacity duration-200",
        inspectOpen ? "opacity-100" : "opacity-0",
      )}
      aria-hidden={!inspectOpen}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200",
          inspectOpen ? "pointer-events-auto opacity-100" : "opacity-0",
        )}
        onClick={() => setInspectOpen(false)}
      />
      <aside
        className={cn(
          "absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-border/60 bg-card shadow-2xl transition-transform duration-300 ease-out",
          inspectOpen ? "pointer-events-auto translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-label="Inspecter le chapitre"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Inspecter le chapitre</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setInspectOpen(false)}
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          <Card className="border-border/60 bg-card/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Mémoire & statut</CardTitle>
              <CardDescription className="text-xs">Ce qui nourrit les chapitres suivants.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <p>{memorySummary ?? "Aucun résumé mémoire disponible pour l'instant."}</p>
              {degradedReaderWarning ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-amber-200">
                  {degradedReaderWarning}
                </div>
              ) : null}
              {imageStats ? (
                <div className="flex flex-wrap gap-2">
                  <span>{imageStats.completed}/{imageStats.total} images prêtes</span>
                  {imageStats.pending ? <span>· {imageStats.pending} en attente</span> : null}
                  {imageStats.failed ? <span>· {imageStats.failed} en échec</span> : null}
                </div>
              ) : null}
              <p>Job actif : {activeJob ? activeJob.status : "aucun"}</p>
              {generationDiagnostics?.creativityControls ? (
                <p>
                  Contrôles : N {generationDiagnostics.creativityControls.noveltyLevel ?? "?"}
                  {" · "}W {generationDiagnostics.creativityControls.worldStrictness ?? "?"}
                  {" · "}X {generationDiagnostics.creativityControls.visualExoticism ?? "?"}
                  {" · "}PNJ {generationDiagnostics.creativityControls.npcVariety ?? "?"}
                  {" · "}Env {generationDiagnostics.creativityControls.environmentRichness ?? "?"}
                </p>
              ) : null}
              {generationDiagnostics?.qualityReport ? (
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 px-3 py-2 text-cyan-100">
                  Release {(Number(generationDiagnostics.qualityReport.averageReleaseScore ?? 0) * 100).toFixed(0)}/100
                  {" · "}Seuil {(Number(generationDiagnostics.qualityReport.releaseThreshold ?? 0) * 100).toFixed(0)}/100
                  {" · "}{generationDiagnostics.qualityReport.premiumReleaseAccepted ? "Premium OK" : "Release dégradée"}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {generationDiagnostics?.panelDebug && generationDiagnostics.panelDebug.length > 0 ? (
            <Card className="border-border/60 bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Debug rendu</CardTitle>
                <CardDescription className="text-xs">
                  Diagnostic de tous les panels ({generationDiagnostics.panelDebug.length}).
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-96 space-y-2 overflow-y-auto">
                {generationDiagnostics.panelDebug.map((panel) => (
                  <div key={panel.panelId} className="rounded border border-stone-800/80 bg-black/20 p-2 text-[11px]">
                    <p className="font-medium text-stone-100">
                      Panel {panel.panelNumber} · {panel.status ?? "?"} · {panel.provider ?? "?"}
                    </p>
                    <p className="text-muted-foreground">
                      R {(panel.releaseScore ?? 0).toFixed(2)} · F {(panel.backgroundPresenceScore ?? 0).toFixed(2)} · I {(panel.interactionScore ?? 0).toFixed(2)} · S {(panel.styleConsistencyScore ?? 0).toFixed(2)} · V {panel.visionEnabled ? (panel.visionScore ?? 0).toFixed(2) : "off"} · rerolls {panel.rerollCount}
                    </p>
                    {panel.promptDebug?.promptWarnings?.length ? (
                      <p className="text-[10px] text-amber-500">
                        warnings : {panel.promptDebug.promptWarnings.join(", ")}
                      </p>
                    ) : null}
                    {panel.issues.length > 0 ? (
                      <p className="mt-1 text-[10px] text-amber-300/80">
                        {panel.issues.slice(0, 2).map((issue) => issue.message ?? issue.type ?? "issue").join(" | ")}
                      </p>
                    ) : null}
                    {panel.visionEnabled && panel.visionFindings.length > 0 ? (
                      <p className="mt-1 text-[10px] text-cyan-300/80">
                        Vision : {panel.visionFindings.slice(0, 2).join(" | ")}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px]"
                        disabled={retryingPanel !== null}
                        onClick={() => void retryPanel(panel.panelId, "environment")}
                      >
                        {retryingPanel === `${panel.panelId}:environment` ? "…" : "Décor"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px]"
                        disabled={retryingPanel !== null}
                        onClick={() => void retryPanel(panel.panelId, "character")}
                      >
                        {retryingPanel === `${panel.panelId}:character` ? "…" : "Personnage"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px]"
                        disabled={retryingPanel !== null}
                        onClick={() => void retryPanel(panel.panelId, "composition")}
                      >
                        {retryingPanel === `${panel.panelId}:composition` ? "…" : "Composition"}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {canonState?.hasCanonState ? (
            <Card className="border-violet-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">État canonique</CardTitle>
                <CardDescription className="text-xs">Monde et personnages à la fin du chapitre.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {canonState.worldState ? (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold text-violet-400">Monde</h4>
                    {canonState.worldState.activeLocations.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Lieux : {canonState.worldState.activeLocations.join(", ")}
                      </p>
                    ) : null}
                    {canonState.worldState.activeThreats.length > 0 ? (
                      <p className="text-xs text-orange-400/80">
                        Menaces : {canonState.worldState.activeThreats.join(", ")}
                      </p>
                    ) : null}
                    {canonState.worldState.activeMysteries.length > 0 ? (
                      <p className="text-xs text-purple-400/80">
                        Mystères : {canonState.worldState.activeMysteries.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {canonState.characterStates && canonState.characterStates.length > 0 ? (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold text-violet-400">Personnages</h4>
                    <div className="space-y-2">
                      {canonState.characterStates.slice(0, 5).map((cs, idx) => (
                        <div key={idx} className="rounded border border-stone-800 bg-stone-950/30 p-2">
                          <p className="text-xs font-medium">{cs.characterName}</p>
                          {cs.currentState.location ? (
                            <p className="text-[10px] text-muted-foreground">Lieu : {cs.currentState.location}</p>
                          ) : null}
                          {cs.currentState.emotion ? (
                            <p className="text-[10px] text-blue-400/80">État : {cs.currentState.emotion}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {canonState.continuityWarnings && canonState.continuityWarnings.length > 0 ? (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold text-red-400">Alertes cohérence</h4>
                    <ul className="list-inside list-disc space-y-1 text-[10px] text-red-300/80">
                      {canonState.continuityWarnings.slice(0, 10).map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {canonState?.hasCanonState && canonState.openThreads && canonState.openThreads.length > 0 ? (
            <Card className="border-amber-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Fils narratifs ouverts</CardTitle>
                <CardDescription className="text-xs">Intrigues à résoudre.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {canonState.openThreads.slice(0, 8).map((thread, idx) => (
                  <div key={idx} className="rounded border border-amber-800/50 bg-amber-950/20 p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">{thread.label}</p>
                      <span
                        className={cn(
                          "text-[9px] font-bold uppercase",
                          thread.priority === "high"
                            ? "text-red-400"
                            : thread.priority === "medium"
                              ? "text-amber-400"
                              : "text-muted-foreground",
                        )}
                      >
                        {thread.priority}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{thread.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </aside>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-[#0a0a0f] p-3">
        {toolbar}
        {/* PHASE 5: En mode webtoon, autoriser le scroll vertical (overflow-y-auto)
            En mode manga, garder overflow-hidden pour la pagination */}
        <div className={cn(
          "relative flex-1",
          readerMode === "webtoon" ? "overflow-y-auto" : "overflow-hidden"
        )}>
          {!showEnd ? (readerMode === "webtoon" ? renderWebtoon() : renderPage()) : null}

          {/* UX-5 : Dots de progression manga */}
          {readerMode === "manga" && totalPages > 1 && !showEnd && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-20 pointer-events-none">
              {Array.from({ length: Math.ceil(totalPages / (spreadMode ? 2 : 1)) }).map((_, i) => {
                const idx = i * (spreadMode ? 2 : 1);
                const isActive = idx === pageIndex;
                const isPast = idx < pageIndex;
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-full transition-all duration-300",
                      isActive ? "w-5 h-1.5 bg-white" :
                      isPast ? "w-1.5 h-1.5 bg-white/50" : "w-1.5 h-1.5 bg-white/20"
                    )}
                  />
                );
              })}
            </div>
          )}

          {/* UX-5 : Swipe hint au premier chargement */}
          {showSwipeHint && readerMode === "manga" && (
            <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
              <div className="rounded-2xl bg-black/70 px-6 py-4 text-center text-sm text-white/80 backdrop-blur-sm animate-in fade-in duration-300">
                ← Swipe ou touche les côtés pour naviguer →
              </div>
            </div>
          )}
        </div>
        {endCard}
        {inspectPanel}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toolbar}
      {!showEnd ? (readerMode === "webtoon" ? renderWebtoon() : renderPage()) : null}
      {endCard}
      {inspectPanel}
    </div>
  );
}
