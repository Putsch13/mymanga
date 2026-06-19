"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@manga-ai-studio/ui";
import { PREMIUM_PANEL_RANGE } from "@manga-ai-studio/core";
import { buildPagesFromChapter, flattenPagesToPanels } from "./reader/build-reader-pages";
import { READER_QUICK_TAGS, READER_SUGGESTIONS } from "./reader/reader-constants";
import { computeReaderDegradedWarning } from "./reader/compute-degraded-warning";
import { useReaderTts } from "./reader/use-reader-tts";
import { useReaderNavigation } from "./reader/use-reader-navigation";
import { useReaderData } from "./reader/use-reader-data";
import { useReaderPreferences } from "./reader/use-reader-preferences";
import { useChapterNav } from "./reader/use-chapter-nav";
import { useReaderActions } from "./reader/use-reader-actions";
import { PanelLightbox } from "./reader/panel-lightbox";
import { ReaderInspectDrawer } from "./reader/reader-inspect-drawer";
import { ReaderPageRenderer } from "./reader/reader-page-renderer";
import { ReaderToolbar } from "./reader/reader-toolbar";
import { ReaderEndCard } from "./reader/reader-end-card";
import { ReaderWebtoonView } from "./reader/reader-webtoon-view";

// Garde les exports utilitaires utilisés par d'autres consommateurs.
export { READER_QUICK_TAGS, READER_SUGGESTIONS };

