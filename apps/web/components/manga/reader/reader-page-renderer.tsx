/**
 * P5.2 — Rendu d'une page (ou d'un spread) en mode manga.
 *
 * Hiérarchie de rendu :
 * 1. Double-page composite (sceneId + mode=double) → image pleine largeur.
 * 2. Splash page (premier panel + flag `isSplashPage`) → SplashPageRenderer.
 * 3. Spread (livre ouvert deux pages) — chaque côté = composite OR grille.
 * 4. Page simple — composite si dispo, sinon `MangaPageGrid` ou canvas.
 */
"use client";

import { cn } from "@manga-ai-studio/ui";
import { MangaPageGrid, type UniversalMangaPage } from "../manga-page-grid";
import { MangaCanvasRenderer } from "../manga-canvas-renderer";
import { SplashPageRenderer } from "../splash-page-renderer";
import { computeCanvasPanelsFromReaderPage } from "./page-template-registry";
import { ReaderTextPanelList } from "./reader-text-panel-list";

export interface ReaderPageRendererProps {
  projectId: string;
  chapterId: string;
  chapterNumber: number;
  pages: UniversalMangaPage[];
  pageIndex: number;
  fullscreen: boolean;
  spreadMode: boolean;
  mangaRtl: boolean;
  showTextOnly: boolean;
  transitioning: boolean;
  turn: { dir: "next" | "prev"; at: number } | null;
  onTurnEnd: () => void;
  goNext: () => void;
  goPrev: () => void;
  playingTtsId: string | null;
  playDialogue: (text: string, speaker?: string | null, id?: string) => Promise<void> | void;
}

