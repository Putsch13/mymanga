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
  RefreshCw,
  Repeat2,
  Sparkles,
} from "lucide-react";
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
import { MangaPanel } from "./manga-panel";
import { MangaPageGrid, flattenPagesToPanels, pipelineScenesToPages, type UniversalMangaPage } from "./manga-page-grid";

type SceneImage = {
  id: string;
  imageUrl: string | null;
  panelNumber: number;
  status?: string;
  provider?: string | null;
  model?: string | null;
  metadata?: {
    dialogue?: { speaker: string; text: string } | Array<{ speaker: string; text: string }>;
    dialogues?: Array<{ speaker: string; text: string }>;
    narration?: string;
    sfx?: string;
    caption?: string;
    layout?: string;
    mood?: string;
    textScale?: "normal" | "compact" | "micro";
    error?: string;
    blockedReason?: string;
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
  };
};

type ChapterScene = {
  id: string;
  title: string | null;
  images: SceneImage[];
};

type ChapterPayload = {
  id: string;
  chapterNumber: number;
  title: string | null;
  summary: string | null;
  cliffhanger: string | null;
  storyboard: unknown;
  outline: unknown;
  script: unknown;
  scenes: ChapterScene[];
};

type CanonStateData = {
  hasCanonState: boolean;
  worldState?: {
    activeLocations: string[];
    activeThreats: string[];
    activeMysteries: string[];
  };
  openThreads?: Array<{
    label: string;
    description: string;
    priority: string;
    introducedAtChapter: number;
  }>;
  characterStates?: Array<{
    characterName: string;
    currentState: {
      location?: string;
      outfit?: string;
      injuries?: string[];
      emotion?: string;
      objective?: string;
    };
  }>;
  canonEvents?: Array<{
    type: string;
    subjectName?: string | null;
    description: string;
    irreversible: boolean;
  }>;
  continuityWarnings?: string[];
};

type ReaderResponse = {
  chapter: ChapterPayload;
  memorySnapshot?: {
    narrativeSummary?: string | null;
    openLoops?: string[] | null;
  } | null;
  activeJob?: { id: string; status: string } | null;
  imageStats?: { total: number; completed: number; failed: number; pending: number } | null;
  generationDiagnostics?: {
    operationalStatus?: string;
    degradedModes?: string[];
    outline?: { fallbackReason?: string; usedFallback?: boolean } | null;
    dialogue?: { usedFallback?: boolean; fallbackSceneIds?: string[] } | null;
    sceneFallbacks?: Array<{ sceneId: string; title: string | null; reason: string }>;
    creativityControls?: {
      noveltyLevel?: number;
      worldStrictness?: number;
      visualExoticism?: number;
      npcVariety?: number;
      environmentRichness?: number;
    } | null;
    qualityReport?: {
      averageReleaseScore?: number;
      releaseThreshold?: number;
      premiumReleaseAccepted?: boolean;
      weakPanels?: Array<{ panelIndex: number; releaseScore: number; issues: number }>;
    } | null;
    panelDebug?: Array<{
      sceneId: string;
      panelId: string;
      panelNumber: number;
      status: string | null;
      provider: string | null;
      model: string | null;
      prompt: string | null;
      releaseScore: number | null;
      backgroundPresenceScore: number | null;
      interactionScore: number | null;
      styleConsistencyScore: number | null;
      visionScore: number | null;
      visionEnabled: boolean;
      visionFindings: string[];
      rerollCount: number;
      issues: Array<{ message?: string; severity?: string; type?: string }>;
    }>;
  } | null;
};