type Props = {
  projectId: string;
  chapterId: string;
  /** READ-PREMIUM : démarre directement en mode fullscreen immersif. */
  autoFullscreen?: boolean;
  /** READ-PREMIUM : URL de sortie (bouton "Fermer" en fullscreen). */
  exitHref?: string;
  /**
   * READ-PREMIUM : cible d'images pour le badge compteur.
   * Défaut : `PREMIUM_PANEL_RANGE.target` (cible produit unique).
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
  const [pageIndex, setPageIndex] = useState(0);
  const [showTextOnly, setShowTextOnly] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [fullscreen, setFullscreen] = useState(autoFullscreen);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [turn, setTurn] = useState<null | { dir: "next" | "prev"; at: number }>(null);
  const [intent, setIntent] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  // SPRINT 4 — lightbox panel zoom : la valeur est l'URL (proxifiée) à
  // afficher en pleine page. Le `caption` permet de sous-titrer (ex. dialogue).
  const [lightbox, setLightbox] = useState<{ url: string; caption?: string | null } | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<"manga" | "webtoon">("manga");

  const chapterNav = useChapterNav(projectId, chapterId);
  const { playingTtsId, playDialogue } = useReaderTts();

  const {
    readerMode,
    setReaderMode,
    mangaRtl,
    setMangaRtl,
    spreadMode,
    setSpreadMode,
  } = useReaderPreferences({
    projectId,
    defaultMode: detectedFormat,
  });

  const handleChapterLoaded = useCallback(({ preserveIndex }: { preserveIndex: boolean }) => {
    if (!preserveIndex) {
      setPageIndex(0);
      setShowEnd(false);
    }
  }, []);
  const handleProjectFormatDetected = useCallback((format: "manga" | "webtoon") => {
    setDetectedFormat(format);
  }, []);

  const {
    chapter,
    memorySummary,
    imageStats,
    activeJob,
    generationDiagnostics,
    canonState,
    loadError,
    retryingPanel,
    load,
    retryPanel,
  } = useReaderData({
    projectId,
    chapterId,
    onChapterLoaded: handleChapterLoaded,
    onProjectFormatDetected: handleProjectFormatDetected,
  });

  const {
    continuing,
    continueMsg,
    setContinueMsg,
    exporting,
    submitContinue,
    exportChapter,
  } = useReaderActions({
    projectId,
    chapterId,
    chapterNumber: chapter?.chapterNumber ?? null,
    intent,
  });

  const degradedReaderWarning = computeReaderDegradedWarning(generationDiagnostics);

  // SPRINT 4 — double page uniquement sur écrans larges (>= 820px : couvre
  // les tablettes en paysage type Galaxy Tab / Surface).
  useEffect(() => {
    if (readerMode !== "manga") return;
    const update = () => {
      const wide = window.innerWidth >= 820;
      if (!wide) setSpreadMode(false);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [readerMode, setSpreadMode]);

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

  // Bouton "Écouter" dans la toolbar : lit toute la page courante d'un coup.
  const onTtsPage = useCallback(() => {
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
  }, [pageIndex, pages, playDialogue]);

  // Export PDF : un échec doit afficher un message à l'utilisateur.
  const handleExport = useCallback(async () => {
    const ok = await exportChapter();
    if (!ok) setContinueMsg("Export impossible");
  }, [exportChapter, setContinueMsg]);

  if (loadError) return <p className="text-red-400">{loadError}</p>;
  if (!chapter)
    return <p className="text-sm text-muted-foreground">Ouverture du livre&hellip;</p>;

  const completedCount = imageStats?.completed ?? webtoonPanels.filter((p) => p.imageUrl).length;

  const toolbar = (
    <ReaderToolbar
      projectId={projectId}
      chapterNumber={chapter.chapterNumber ?? null}
      chapterNav={chapterNav}
      readerMode={readerMode}
      setReaderMode={setReaderMode}
      mangaRtl={mangaRtl}
      setMangaRtl={setMangaRtl}
      spreadMode={spreadMode}
      setSpreadMode={setSpreadMode}
      showTextOnly={showTextOnly}
      setShowTextOnly={setShowTextOnly}
      pageIndex={pageIndex}
      setPageIndex={setPageIndex}
      totalPages={totalPages}
      webtoonPanelsCount={webtoonPanels.length}
      showEnd={showEnd}
      completedCount={completedCount}
      targetImages={targetImages}
      fullscreen={fullscreen}
      setFullscreen={setFullscreen}
      exitHref={exitHref}
      exporting={exporting}
      exportChapter={handleExport}
      reload={load}
      setInspectOpen={setInspectOpen}
      goNext={goNext}
      goPrev={goPrev}
      playingTtsId={playingTtsId}
      onTtsPage={onTtsPage}
    />
  );

  const renderMain = () => {
    if (showEnd) return null;
    if (readerMode === "webtoon") {
      return (
        <ReaderWebtoonView
          pages={pages}
          onRetryPanel={retryPanel}
          retryingPanel={retryingPanel}
          showDebug={inspectOpen}
          panelQaByPanelId={panelQaByPanelId}
        />
      );
    }
    return (
      <ReaderPageRenderer
        projectId={projectId}
        chapterId={chapterId}
        chapterNumber={chapter.chapterNumber ?? 0}
        pages={pages}
        pageIndex={pageIndex}
        fullscreen={fullscreen}
        spreadMode={spreadMode}
        mangaRtl={mangaRtl}
        showTextOnly={showTextOnly}
        transitioning={transitioning}
        turn={turn}
        onTurnEnd={() => setTurn(null)}
        goNext={goNext}
        goPrev={goPrev}
        playingTtsId={playingTtsId}
        playDialogue={playDialogue}
      />
    );
  };

  const endCard = showEnd ? (
    <ReaderEndCard
      intent={intent}
      setIntent={setIntent}
      continuing={continuing}
      continueMsg={continueMsg}
      submitContinue={submitContinue}
    />
  ) : null;

  const inspectPanel = (
    <ReaderInspectDrawer
      open={inspectOpen}
      onClose={() => setInspectOpen(false)}
      memorySummary={memorySummary}
      degradedReaderWarning={degradedReaderWarning}
      imageStats={imageStats}
      activeJob={activeJob}
      generationDiagnostics={generationDiagnostics}
      canonState={canonState}
      retryingPanel={retryingPanel}
      onRetryPanel={(panelId, mode) => void retryPanel(panelId, mode)}
    />
  );

  // SPRINT 4 — délégation : on capte les clics <img> descendants pour ouvrir
  // le lightbox sans avoir à propager `onPanelClick` partout. Les éléments
  // marqués `data-no-zoom="true"` sont exclus.
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== "IMG") return;
    const img = target as HTMLImageElement;
    if (img.dataset.noZoom === "true") return;
    if (img.closest("[data-no-zoom='true']")) return;
    if (!img.src) return;
    e.preventDefault();
    e.stopPropagation();
    setLightbox({ url: img.src, caption: img.alt || null });
  };

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-[#0a0a0f] p-3" onClick={onClickCapture}>
        {toolbar}
        <div
          className={cn(
            "relative flex-1",
            readerMode === "webtoon" ? "overflow-y-auto" : "overflow-hidden",
          )}
        >
          {renderMain()}

          {/* UX-5 : Dots de progression manga */}
          {readerMode === "manga" && totalPages > 1 && !showEnd && (
            <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-20 flex justify-center gap-1.5">
              {Array.from({ length: Math.ceil(totalPages / (spreadMode ? 2 : 1)) }).map((_, i) => {
                const idx = i * (spreadMode ? 2 : 1);
                const isActive = idx === pageIndex;
                const isPast = idx < pageIndex;
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-full transition-all duration-300",
                      isActive
                        ? "h-1.5 w-5 bg-white"
                        : isPast
                          ? "h-1.5 w-1.5 bg-white/50"
                          : "h-1.5 w-1.5 bg-white/20",
                    )}
                  />
                );
              })}
            </div>
          )}

          {showSwipeHint && readerMode === "manga" && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
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
    <div className="space-y-6" onClick={onClickCapture}>
      {toolbar}
      {renderMain()}
      {endCard}
      {inspectPanel}
      <PanelLightbox
        imageUrl={lightbox?.url ?? null}
        caption={lightbox?.caption ?? null}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
