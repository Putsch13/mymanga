"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RENDERING_MODES } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const intensities = ["GENERAL_SAFE", "TEEN", "MATURE_DRAMA", "MATURE_VISUAL", "RESTRICTED_BLOCKED_VISUAL"] as const;

export default function ChapterGeneratorPage() {
  const params = useParams();
  const id = params.id as string;
  const [mode, setMode] = useState<(typeof RENDERING_MODES)[number]>("PANEL_DRAFT");
  const [intensity, setIntensity] = useState<(typeof intensities)[number]>("GENERAL_SAFE");
  const [hasCanon, setHasCanon] = useState(true);
  const [photorealCover, setPhotorealCover] = useState(false);
  const [estimate, setEstimate] = useState<unknown>(null);
  const [chapters, setChapters] = useState<{ id: string; title: string | null; chapterNumber: number }[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null);

  const loadChapters = useCallback(() => {
    fetch(`/api/projects/${id}/chapters`)
      .then((r) => r.json())
      .then((j) => {
        setChapters(j.chapters ?? []);
        if (j.chapters?.[0]) setSelectedChapter(j.chapters[0].id);
      });
  }, [id]);

  useEffect(() => {
    loadChapters();
  }, [loadChapters]);

  async function runEstimate() {
    const res = await fetch("/api/estimate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        contentIntensityLayer: intensity,
        hasCanonReferences: hasCanon,
        preferPhotorealCover: photorealCover && mode === "COVER_ART",
        characterCountInScene: 2,
      }),
    });
    setEstimate(await res.json());
  }

  async function createChapter() {
    const res = await fetch(`/api/projects/${id}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Chapitre ${chapters.length + 1}`, userIntent: "Suite narrative" }),
    });
    const j = await res.json();
    if (j.chapter) {
      setSelectedChapter(j.chapter.id);
      loadChapters();
    }
  }

  async function runPipeline() {
    if (!selectedChapter) return;
    setPipelineMsg(null);
    const res = await fetch(`/api/projects/${id}/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterId: selectedChapter }),
    });
    const j = await res.json();
    setPipelineMsg(j.message ?? JSON.stringify(j));
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Projet
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Chapitre & pipeline</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Estimation routing + tokens, création de chapitre, enqueue Inngest manga-first (canon → style → panels → inpaint → score).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg">Estimation image</CardTitle>
            <CardDescription>Provider dynamique (fal / runware / stability).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <select
              className="flex h-10 w-full rounded-lg border border-border bg-background/80 px-3 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value as (typeof RENDERING_MODES)[number])}
            >
              {RENDERING_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              className="flex h-10 w-full rounded-lg border border-border bg-background/80 px-3 text-sm"
              value={intensity}
              onChange={(e) => setIntensity(e.target.value as (typeof intensities)[number])}
            >
              {intensities.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hasCanon} onChange={(e) => setHasCanon(e.target.checked)} />
              Références canon
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={photorealCover} onChange={(e) => setPhotorealCover(e.target.checked)} />
              Cover photoreal (Stable Ultra)
            </label>
            <Button type="button" variant="secondary" onClick={runEstimate}>
              Estimer
            </Button>
            {estimate ? (
              <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-background/50 p-3 text-xs">{JSON.stringify(estimate, null, 2)}</pre>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Inngest</CardTitle>
            <CardDescription>Jobs orchestrés — configure INNGEST_EVENT_KEY sur Render.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={createChapter}>
                Nouveau chapitre brouillon
              </Button>
            </div>
            {chapters.length > 0 ? (
              <select
                className="flex h-10 w-full rounded-lg border border-border bg-background/80 px-3 text-sm"
                value={selectedChapter}
                onChange={(e) => setSelectedChapter(e.target.value)}
              >
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.chapterNumber} {c.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-muted-foreground text-sm">Crée un chapitre pour lancer le pipeline.</p>
            )}
            <Button type="button" onClick={runPipeline} disabled={!selectedChapter}>
              Enqueue pipeline
            </Button>
            {pipelineMsg ? <p className="text-sm text-muted-foreground">{pipelineMsg}</p> : null}
          </CardContent>
        </Card>
      </div>

      <Separator className="bg-border" />
      <p className="text-muted-foreground text-sm">
        Génération image unitaire avec débit tokens :{" "}
        <Link href={`/projects/${id}/studio`} className="text-accent hover:underline">
          Studio image
        </Link>
      </p>
    </div>
  );
}
