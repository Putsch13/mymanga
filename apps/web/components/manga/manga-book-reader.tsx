"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildMangaPagesFromChapter,
  groupIntoSpreads,
  type MangaReaderPage,
} from "@manga-ai-studio/core";
import { BookOpen, ChevronLeft, ChevronRight, FileText, ImageIcon, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { cn } from "@manga-ai-studio/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ChapterPayload = {
  id: string;
  chapterNumber: number;
  title: string | null;
  summary: string | null;
  cliffhanger: string | null;
  storyboard: unknown;
  outline: unknown;
  script: unknown;
  scenes: Array<{
    id: string;
    title: string | null;
    images: Array<{ id: string; imageUrl: string | null; panelNumber: number }>;
  }>;
};

function injectSceneImages(pages: MangaReaderPage[], chapter: ChapterPayload): MangaReaderPage[] {
  const imagePanels = chapter.scenes.flatMap((scene) =>
    scene.images
      .filter((img) => img.imageUrl)
      .map((img) => ({
        id: img.id,
        imageUrl: img.imageUrl,
        caption: scene.title ?? undefined,
        dialogue: undefined as string | undefined,
      })),
  );
  if (imagePanels.length === 0) return pages;
  const cover = pages[0];
  const tail = pages.slice(1);
  const imagePages: MangaReaderPage[] = imagePanels.map((panel, i) => ({
    id: `scene-img-${i}`,
    pageIndex: i + 1,
    panels: [panel],
  }));
  return cover ? [cover, ...imagePages, ...tail] : [...imagePages, ...tail];
}

