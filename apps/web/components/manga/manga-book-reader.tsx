"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageIcon,
  Maximize2,
  Minimize2,
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
import { MangaPageGrid, pipelineScenesToPages, type UniversalMangaPage } from "./manga-page-grid";

type SceneImage = {
  id: string;
  imageUrl: string | null;
  panelNumber: number;
  status?: string;
  metadata?: {
    dialogue?: { speaker: string; text: string };
    narration?: string;
    sfx?: string;
    caption?: string;
    layout?: string;
    mood?: string;
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
      panelNumber: img.panelNumber,
      mood: img.metadata?.mood,
      imageUrl: img.imageUrl,
      metadata: img.metadata,
    })),
  }));

  return pipelineScenesToPages(pipelineScenes, sbPages);
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [showTextOnly, setShowTextOnly] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [intent, setIntent] = useState("");
  const [continuing, setContinuing] = useState(false);
  const [continueMsg, setContinueMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}`);
    if (!res.ok) {
      setLoadError("Chapitre introuvable");
      return;
    }
    const j = (await res.json()) as { chapter: ChapterPayload };
    setChapter(j.chapter);
    setPageIndex(0);
    setShowEnd(false);
  }, [projectId, chapterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = useMemo(() => {
    if (!chapter) return [];
    return buildPagesFromChapter(chapter);
  }, [chapter]);

  const totalPages = pages.length;

  const goNext = useCallback(() => {
    if (pageIndex < totalPages - 1) {
      setPageIndex((i) => i + 1);
    } else {
      setShowEnd(true);
    }
  }, [pageIndex, totalPages]);

  const goPrev = useCallback(() => {
    if (showEnd) {
      setShowEnd(false);
      return;
    }
    setPageIndex((i) => Math.max(0, i - 1));
  }, [showEnd]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, fullscreen]);

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

  const currentPage = pages[pageIndex];

  const renderPage = () => {
    if (!currentPage) return null;

    return (
      <div
        className="relative mx-auto cursor-pointer"
        style={{ maxWidth: fullscreen ? "100%" : "720px" }}
        onClick={goNext}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && goNext()}
        aria-label="Page suivante"
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
            {showTextOnly ? (
              <div className="flex h-full flex-col gap-3 overflow-y-auto p-6">
                <h3 className="font-serif text-lg font-bold text-stone-200">
                  Page {pageIndex + 1}
                </h3>
                {currentPage.panels.map((panel, i) => (
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
              <MangaPageGrid page={currentPage} />
            )}
          </div>
        </div>
      </div>
    );
  };

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <BookOpen className="h-4 w-4 text-accent" />
        <span>
          Page {pageIndex + 1}/{totalPages}
          {showEnd ? " · fin" : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
          {exporting ? "Export…" : "PDF"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setFullscreen((v) => !v)}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={goPrev}
          disabled={pageIndex === 0 && !showEnd}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" onClick={goNext} disabled={showEnd}>
          <ChevronRight className="h-4 w-4" />
        </Button>
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
        {!showEnd ? renderPage() : null}
        {endCard}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toolbar}
      {!showEnd ? renderPage() : null}
      {endCard}
    </div>
  );
}
