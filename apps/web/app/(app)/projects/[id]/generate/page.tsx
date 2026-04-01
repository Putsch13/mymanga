"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RENDERING_MODES } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const intensities = ["GENERAL_SAFE", "TEEN", "MATURE_DRAMA", "MATURE_VISUAL", "RESTRICTED_BLOCKED_VISUAL"] as const;

export default function ChapterGeneratorPage() {
  const params = useParams();
  const id = params.id as string;
  const [mode, setMode] = useState<(typeof RENDERING_MODES)[number]>("PANEL_DRAFT");
  const [intensity, setIntensity] = useState<(typeof intensities)[number]>("GENERAL_SAFE");
  const [hasCanon, setHasCanon] = useState(true);
  const [photorealCover, setPhotorealCover] = useState(false);
  const [imageEstimate, setImageEstimate] = useState<unknown>(null);
  const [chapterEstimate, setChapterEstimate] = useState<{
    estimatedTokens: number;
    contextPreview: {
      recentChapters: Array<{ chapterNumber: number; title: string | null; summary: string | null }>;
      retrievedDocs: Array<{ title: string | null; content: string }>;
      arcs: Array<{ id?: string; name: string; summary: string | null }>;
      characters: Array<{ id: string; name: string; roleType: string | null }>;
    };
    plotOptions: Array<{ id: string; title: string; label: string; summary: string }>;
    creativeDirection: { chapterGoal: string; tone: string; whyNow: string };
  } | null>(null);
  const [chapters, setChapters] = useState<{ id: string; title: string | null; chapterNumber: number }[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<{
    id: string;
    status: string;
    output?: { currentStep?: string; steps?: Array<{ key: string; label: string; status: string }> };
    error?: { message?: string };
  } | null>(null);
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null);
  const [userIntent, setUserIntent] = useState("Faire monter la tension, révéler un secret et préparer une confrontation majeure.");
  const [chapterTitle, setChapterTitle] = useState("");

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

  useEffect(() => {
    if (!selectedJobId) return;
    const interval = window.setInterval(async () => {
      const res = await fetch(`/api/jobs/${selectedJobId}`);
      if (!res.ok) return;
      const json = await res.json();
      setJobState(json.job);
      if (["completed", "failed", "partial_success", "canceled"].includes(json.job.status)) {
        window.clearInterval(interval);
        loadChapters();
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [loadChapters, selectedJobId]);

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
    setImageEstimate(await res.json());
  }

  async function runChapterEstimate() {
    const res = await fetch(`/api/projects/${id}/chapters/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIntent }),
    });
    const json = await res.json();
    setChapterEstimate(json);
  }

  async function createChapter() {
    const res = await fetch(`/api/projects/${id}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: chapterTitle || `Chapitre ${chapters.length + 1}`, userIntent }),
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
    if (j.jobId) {
      setSelectedJobId(j.jobId);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Projet
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Chapitre & pipeline</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Génération V3 par étapes : estimation, contexte mémoire, options de plot, job pipeline, script, storyboard et suivi.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg">Direction créative</CardTitle>
            <CardDescription>Intention utilisateur, estimation chapitre et preview de mémoire récupérée.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} placeholder="Titre optionnel du prochain chapitre" />
            </div>
            <div className="space-y-2">
              <Textarea rows={5} value={userIntent} onChange={(e) => setUserIntent(e.target.value)} placeholder="Ce que tu veux faire avancer dans l'histoire..." />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={runChapterEstimate}>
                Estimer le chapitre
              </Button>
              <Button type="button" variant="outline" onClick={createChapter}>
                Créer le brouillon
              </Button>
            </div>
            {chapterEstimate ? (
              <div className="space-y-4 rounded-lg border border-border/60 p-4">
                <p className="text-sm font-medium">Estimation : {chapterEstimate.estimatedTokens} tokens</p>
                <p className="text-sm text-muted-foreground">{chapterEstimate.creativeDirection.whyNow}</p>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Options de plot</p>
                  {chapterEstimate.plotOptions.map((option) => (
                    <div key={option.id} className="rounded-lg border border-border/60 p-3">
                      <p className="font-medium">{option.title}</p>
                      <p className="text-sm text-muted-foreground">{option.summary}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Mémoire récente</p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {chapterEstimate.contextPreview.recentChapters.map((chapter) => (
                      <p key={chapter.chapterNumber}>
                        #{chapter.chapterNumber} {chapter.title ?? "Sans titre"} · {chapter.summary ?? "Sans résumé"}
                      </p>
                    ))}
                    {chapterEstimate.contextPreview.retrievedDocs.slice(0, 2).map((doc, index) => (
                      <p key={`${doc.title}-${index}`}>{doc.title ?? "Document"} · {doc.content.slice(0, 140)}…</p>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

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
            {imageEstimate ? (
              <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-background/50 p-3 text-xs">{JSON.stringify(imageEstimate, null, 2)}</pre>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg">Pipeline chapitre</CardTitle>
            <CardDescription>Le job construit le contexte, génère outline/script/storyboard, puis met à jour la mémoire.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
            {jobState ? (
              <div className="space-y-2 rounded-lg border border-border/60 p-4">
                <p className="text-sm font-medium">Job {jobState.status}</p>
                {jobState.output?.steps?.map((step) => (
                  <div key={step.key} className="flex items-center justify-between text-sm">
                    <span>{step.label}</span>
                    <span className="text-muted-foreground">{step.status}</span>
                  </div>
                ))}
                {jobState.error?.message ? <p className="text-sm text-red-400">{jobState.error.message}</p> : null}
              </div>
            ) : null}
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