export function ReaderPageRenderer(props: ReaderPageRendererProps) {
  const {
    projectId,
    chapterId,
    chapterNumber,
    pages,
    pageIndex,
    fullscreen,
    spreadMode,
    mangaRtl,
    showTextOnly,
    transitioning,
    turn,
    onTurnEnd,
    goNext,
    goPrev,
    playingTtsId,
    playDialogue,
  } = props;

  const leftPage = pages[pageIndex];
  if (!leftPage) return null;

  const isDoublePage = (leftPage as { isDoublePage?: boolean }).isDoublePage;
  if (isDoublePage && leftPage.id) {
    const compositeUrl = `/api/projects/${projectId}/chapters/${chapterId}/composite-page?sceneId=${leftPage.id}&mode=double`;
    return (
      <div
        className={cn(
          "relative mx-auto transition-opacity duration-200",
          transitioning ? "opacity-0" : "opacity-100 page-flip-in",
        )}
        style={{ maxWidth: fullscreen ? "100%" : "1440px" }}
        role="button"
        tabIndex={0}
        onClick={() => (mangaRtl ? goPrev() : goNext())}
        onKeyDown={(e) => e.key === "Enter" && (mangaRtl ? goPrev() : goNext())}
        aria-label="Double page manga"
      >
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

  const splashImage = leftPage.panels[0]?.imageUrl;
  const isSplash = (leftPage as { isSplashPage?: boolean }).isSplashPage && Boolean(splashImage);
  if (isSplash && splashImage) {
    return (
      <div
        className={cn(
          "transition-opacity duration-200",
          transitioning ? "opacity-0 splash-reveal" : "opacity-100 splash-reveal",
        )}
        style={{ maxWidth: fullscreen ? "100%" : "720px", margin: "0 auto" }}
      >
        <SplashPageRenderer
          imageUrl={splashImage}
          chapterNumber={chapterNumber}
          beatTitle={leftPage.title ?? null}
          isOpening={pageIndex === 0}
          onTap={() => (mangaRtl ? goPrev() : goNext())}
        />
      </div>
    );
  }

  const spreadFirstPage = spreadMode ? pages[pageIndex] : undefined;
  const spreadSecondPage = spreadMode ? pages[pageIndex + 1] : undefined;
  const spreadLeftPage = spreadMode ? (mangaRtl ? spreadSecondPage : spreadFirstPage) : undefined;
  const spreadRightPage = spreadMode ? (mangaRtl ? spreadFirstPage : spreadSecondPage) : undefined;

  return (
    <div
      className={cn(
        "relative mx-auto cursor-pointer transition-opacity duration-200",
        transitioning ? "opacity-0" : "opacity-100 page-flip-in",
      )}
      style={{ maxWidth: fullscreen ? "100%" : spreadMode ? "1040px" : "720px" }}
      role="region"
      aria-roledescription="Lecteur manga"
      aria-label={`Lecture manga${mangaRtl ? " (mode droite→gauche)" : ""}, page ${pageIndex + 1}`}
      aria-live="polite"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && (mangaRtl ? goPrev() : goNext())}
    >
      <div className={cn("overflow-hidden rounded-lg border-2 border-stone-700/50 shadow-2xl shadow-black/50", "bg-stone-950")}>
        <div className="absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-gradient-to-b from-stone-600/60 via-stone-500/40 to-stone-600/60 shadow-[0_0_8px_rgba(0,0,0,0.8)]" />

        <div
          className="relative"
          style={{ height: fullscreen ? "calc(100vh - 120px)" : "min(75vh, 640px)" }}
        >
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.10),transparent_40%),radial-gradient(circle_at_bottom,rgba(0,0,0,0.40),transparent_55%)]" />

          {spreadMode ? (
            <SpreadLayout
              spreadLeftPage={spreadLeftPage}
              spreadRightPage={spreadRightPage}
              pageIndex={pageIndex}
              mangaRtl={mangaRtl}
              showTextOnly={showTextOnly}
              turn={turn}
              onTurnEnd={onTurnEnd}
              goNext={goNext}
              goPrev={goPrev}
              playingTtsId={playingTtsId}
              playDialogue={playDialogue}
            />
          ) : (
            <SinglePageLayout
              leftPage={leftPage}
              pageIndex={pageIndex}
              mangaRtl={mangaRtl}
              showTextOnly={showTextOnly}
              projectId={projectId}
              chapterId={chapterId}
              goNext={goNext}
              goPrev={goPrev}
              playingTtsId={playingTtsId}
              playDialogue={playDialogue}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface SpreadLayoutProps {
  spreadLeftPage: UniversalMangaPage | undefined;
  spreadRightPage: UniversalMangaPage | undefined;
  pageIndex: number;
  mangaRtl: boolean;
  showTextOnly: boolean;
  turn: { dir: "next" | "prev"; at: number } | null;
  onTurnEnd: () => void;
  goNext: () => void;
  goPrev: () => void;
  playingTtsId: string | null;
  playDialogue: (text: string, speaker?: string | null, id?: string) => Promise<void> | void;
}

function SpreadLayout(props: SpreadLayoutProps) {
  const {
    spreadLeftPage,
    spreadRightPage,
    pageIndex,
    mangaRtl,
    showTextOnly,
    turn,
    onTurnEnd,
    goNext,
    goPrev,
    playingTtsId,
    playDialogue,
  } = props;

  const leftPageNumber = mangaRtl ? pageIndex + 2 : pageIndex + 1;
  const rightPageNumber = mangaRtl ? pageIndex + 1 : pageIndex + 2;
  const leftTtsPrefix = `spread-${mangaRtl ? pageIndex + 1 : pageIndex}`;
  const rightTtsPrefix = `spread-${mangaRtl ? pageIndex : pageIndex + 1}`;

  return (
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
      onTransitionEnd={onTurnEnd}
    >
      <SpreadSide
        page={spreadLeftPage}
        pageNumber={leftPageNumber}
        side="left"
        mangaRtl={mangaRtl}
        showTextOnly={showTextOnly}
        ttsPrefix={leftTtsPrefix}
        onClickNav={mangaRtl ? goNext : goPrev}
        navAriaLabel={mangaRtl ? "Page suivante (manga, droite→gauche)" : "Page précédente"}
        playingTtsId={playingTtsId}
        playDialogue={playDialogue}
      />
      <SpreadSide
        page={spreadRightPage}
        pageNumber={rightPageNumber}
        side="right"
        mangaRtl={mangaRtl}
        showTextOnly={showTextOnly}
        ttsPrefix={rightTtsPrefix}
        onClickNav={mangaRtl ? goPrev : goNext}
        navAriaLabel={mangaRtl ? "Page précédente (manga, droite→gauche)" : "Page suivante"}
        playingTtsId={playingTtsId}
        playDialogue={playDialogue}
      />
    </div>
  );
}

interface SpreadSideProps {
  page: UniversalMangaPage | undefined;
  pageNumber: number;
  side: "left" | "right";
  mangaRtl: boolean;
  showTextOnly: boolean;
  ttsPrefix: string;
  onClickNav: () => void;
  navAriaLabel: string;
  playingTtsId: string | null;
  playDialogue: (text: string, speaker?: string | null, id?: string) => Promise<void> | void;
}

function SpreadSide(props: SpreadSideProps) {
  const {
    page,
    pageNumber,
    side,
    mangaRtl,
    showTextOnly,
    ttsPrefix,
    onClickNav,
    navAriaLabel,
    playingTtsId,
    playDialogue,
  } = props;

  return (
    <div
      className="relative h-full"
      onClick={onClickNav}
      role="button"
      tabIndex={0}
      aria-label={navAriaLabel}
      onKeyDown={(e) => e.key === "Enter" && onClickNav()}
    >
      <div
        className={cn(
          "absolute inset-y-0 w-8",
          side === "left"
            ? "right-0 bg-gradient-to-l from-black/30 to-transparent"
            : "left-0 bg-gradient-to-r from-black/30 to-transparent",
        )}
      />
      {page ? (
        <div
          className={cn(
            "absolute bottom-3 z-20 rounded-full border border-black/20 bg-white/85 px-2 py-1 text-[10px] font-medium text-stone-900",
            side === "left" ? "left-3" : "right-3",
          )}
        >
          Page {pageNumber}
        </div>
      ) : null}
      {page ? (
        showTextOnly ? (
          <ReaderTextPanelList
            panels={page.panels}
            pageNumberLabel={pageNumber}
            ttsKeyPrefix={ttsPrefix}
            playingTtsId={playingTtsId}
            playDialogue={playDialogue}
            variant="compact"
          />
        ) : (
          <MangaPageGrid page={page} readingDirection={mangaRtl ? "rtl" : "ltr"} />
        )
      ) : (
        <div className="flex h-full items-center justify-center bg-stone-950">
          <span className="text-sm text-muted-foreground">Page vide</span>
        </div>
      )}
    </div>
  );
}

interface SinglePageLayoutProps {
  leftPage: UniversalMangaPage;
  pageIndex: number;
  mangaRtl: boolean;
  showTextOnly: boolean;
  projectId: string;
  chapterId: string;
  goNext: () => void;
  goPrev: () => void;
  playingTtsId: string | null;
  playDialogue: (text: string, speaker?: string | null, id?: string) => Promise<void> | void;
}

function SinglePageLayout(props: SinglePageLayoutProps) {
  const {
    leftPage,
    pageIndex,
    mangaRtl,
    showTextOnly,
    projectId,
    chapterId,
    goNext,
    goPrev,
    playingTtsId,
    playDialogue,
  } = props;

  const onNav = mangaRtl ? goPrev : goNext;
  const hasComposite = Boolean(leftPage.id) && leftPage.panels.some((p) => p.imageUrl);

  return (
    <div
      className="relative z-10 h-full"
      onClick={onNav}
      role="button"
      tabIndex={0}
      aria-label="Page suivante"
      onKeyDown={(e) => e.key === "Enter" && onNav()}
    >
      <div className="absolute bottom-3 right-3 z-20 rounded-full border border-black/20 bg-white/85 px-2 py-1 text-[10px] font-medium text-stone-900">
        Page {pageIndex + 1}
      </div>
      {showTextOnly ? (
        <ReaderTextPanelList
          panels={leftPage.panels}
          pageNumberLabel={pageIndex + 1}
          ttsKeyPrefix={`panel-${pageIndex}`}
          playingTtsId={playingTtsId}
          playDialogue={playDialogue}
          variant="full"
        />
      ) : hasComposite ? (
        <div className="relative h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/projects/${projectId}/chapters/${chapterId}/composite-page?sceneId=${leftPage.id}`}
            alt={`Page manga ${pageIndex + 1}`}
            className="h-full w-full object-contain"
            loading="eager"
            onError={(e) => {
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
      ) : (
        <MangaPageGrid page={leftPage} readingDirection={mangaRtl ? "rtl" : "ltr"} />
      )}
    </div>
  );
}
