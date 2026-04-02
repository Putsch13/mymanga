"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { demoChapter, demoMangaPages } from "@/lib/demo-data";
import { MangaPageGrid } from "@/components/manga/manga-page-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SUGGESTIONS = [
  { label: "Révélation majeure", intent: "Le lecteur découvre enfin le secret qui lie les deux familles." },
  { label: "Confrontation", intent: "Les deux camps se retrouvent face à face, tension maximale." },
  { label: "Ellipse temporelle", intent: "On saute trois jours plus tard, après la tempête." },
];

const QUICK_TAGS = ["plus d’action", "plus de romance", "plus de noirceur", "twist", "nouveau personnage", "mort d’un personnage"];

export function DemoReaderClient({
  custom,
  customProjectTitle,
  customChapterTitle,
  customTone,
  customIntent,
}: {
  custom: boolean;
  customProjectTitle?: string;
  customChapterTitle?: string;
  customTone?: string;
  customIntent?: string;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [showEnd, setShowEnd] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [intent, setIntent] = useState("");
  const totalPages = demoMangaPages.length;
  const page = demoMangaPages[pageIndex];

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
      if (e.key === "Escape" && fullscreen) {
        setFullscreen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, fullscreen]);

  const readerContent = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4 text-accent" />
          <span className="font-medium text-foreground">{customChapterTitle || demoChapter.title}</span>
          <span className="hidden sm:inline">
            · Page {pageIndex + 1}/{totalPages}
            {showEnd ? " · fin" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setFullscreen((v) => !v)}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={goPrev} disabled={pageIndex === 0 && !showEnd}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[3ch] text-center text-sm tabular-nums text-muted-foreground sm:hidden">
            {pageIndex + 1}/{totalPages}
          </span>
          <Button type="button" size="sm" onClick={goNext} disabled={showEnd}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!showEnd && page ? (
        <div
          className="manga-page-container relative mx-auto cursor-pointer"
          style={{ maxWidth: fullscreen ? "100%" : "680px", aspectRatio: "3 / 4" }}
          onClick={goNext}
        >
          <div className="h-full overflow-hidden rounded-lg border-2 border-stone-700/60 shadow-2xl shadow-black/60">
            <MangaPageGrid page={page} />
          </div>
          <div className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-[10px] text-white/60 backdrop-blur">
            {page.panels.length} cases · Cliquer pour tourner
          </div>
        </div>
      ) : null}

      {showEnd ? (
        <Card className="border-accent/30 bg-gradient-to-br from-card/90 to-violet-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-accent" />
              Fin du chapitre — quelle suite ?
            </CardTitle>
            <CardDescription>La démo montre le vrai masque de continuation produit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Ton idée pour la suite</Label>
              <Textarea
                rows={4}
                placeholder="Ex. : Le mentor révèle qu’il connaissait le père du héros…"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Suggestions (1 clic)</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s.label} type="button" variant="secondary" size="sm" onClick={() => setIntent(s.intent)}>
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Tags rapides</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_TAGS.map((tag) => (
                  <Button key={tag} type="button" variant="outline" size="sm">
                    {tag}
                  </Button>
                ))}
              </div>
            </div>
            <Button type="button" className="w-full sm:w-auto" disabled={!intent.trim()}>
              Valider et générer le chapitre suivant
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </>
  );

  if (fullscreen) {
    return <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-[#0a0a0f] p-3">{readerContent}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/demo/project" className="text-sm text-muted-foreground hover:text-foreground">
          ← Projet démo
        </Link>
        {custom ? (
          <div className="mt-4 rounded-2xl border border-accent/30 bg-card/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Preview chapitre sur mesure</p>
            <p className="mt-1">
              {customProjectTitle || "Manga démo"} · {customChapterTitle || "Nouveau chapitre"}
            </p>
            {customTone ? <p className="mt-1">Ton : {customTone}</p> : null}
            {customIntent ? <p className="mt-2 line-clamp-3">{customIntent}</p> : null}
          </div>
        ) : null}
        <h1 className="mt-2 text-3xl font-semibold">
          Chapitre {demoChapter.number} · {customChapterTitle || demoChapter.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Arc : {demoChapter.arc} · {totalPages} pages · {demoMangaPages.reduce((s, p) => s + p.panels.length, 0)} cases
        </p>
      </div>
      {readerContent}
    </div>
  );
}

