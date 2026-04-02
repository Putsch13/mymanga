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

const QUICK_TAGS = [
  "plus d\u2019action",
  "plus de romance",
  "plus de noirceur",
  "twist",
  "nouveau personnage",
  "mort d\u2019un personnage",
];

export default function DemoReaderPage() {
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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4 text-accent" />
          <span className="font-medium text-foreground">
            {demoChapter.title}
          </span>
          <span className="hidden sm:inline">
            &middot; Page {pageIndex + 1}/{totalPages}
            {showEnd ? " \u00b7 fin" : ""}
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

      {/* Manga page */}
      {!showEnd && page ? (
        <div
          className="manga-page-container relative mx-auto cursor-pointer"
          style={{
            maxWidth: fullscreen ? "100%" : "680px",
            aspectRatio: "3 / 4",
          }}
          onClick={goNext}
        >
          <div className="h-full overflow-hidden rounded-lg border-2 border-stone-700/60 shadow-2xl shadow-black/60">
            <MangaPageGrid page={page} />
          </div>
          <div className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-[10px] text-white/60 backdrop-blur">
            {page.panels.length} cases &middot; Cliquer pour tourner
          </div>
        </div>
      ) : null}

      {/* Chapter end */}
      {showEnd ? (
        <Card className="border-accent/30 bg-gradient-to-br from-card/90 to-violet-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-accent" />
              Fin du chapitre &mdash; quelle suite ?
            </CardTitle>
            <CardDescription>
              Instruction libre, suggestions ou tags rapides. Le pipeline V3 génère le chapitre suivant avec mémoire de continuité.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Ton idée pour la suite</Label>
              <Textarea
                rows={4}
                placeholder="Ex. : Le mentor révèle qu\u2019il connaissait le père du héros\u2026"
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
              Valider et générer le chapitre 3
            </Button>
            <p className="text-xs text-muted-foreground">
              En production, cette action lance le pipeline complet : direction créative → outline → script → storyboard → images → mémoire.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-[#0a0a0f] p-3">
        {readerContent}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/demo/project" className="text-sm text-muted-foreground hover:text-foreground">
          \u2190 Projet démo
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">
          Chapitre {demoChapter.number} &middot; {demoChapter.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Arc : {demoChapter.arc} &middot; {totalPages} pages &middot; {demoMangaPages.reduce((s, p) => s + p.panels.length, 0)} cases
        </p>
      </div>
      {readerContent}
    </div>
  );
}