function normalizeForReaderDup(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeReaderPages(pages: UniversalMangaPage[]): UniversalMangaPage[] {
  const seen = new Set<string>();
  const deduped: UniversalMangaPage[] = [];
  for (const page of pages) {
    const signature = page.panels
      .map((panel) =>
        [
          normalizeForReaderDup(panel.caption),
          normalizeForReaderDup(panel.dialogue),
          normalizeForReaderDup(panel.narration),
          panel.imageUrl ?? "",
        ].join("|"),
      )
      .join("||");
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(page);
  }
  return deduped;
}

function buildPagesFromChapter(chapter: ChapterPayload): UniversalMangaPage[] {
  const storyboard = chapter.storyboard as {
    pages?: Array<{ pageNumber: number; layout: string }>;
  } | null;

  const sbPages = storyboard?.pages ?? [];

  if (chapter.scenes.length === 0) {
    return [
      {
        layout: "A",
        panels: [
          {
            mood: "dramatic",
            narration: chapter.summary ?? `Chapitre ${chapter.chapterNumber}`,
          },
        ],
      },
    ];
  }

  const pipelineScenes = chapter.scenes.map((scene) => ({
    id: scene.id,
    images: scene.images.map((img) => ({
      id: img.id,
      panelNumber: img.panelNumber,
      mood: img.metadata?.mood,
      imageUrl: img.imageUrl,
      status: img.status,
      provider: img.provider,
      model: img.model,
      metadata: img.metadata,
    })),
  }));

  return dedupeReaderPages(pipelineScenesToPages(pipelineScenes, sbPages));
}

const SUGGESTIONS = [
  {
    label: "Révélation majeure",
    intent: "Le lecteur découvre enfin le secret qui lie les deux familles.",
  },
  {
    label: "Confrontation",
    intent: "Les deux camps se retrouvent face à face, tension maximale.",
  },
  {
    label: "Ellipse temporelle",
    intent: "On saute trois jours plus tard, après la tempête.",
  },
];

const QUICK_TAGS = [
  "plus d\u2019action",
  "plus de romance",
  "plus de noirceur",
  "twist",
  "nouveau personnage",
  "mort d\u2019un personnage",
];

type Props = {
  projectId: string;
  chapterId: string;
};

export function MangaBookReader({ projectId, chapterId }: Props) {
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
  const [fullscreen, setFullscreen] = useState(false);
  const [spreadMode, setSpreadMode] = useState(true);
  const [readerMode, setReaderMode] = useState<"manga" | "webtoon">("webtoon");
  const [mangaRtl, setMangaRtl] = useState(true);
  const [turn, setTurn] = useState<null | { dir: "next" | "prev"; at: number }>(null);
  const [intent, setIntent] = useState("");
  const [continuing, setContinuing] = useState(false);
  const [continueMsg, setContinueMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const degradedReaderWarning =
    (generationDiagnostics?.degradedModes?.length ?? 0) > 0
      ? [
          `Sortie dégradée: ${generationDiagnostics?.degradedModes?.join(", ")}.`,
          generationDiagnostics?.outline?.usedFallback
            ? `Outline fallback: ${generationDiagnostics.outline.fallbackReason ?? "raison non précisée"}.`
            : null,
          generationDiagnostics?.dialogue?.usedFallback
            ? `Dialogue fallback sur ${generationDiagnostics.dialogue.fallbackSceneIds?.length ?? 0} scène(s).`
            : null,
        ]
          .filter(Boolean)
          .join(" ")
      : null;

  const load = useCallback(async (options?: { preserveIndex?: boolean }) => {
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
    // Charger le canon state
    fetch(`/api/projects/${projectId}/chapters/${chapterId}/canon-state`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setCanonState(data as CanonStateData))
      .catch(() => setCanonState(null));
  }, [projectId, chapterId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh pendant une génération d'images / pipeline pour éviter le besoin de refresh manuel.
  useEffect(() => {
    if (!activeJob) return;
    if (!["queued", "running", "waiting_external"].includes(activeJob.status)) return;
    const interval = window.setInterval(() => {
      void load({ preserveIndex: true });
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

  const goNext = useCallback(() => {
    setTurn({ dir: "next", at: Date.now() });
    const step = spreadMode ? 2 : 1;
    if (pageIndex < totalPages - step) {
      setPageIndex((i) => i + step);
    } else {
      setShowEnd(true);
    }
  }, [pageIndex, totalPages, spreadMode]);

  const goPrev = useCallback(() => {
    setTurn({ dir: "prev", at: Date.now() });
    if (showEnd) {
      setShowEnd(false);
      return;
    }
    const step = spreadMode ? 2 : 1;
    setPageIndex((i) => Math.max(0, i - step));
  }, [showEnd, spreadMode]);

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
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, fullscreen, mangaRtl, readerMode]);

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

    return (
      <div
        className="relative mx-auto cursor-pointer"
        style={{ maxWidth: fullscreen ? "100%" : spreadMode ? "1040px" : "720px" }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && (mangaRtl ? goPrev() : goNext())}
        aria-label="Lecture manga"
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
                  aria-label="Page précédente"
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
                          <div key={i} className="rounded-lg border border-stone-700 bg-stone-900 p-3">
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
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <MangaPageGrid page={spreadLeftPage} />
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
                  aria-label="Page suivante"
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
                            <div key={i} className="rounded-lg border border-stone-700 bg-stone-900 p-3">
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
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <MangaPageGrid page={spreadRightPage} />
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
                          <p className="text-sm text-stone-200">
                            {panel.speaker && (
                              <span className="font-bold text-violet-400">{panel.speaker}: </span>
                            )}
                            {panel.dialogue}
                          </p>
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
                  <MangaPageGrid page={leftPage} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderWebtoon = () => (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="space-y-12 md:space-y-16">
        {pages.map((page, pageIdx) => (
          <section key={page.id ?? `page-${pageIdx}`} className="space-y-4 rounded-[32px] border border-white/5 bg-white/[0.02] px-2 py-4 sm:px-4">
            <div className="sticky top-3 z-20 mx-auto flex w-fit items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs text-stone-200 backdrop-blur">
              <BookOpen className="h-3.5 w-3.5 text-accent" />
              <span>Page {pageIdx + 1}</span>
            </div>
            <div className="space-y-8 md:space-y-10">
              {page.panels.map((panel, panelIdx) => (
                <MangaPanel
                  key={panel.id ?? `${pageIdx}-${panelIdx}`}
                  mood={panel.mood}
                  imageUrl={panel.imageUrl}
                  status={panel.status}
                  provider={panel.provider}
                  model={panel.model}
                  error={panel.error}
                  sceneImageId={panel.id}
                  dialogue={panel.dialogue}
                  dialogues={panel.dialogues}
                  speaker={panel.speaker}
                  narration={panel.narration}
                  sfx={panel.sfx}
                  caption={panel.caption}
                  textScale={panel.textScale}
                  renderMeta={panel.renderMeta}
                  layoutMeta={panel.layoutMeta}
                  renderMode="webtoon"
                  panelIndex={panelIdx}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );

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
          variant="ghost"
          size="sm"
          onClick={() => setFullscreen((v) => !v)}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
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
            {SUGGESTIONS.map((s) => (
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
            {QUICK_TAGS.map((tag) => (
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

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-[#0a0a0f] p-3">
        {toolbar}
        {!showEnd ? (readerMode === "webtoon" ? renderWebtoon() : renderPage()) : null}
        {endCard}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border/60 bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Lecture V5</CardTitle>
            <CardDescription>Mode manga paginé ou webtoon vertical.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Mode webtoon vertical par défaut pour une lecture fluide.</p>
            <p>2. Mode manga paginé toujours disponible.</p>
            <p>3. En fin de chapitre : proposition de suite et continuité mémoire.</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Mémoire & statut</CardTitle>
            <CardDescription>Le chapitre doit pouvoir nourrir les suivants.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{memorySummary ?? "Aucun résumé mémoire disponible pour ce chapitre pour l'instant."}</p>
            {degradedReaderWarning ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
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
            {activeJob ? <p>Job actif : {activeJob.status}</p> : <p>Job actif : aucun</p>}
            {generationDiagnostics?.creativityControls ? (
              <p>
                Contrôles moteur : N {generationDiagnostics.creativityControls.noveltyLevel ?? "?"}
                {" · "}W {generationDiagnostics.creativityControls.worldStrictness ?? "?"}
                {" · "}X {generationDiagnostics.creativityControls.visualExoticism ?? "?"}
                {" · "}PNJ {generationDiagnostics.creativityControls.npcVariety ?? "?"}
                {" · "}Env {generationDiagnostics.creativityControls.environmentRichness ?? "?"}
              </p>
            ) : null}
            {generationDiagnostics?.qualityReport ? (
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 px-3 py-2 text-xs text-cyan-100">
                Release chapitre {(Number(generationDiagnostics.qualityReport.averageReleaseScore ?? 0) * 100).toFixed(0)}/100
                {" · "}Seuil {(Number(generationDiagnostics.qualityReport.releaseThreshold ?? 0) * 100).toFixed(0)}/100
                {" · "}{generationDiagnostics.qualityReport.premiumReleaseAccepted ? "Premium OK" : "Release dégradée"}
              </div>
            ) : null}
            {generationDiagnostics?.panelDebug && generationDiagnostics.panelDebug.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-stone-800 bg-stone-950/40 p-3">
                <p className="text-xs font-semibold text-stone-200">Debug rendu</p>
                {generationDiagnostics.panelDebug.slice(0, 6).map((panel) => (
                  <div key={panel.panelId} className="rounded border border-stone-800/80 bg-black/20 p-2 text-[11px]">
                    <p className="font-medium text-stone-100">
                      Panel {panel.panelNumber} · {panel.status ?? "?"} · {panel.provider ?? "?"}
                    </p>
                    <p className="text-muted-foreground">
                      Release {(panel.releaseScore ?? 0).toFixed(2)} · Fond {(panel.backgroundPresenceScore ?? 0).toFixed(2)} · Interaction {(panel.interactionScore ?? 0).toFixed(2)} · Style {(panel.styleConsistencyScore ?? 0).toFixed(2)} · Vision {panel.visionEnabled ? (panel.visionScore ?? 0).toFixed(2) : "off"} · Rerolls {panel.rerollCount}
                    </p>
                    {panel.issues.length > 0 ? (
                      <p className="mt-1 text-[10px] text-amber-300/80">
                        {panel.issues.slice(0, 2).map((issue) => issue.message ?? issue.type ?? "issue").join(" | ")}
                      </p>
                    ) : null}
                    {panel.visionEnabled && panel.visionFindings.length > 0 ? (
                      <p className="mt-1 text-[10px] text-cyan-300/80">
                        Vision: {panel.visionFindings.slice(0, 2).join(" | ")}
                      </p>
                    ) : null}
                    {panel.prompt ? (
                      <p className="mt-1 line-clamp-3 text-[10px] text-stone-400">{panel.prompt}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Panneau État Canonique */}
        {canonState?.hasCanonState ? (
          <Card className="border-violet-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">État canonique</CardTitle>
              <CardDescription className="text-xs">
                État du monde et des personnages à la fin de ce chapitre
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {canonState.worldState && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold text-violet-400">Monde</h4>
                  {canonState.worldState.activeLocations.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Lieux actifs : {canonState.worldState.activeLocations.join(", ")}
                    </p>
                  )}
                  {canonState.worldState.activeThreats.length > 0 && (
                    <p className="text-xs text-orange-400/80">
                      Menaces : {canonState.worldState.activeThreats.join(", ")}
                    </p>
                  )}
                  {canonState.worldState.activeMysteries.length > 0 && (
                    <p className="text-xs text-purple-400/80">
                      Mystères : {canonState.worldState.activeMysteries.join(", ")}
                    </p>
                  )}
                </div>
              )}

              {canonState.characterStates && canonState.characterStates.length > 0 && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold text-violet-400">Personnages</h4>
                  <div className="space-y-2">
                    {canonState.characterStates.slice(0, 5).map((cs, idx) => (
                      <div key={idx} className="rounded border border-stone-800 bg-stone-950/30 p-2">
                        <p className="text-xs font-medium">{cs.characterName}</p>
                        {cs.currentState.location && (
                          <p className="text-[10px] text-muted-foreground">Lieu : {cs.currentState.location}</p>
                        )}
                        {cs.currentState.outfit && (
                          <p className="text-[10px] text-muted-foreground">Tenue : {cs.currentState.outfit}</p>
                        )}
                        {cs.currentState.injuries && cs.currentState.injuries.length > 0 && (
                          <p className="text-[10px] text-orange-400/80">
                            Blessures : {cs.currentState.injuries.join(", ")}
                          </p>
                        )}
                        {cs.currentState.emotion && (
                          <p className="text-[10px] text-blue-400/80">État : {cs.currentState.emotion}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {canonState.continuityWarnings && canonState.continuityWarnings.length > 0 && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold text-red-400">Alertes cohérence</h4>
                  <ul className="list-inside list-disc space-y-1 text-[10px] text-red-300/80">
                    {canonState.continuityWarnings.slice(0, 10).map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Panneau Fils Narratifs Ouverts */}
        {canonState?.hasCanonState && canonState.openThreads && canonState.openThreads.length > 0 ? (
          <Card className="border-amber-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Fils narratifs ouverts</CardTitle>
              <CardDescription className="text-xs">
                Intrigues en cours qui doivent être résolues
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {canonState.openThreads.slice(0, 8).map((thread, idx) => (
                <div
                  key={idx}
                  className="rounded border border-amber-800/50 bg-amber-950/20 p-2"
                >
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
                  <p className="mt-0.5 text-[9px] text-muted-foreground/60">
                    Introduit au chapitre {thread.introducedAtChapter}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
      {toolbar}
      {!showEnd ? (readerMode === "webtoon" ? renderWebtoon() : renderPage()) : null}
      {endCard}
    </div>
  );
}