const SUGGESTIONS = [
  { label: "Révélation majeure", intent: "Le lecteur découvre enfin le secret qui lie les deux familles." },
  { label: "Confrontation", intent: "Les deux camps se retrouvent face à face, tension maximale." },
  { label: "Ellipse temporelle", intent: "On saute trois jours plus tard, après la tempête." },
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
  const [spreadIndex, setSpreadIndex] = useState(0);
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
    const j = await res.json();
    setChapter(j.chapter);
    setSpreadIndex(0);
    setShowEnd(false);
  }, [projectId, chapterId]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = useMemo(() => {
    if (!chapter) return [];
    let base = buildMangaPagesFromChapter({
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      summary: chapter.summary,
      cliffhanger: chapter.cliffhanger,
      storyboard: chapter.storyboard,
      outline: chapter.outline,
      script: chapter.script,
    });
    base = injectSceneImages(base, chapter);
    return base;
  }, [chapter]);

  const spreads = useMemo(() => groupIntoSpreads(pages), [pages]);

  const goNext = useCallback(() => {
    if (spreadIndex < spreads.length - 1) {
      setSpreadIndex((i) => i + 1);
    } else {
      setShowEnd(true);
    }
  }, [spreadIndex, spreads.length]);

  const goPrev = useCallback(() => {
    if (showEnd) {
      setShowEnd(false);
      return;
    }
    setSpreadIndex((i) => Math.max(0, i - 1));
  }, [showEnd]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
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
    const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/continue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIntent: text || `Préférence : ${quickTag}`, quickTag }),
    });
    const j = await res.json();
    setContinuing(false);
    if (!res.ok) { setContinueMsg(j.message ?? "Erreur"); return; }
    setContinueMsg(j.message ?? "OK");
    if (j.nextChapterId) {
      window.location.href = `/projects/${projectId}/chapters/${j.nextChapterId}/read`;
    }
  }

  async function exportChapter() {
    setExporting(true);
    const res = await fetch(`/api/chapters/${chapterId}/export/pdf`, { method: "POST" });
    setExporting(false);
    if (!res.ok) { setContinueMsg("Export impossible"); return; }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chapter-${chapter?.chapterNumber ?? chapterId}.pdf`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  if (loadError) return <p className="text-red-400">{loadError}</p>;
  if (!chapter) return <p className="text-sm text-muted-foreground">Ouverture du livre\u2026</p>;

  const spread = spreads[spreadIndex];

  const renderSpread = () => {
    if (!spread) return null;
    return (
      <div
        className="relative mx-auto cursor-pointer"
        style={{ maxWidth: fullscreen ? "100%" : "960px" }}
        onClick={goNext}
      >
        <div
          className={cn(
            "overflow-hidden rounded-lg border-2 border-stone-700/50 shadow-2xl shadow-black/50",
            "bg-gradient-to-br from-stone-900 via-stone-950 to-black p-3 md:p-5",
          )}
        >
          <div className="absolute inset-x-6 top-2 h-2 rounded-full bg-gradient-to-r from-transparent via-stone-600/40 to-transparent" aria-hidden />
          <div className="grid min-h-[min(70vh,560px)] grid-cols-1 gap-3 md:grid-cols-2 md:gap-0">
            {spread.map((page, pi) => (
              <div
                key={page.id}
                className={cn(
                  "relative flex flex-col border border-stone-600/50 bg-[#f4efe4] text-stone-900 shadow-inner",
                  "md:first:rounded-l-md md:last:rounded-r-md",
                  pi === 0 && "md:border-r-dashed md:border-r-stone-500",
                )}
                style={{ boxShadow: "inset 0 0 40px rgba(0,0,0,0.06)" }}
              >
                {page.isCover ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                    <Sparkles className="h-10 w-10 text-violet-700" />
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Manga AI Studio</p>
                    <h2 className="font-serif text-3xl font-bold text-stone-900">{page.panels[0]?.dialogue}</h2>
                    <p className="text-stone-600">{page.panels[0]?.caption}</p>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col gap-3 p-3 md:p-4">
                    {page.panels.map((panel) => (
                      <div key={panel.id} className="flex flex-1 flex-col gap-2">
                        {!showTextOnly && panel.imageUrl ? (
                          <div className="relative flex-1 overflow-hidden rounded-md border border-stone-300 bg-stone-200/50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={panel.imageUrl} alt="" className="h-full max-h-[340px] w-full object-contain" />
                          </div>
                        ) : null}
                        {!showTextOnly && !panel.imageUrl ? (
                          <div className="flex min-h-[80px] flex-1 items-center justify-center rounded-md border-2 border-dashed border-stone-400 bg-stone-100/80">
                            <span className="text-xs text-stone-500">Case &middot; image &agrave; g&eacute;n&eacute;rer</span>
                          </div>
                        ) : null}
                        {(panel.dialogue || panel.caption) && (
                          <div className="rounded-lg border-2 border-stone-800 bg-white px-3 py-2 text-sm shadow-md font-serif leading-relaxed text-stone-900">
                            {panel.caption ? <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{panel.caption}</p> : null}
                            {panel.dialogue ? <p className="whitespace-pre-wrap">{panel.dialogue}</p> : null}
                            {panel.sfx ? <p className="mt-2 text-center font-black italic text-red-700">{panel.sfx}</p> : null}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <BookOpen className="h-4 w-4 text-accent" />
        <span>Planche {spreadIndex + 1}/{spreads.length}{showEnd ? " \u00b7 fin" : ""}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={showTextOnly ? "default" : "outline"} size="sm" onClick={() => setShowTextOnly((v) => !v)} className="gap-1">
          {showTextOnly ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
          {showTextOnly ? "Texte" : "Cases"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={exportChapter} disabled={exporting}>
          {exporting ? "Export\u2026" : "PDF"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setFullscreen((v) => !v)}>
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={goPrev} disabled={spreadIndex === 0 && !showEnd}>
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
          <Label>Ton id&eacute;e</Label>
          <Textarea rows={4} placeholder="Ex. : Le mentor r\u00e9v\u00e8le qu\u2019il connaissait le p\u00e8re du h\u00e9ros\u2026" value={intent} onChange={(e) => setIntent(e.target.value)} />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Suggestions</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button key={s.label} type="button" variant="secondary" size="sm" onClick={() => setIntent(s.intent)}>{s.label}</Button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Tags rapides</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_TAGS.map((tag) => (
              <Button key={tag} type="button" variant="outline" size="sm" onClick={() => submitContinue(tag)} disabled={continuing}>{tag}</Button>
            ))}
          </div>
        </div>
        <Button type="button" className="w-full sm:w-auto" disabled={continuing || !intent.trim()} onClick={() => submitContinue()}>
          {continuing ? "Cr\u00e9ation\u2026" : "Valider et ouvrir la suite"}
        </Button>
        {continueMsg ? <p className="text-sm text-muted-foreground">{continueMsg}</p> : null}
      </CardContent>
    </Card>
  ) : null;

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-[#0a0a0f] p-3">
        {toolbar}
        {!showEnd ? renderSpread() : null}
        {endCard}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toolbar}
      {!showEnd ? renderSpread() : null}
      {endCard}
    </div>
  );
}
