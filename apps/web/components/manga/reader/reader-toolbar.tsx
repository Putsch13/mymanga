/**
 * P5.2 — Toolbar du reader (mode manga + webtoon).
 *
 * Regroupe :
 * - compteur pages / cases + badge cible premium ;
 * - nav chapitre prev/next ;
 * - switch mode (manga/webtoon), RTL/LTR, double/simple ;
 * - toggles texte vs cases, TTS page, export PDF, refresh, inspecteur ;
 * - boutons fullscreen + exit.
 */
"use client";

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileText,
  ImageIcon,
  Maximize2,
  Minimize2,
  RefreshCw,
  Repeat2,
  SlidersHorizontal,
  Volume2,
  X,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@manga-ai-studio/ui";
import { Button } from "@/components/ui/button";
import type { ChapterNav } from "./use-chapter-nav";

export interface ReaderToolbarProps {
  projectId: string;
  chapterNumber: number | null;
  chapterNav: ChapterNav;

  readerMode: "manga" | "webtoon";
  setReaderMode: (mode: "manga" | "webtoon") => void;
  mangaRtl: boolean;
  setMangaRtl: (rtl: boolean) => void;
  spreadMode: boolean;
  setSpreadMode: (spread: boolean) => void;
  showTextOnly: boolean;
  setShowTextOnly: (v: boolean | ((prev: boolean) => boolean)) => void;

  pageIndex: number;
  setPageIndex: (i: number | ((prev: number) => number)) => void;
  totalPages: number;
  webtoonPanelsCount: number;
  showEnd: boolean;
  completedCount: number;
  targetImages: number;

  fullscreen: boolean;
  setFullscreen: (v: boolean | ((prev: boolean) => boolean)) => void;
  exitHref: string | undefined;

  exporting: boolean;
  exportChapter: () => void | Promise<void>;
  reload: () => void | Promise<void>;
  setInspectOpen: (v: boolean) => void;

  goNext: () => void;
  goPrev: () => void;

  playingTtsId: string | null;
  onTtsPage: () => void;
}

export function ReaderToolbar(props: ReaderToolbarProps) {
  const {
    projectId,
    chapterNumber,
    chapterNav,
    readerMode,
    setReaderMode,
    mangaRtl,
    setMangaRtl,
    spreadMode,
    setSpreadMode,
    showTextOnly,
    setShowTextOnly,
    pageIndex,
    setPageIndex,
    totalPages,
    webtoonPanelsCount,
    showEnd,
    completedCount,
    targetImages,
    fullscreen,
    setFullscreen,
    exitHref,
    exporting,
    exportChapter,
    reload,
    setInspectOpen,
    goNext,
    goPrev,
    playingTtsId,
    onTtsPage,
  } = props;

  const isUnderTarget = completedCount < targetImages;
  const ttsPageActive = playingTtsId?.startsWith("page-") ?? false;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <BookOpen className="h-4 w-4 text-accent" />
        <span>
          {readerMode === "webtoon"
            ? `${webtoonPanelsCount} cases · ${totalPages} pages`
            : spreadMode
              ? `Pages ${pageIndex + 1}-${Math.min(totalPages, pageIndex + 2)}`
              : `Page ${pageIndex + 1}`}{" "}
          / {totalPages}
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
          {readerMode === "webtoon"
            ? "Lecture webtoon verticale"
            : mangaRtl
              ? "Lecture droite → gauche"
              : "Lecture gauche → droite"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-1 py-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!chapterNav.prev}
            onClick={() => {
              if (chapterNav.prev) {
                window.location.href = `/projects/${projectId}/chapters/${chapterNav.prev}/read`;
              }
            }}
            className="h-7 px-2 text-xs"
            title="Chapitre précédent"
            data-no-zoom="true"
          >
            ← Préc.
          </Button>
          <span className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Ch. {chapterNumber ?? "?"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!chapterNav.next}
            onClick={() => {
              if (chapterNav.next) {
                window.location.href = `/projects/${projectId}/chapters/${chapterNav.next}/read`;
              }
            }}
            className="h-7 px-2 text-xs"
            title="Chapitre suivant"
            data-no-zoom="true"
          >
            Suiv. →
          </Button>
        </div>

        <div
          className="inline-flex items-center rounded-md border border-border/60 bg-background/40 p-0.5"
          role="group"
          aria-label="Mode de lecture"
        >
          <Button
            type="button"
            variant={readerMode === "manga" ? "default" : "ghost"}
            size="sm"
            onClick={() => setReaderMode("manga")}
            className="h-7 px-3 text-xs"
            aria-pressed={readerMode === "manga"}
            title="Mode manga : pages tournées comme un livre, droite-gauche par défaut"
          >
            <BookOpen className="mr-1 h-3.5 w-3.5" />
            Manga
          </Button>
          <Button
            type="button"
            variant={readerMode === "webtoon" ? "default" : "ghost"}
            size="sm"
            onClick={() => setReaderMode("webtoon")}
            className="h-7 px-3 text-xs"
            aria-pressed={readerMode === "webtoon"}
            title="Mode webtoon : scroll vertical infini façon coréen"
          >
            <SlidersHorizontal className="mr-1 h-3.5 w-3.5 rotate-90" />
            Webtoon
          </Button>
        </div>
        {readerMode === "manga" ? (
          <Button
            type="button"
            variant={mangaRtl ? "default" : "outline"}
            size="sm"
            onClick={() => setMangaRtl(!mangaRtl)}
            className="gap-1"
            title={
              mangaRtl
                ? "Lecture droite → gauche (style manga japonais)"
                : "Lecture gauche → droite (style occidental)"
            }
          >
            <Repeat2 className="h-4 w-4" />
            {mangaRtl ? "RTL ←" : "LTR →"}
          </Button>
        ) : null}
        {readerMode === "manga" ? (
          <Button
            type="button"
            variant={spreadMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              const next = !spreadMode;
              if (next) {
                setPageIndex((i) => Math.floor(i / 2) * 2);
              }
              setSpreadMode(next);
            }}
            className="gap-1"
            title={spreadMode ? "Affichage en double page (livre ouvert)" : "Affichage en page simple"}
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
          onClick={onTtsPage}
          disabled={playingTtsId !== null && !ttsPageActive}
          className="gap-1"
        >
          <Volume2 className="h-4 w-4" />
          {ttsPageActive ? "Lecture…" : "Écouter"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void exportChapter()}
          disabled={exporting}
        >
          {exporting ? "Export…" : "Exporter PDF"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void reload()}
          className="gap-1"
        >
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
        <Button type="button" variant="ghost" size="sm" onClick={() => setFullscreen((v) => !v)}>
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
}
