"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Palette, Users } from "lucide-react";
import { RENDERING_MODES } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const intensities = ["GENERAL_SAFE", "TEEN", "MATURE_DRAMA", "MATURE_VISUAL", "RESTRICTED_BLOCKED_VISUAL"] as const;

export default function ChapterGeneratorPage() {
  const params = useParams();
  const router = useRouter();
  const autoReaderNavigatedRef = useRef(false);
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
  const [characters, setCharacters] = useState<Array<{ id: string; name: string; roleType: string | null }>>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [selectedPlotLabel, setSelectedPlotLabel] = useState<"safe" | "bold" | "shock">("bold");
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<{
    id: string;
    status: string;
    output?: { currentStep?: string; steps?: Array<{ key: string; label: string; status: string }> };
    error?: { message?: string };
  } | null>(null);
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null);
  const [runningNow, setRunningNow] = useState(false);
  const [diag, setDiag] = useState<null | { hasFalKey: boolean; hasOpenAI: boolean; hasInngestEventKey: boolean; authDisabled: boolean }>(null);
  const [userIntent, setUserIntent] = useState("Faire monter la tension, révéler un secret et préparer une confrontation majeure.");
  const [chapterTitle, setChapterTitle] = useState("");
  const [projectIntensityLayer, setProjectIntensityLayer] = useState<string | null>(null);
  const [hasCharacters, setHasCharacters] = useState<boolean | null>(null);

  const loadChapters = useCallback(() => {
    fetch(`/api/projects/${id}/chapters`)
      .then((r) => r.json())
      .then((j) => {
        setChapters(j.chapters ?? []);
        if (j.chapters?.[0]) setSelectedChapter(j.chapters[0].id);
      });
  }, [id]);

  const loadCharacters = useCallback(() => {
    fetch(`/api/projects/${id}/characters`)
      .then((r) => r.json())
      .then((j) => {
        const nextCharacters = (j.characters ?? []).map((character: { id: string; name: string; roleType: string | null }) => ({
          id: character.id,
          name: character.name,
          roleType: character.roleType,
        }));
        setCharacters(nextCharacters);
        setHasCharacters(nextCharacters.length > 0);
        setSelectedCharacterIds((current) => {
          if (current.length > 0) return current.filter((value) => nextCharacters.some((character: { id: string }) => character.id === value));
          return nextCharacters.slice(0, 3).map((character: { id: string }) => character.id);
        });
      });
  }, [id]);

  useEffect(() => {
    loadChapters();
    loadCharacters();
  }, [loadCharacters, loadChapters]);

  useEffect(() => {
    fetch(`/api/projects/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.project?.intensityLayer) setProjectIntensityLayer(j.project.intensityLayer);
      })
      .catch(() => null);
  }, [id]);

  useEffect(() => {
    fetch("/api/diagnostics/public", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setDiag(j.env ?? null))
      .catch(() => setDiag(null));
  }, []);

  useEffect(() => {
    autoReaderNavigatedRef.current = false;
  }, [selectedJobId]);

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
        router.refresh();
        if (
          (json.job.status === "completed" || json.job.status === "partial_success") &&
          selectedChapter &&
          !autoReaderNavigatedRef.current
        ) {
          autoReaderNavigatedRef.current = true;
          window.setTimeout(() => {
            window.location.assign(`/projects/${id}/chapters/${selectedChapter}/read?fresh=1`);
          }, 500);
        }
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [id, loadChapters, router, selectedChapter, selectedJobId]);

  const progressValue = (() => {
    const steps = jobState?.output?.steps ?? [];
    if (!steps.length) return null;
    const weights: Record<string, number> = {
      build_context: 9,
      generate_bundle: 18,
      continuity_pass: 8,
      story_coherence_pass: 8,
      persist_chapter: 12,
      generate_images: 40,
      update_memory: 5,
    };
    const scoreFor = (status: string, weight: number) => {
      if (status === "completed") return weight;
      if (status === "running" || status === "waiting_external") return Math.max(1, Math.round(weight * 0.55));
      return 0;
    };
    const total = steps.reduce((acc, step) => acc + (weights[step.key] ?? 10), 0);
    const done = steps.reduce((acc, step) => acc + scoreFor(step.status, weights[step.key] ?? 10), 0);
    return Math.max(0, Math.min(100, Math.round((done / Math.max(total, 1)) * 100)));
  })();

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

  function toggleCharacter(characterId: string) {
    setSelectedCharacterIds((current) =>
      current.includes(characterId) ? current.filter((value) => value !== characterId) : [...current, characterId]
    );
  }

  function buildFocusedIntent() {
    const focusedNames = characters
      .filter((character) => selectedCharacterIds.includes(character.id))
      .map((character) => character.name);
    if (focusedNames.length === 0) return userIntent;
    return `Focus personnages: ${focusedNames.join(", ")}. ${userIntent}`;
  }

  async function runChapterEstimate() {
    const res = await fetch(`/api/projects/${id}/chapters/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userIntent: buildFocusedIntent(),
        focusCharacterIds: selectedCharacterIds,
        selectedPlotLabel,
      }),
    });
    const json = await res.json();
    setChapterEstimate(json);
  }

  async function createChapter() {
    const res = await fetch(`/api/projects/${id}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: chapterTitle || `Chapitre ${chapters.length + 1}`,
        userIntent: buildFocusedIntent(),
        focusCharacterIds: selectedCharacterIds,
        selectedPlotLabel,
      }),
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
      body: JSON.stringify({ chapterId: selectedChapter, focusCharacterIds: selectedCharacterIds, selectedPlotLabel }),
    });
    const j = await res.json();
    setPipelineMsg(j.message ?? JSON.stringify(j));
    if (j.jobId) {
      setSelectedJobId(j.jobId);
    }
  }

  async function runNow() {
    if (!selectedJobId) return;
    setRunningNow(true);
    try {
      const res = await fetch(`/api/jobs/${selectedJobId}/run-now`, { method: "POST" });
      const j = await res.json();
      setPipelineMsg(j.ok ? "Exécution immédiate lancée (sans Inngest)." : (j.error ?? j.message ?? "Échec run-now"));
    } finally {
      setRunningNow(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-[2rem] border border-border/60 bg-black/20 px-6 py-6">
        <Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Projet
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">Labo de génération</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Ici, on vise une sortie lisible comme un vrai manga : environ <strong>10 pages</strong> (4–6 cases/page), double passe de cohérence (canon + narration), et panels réellement générés.
        </p>
        {diag ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-border/60 px-3 py-1">AUTH {diag.authDisabled ? "OFFLINE/DEMO" : "LIVE"}</span>
            <span className="rounded-full border border-border/60 px-3 py-1">FAL {diag.hasFalKey ? "OK" : "MANQUANT"}</span>
            <span className="rounded-full border border-border/60 px-3 py-1">OPENAI {diag.hasOpenAI ? "OK" : "MANQUANT"}</span>
            <span className="rounded-full border border-border/60 px-3 py-1">INNGEST {diag.hasInngestEventKey ? "OK" : "OPTIONNEL"}</span>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-lg">0) Choisir le casting du chapitre</CardTitle>
              <CardDescription>
                Sélectionne les personnages à mettre au centre de la génération, puis ouvre leurs fiches pour régler physique, voix et personnalité.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <Link href={`/projects/${id}/characters`}>
                    <Users className="h-4 w-4" />
                    Gérer les personnages
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <Link href={`/projects/${id}/characters/new`}>
                    <Users className="h-4 w-4" />
                    Nouveau héros / méchant
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <Link href={`/projects/${id}/style`}>
                    <Palette className="h-4 w-4" />
                    Style manga
                  </Link>
                </Button>
              </div>
              {characters.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {characters.map((character) => (
                    <Button
                      key={character.id}
                      type="button"
                      size="sm"
                      variant={selectedCharacterIds.includes(character.id) ? "default" : "outline"}
                      onClick={() => toggleCharacter(character.id)}
                    >
                      {character.name}
                      {character.roleType ? ` · ${character.roleType}` : ""}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucun personnage encore créé. Commence par le héros et l&apos;antagoniste avant de générer un chapitre.
                </p>
              )}
              {selectedCharacterIds.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Focus actif :{" "}
                  {characters
                    .filter((character) => selectedCharacterIds.includes(character.id))
                    .map((character) => character.name)
                    .join(", ")}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-lg">1) Créer le brouillon</CardTitle>
              <CardDescription>Un titre + une intention + un focus casting. Le moteur partira de là.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Titre</Label>
                <Input
                  value={chapterTitle}
                  onChange={(e) => setChapterTitle(e.target.value)}
                  placeholder={`Ex. : Chapitre ${chapters.length + 1} — Le prix du mensonge`}
                />
              </div>
              <div className="space-y-2">
                <Label>Intention (ce que tu veux qu&apos;il se passe)</Label>
                <Textarea
                  rows={5}
                  value={userIntent}
                  onChange={(e) => setUserIntent(e.target.value)}
                  placeholder="Ex. : Confrontation dans un sanctuaire, révélation d&apos;un secret, et cliffhanger final."
                />
              </div>
              <div className="space-y-2">
                <Label>Cadence du chapitre</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "safe", title: "Progression logique" },
                    { label: "bold", title: "Accélération émotionnelle" },
                    { label: "shock", title: "Rupture dramatique" },
                  ].map((option) => (
                    <Button
                      key={option.label}
                      type="button"
                      size="sm"
                      variant={selectedPlotLabel === option.label ? "default" : "outline"}
                      onClick={() => setSelectedPlotLabel(option.label as "safe" | "bold" | "shock")}
                    >
                      {option.title}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={createChapter}>
                  Créer le brouillon
                </Button>
                <Button type="button" variant="outline" onClick={runChapterEstimate}>
                  Estimer (optionnel)
                </Button>
              </div>
              {chapterEstimate ? (
                <div className="rounded-lg border border-border/60 bg-background/30 p-4 text-sm">
                  <p className="font-medium">Estimation : {chapterEstimate.estimatedTokens} tokens</p>
                  <p className="mt-1 text-muted-foreground">{chapterEstimate.creativeDirection.whyNow}</p>
                  {chapterEstimate.plotOptions?.length ? (
                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                      {chapterEstimate.plotOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setSelectedPlotLabel(option.label as "safe" | "bold" | "shock")}
                          className={`rounded-lg border p-3 text-left transition ${
                            selectedPlotLabel === option.label
                              ? "border-violet-400 bg-violet-500/10"
                              : "border-border/60 bg-background/40 hover:border-border"
                          }`}
                        >
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">{option.label}</p>
                          <p className="mt-1 font-medium">{option.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{option.summary}</p>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                      <p className="font-medium text-foreground">Casting repris</p>
                      <p>{chapterEstimate.contextPreview.characters.map((character) => character.name).join(", ") || "aucun"}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                      <p className="font-medium text-foreground">Arcs détectés</p>
                      <p>{chapterEstimate.contextPreview.arcs.map((arc) => arc.name).join(", ") || "aucun"}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                      <p className="font-medium text-foreground">RAG utile</p>
                      <p>{chapterEstimate.contextPreview.retrievedDocs[0]?.title ?? "Pas de doc proche pour l’instant"}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-lg">2) Générer</CardTitle>
              <CardDescription>Le pipeline va créer les scènes, le storyboard et les images.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasCharacters === false && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-sm text-amber-300">
                  ⚠️ Aucun personnage créé sur ce projet. Les images générées seront génériques.{" "}
                  <Link href={`/projects/${id}/characters/new`} className="underline hover:text-amber-200">
                    Créer un personnage →
                  </Link>
                </div>
              )}
              {projectIntensityLayer && (
                <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Intensité projet :</span>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-primary">{projectIntensityLayer}</span>
                  <span className="opacity-60">— c&apos;est cette valeur qui est utilisée par le pipeline</span>
                </div>
              )}
              {chapters.length > 0 ? (
                <select
                  className="flex h-10 w-full rounded-lg border border-border bg-background/80 px-3 text-sm"
                  value={selectedChapter}
                  onChange={(e) => setSelectedChapter(e.target.value)}
                >
                  {chapters
                    .slice()
                    .sort((a, b) => (b.chapterNumber ?? 0) - (a.chapterNumber ?? 0))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.chapterNumber} {c.title}
                      </option>
                    ))}
                </select>
              ) : (
                <p className="text-muted-foreground text-sm">Crée un brouillon pour lancer la génération.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={runPipeline} disabled={!selectedChapter}>
                  Générer ce chapitre
                </Button>
                <Button type="button" variant="secondary" onClick={runNow} disabled={!selectedJobId || runningNow}>
                  {runningNow ? "Exécution…" : "Exécuter maintenant (sans Inngest)"}
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/projects/${id}/chapters`}>Aller lire →</Link>
                </Button>
              </div>
              {pipelineMsg ? <p className="text-sm text-muted-foreground">{pipelineMsg}</p> : null}
            </CardContent>
          </Card>

          <details className="rounded-lg border border-border/60 bg-card/30 p-4">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
              Avancé (debug / estimations image)
            </summary>
            <div className="mt-4 space-y-4">
              <Card className="border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle className="text-base">Estimation image</CardTitle>
                  <CardDescription>Zone debug optionnelle. Le flux principal doit rester simple.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
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
                    Cover photoreal
                  </label>
                  <Button type="button" variant="secondary" onClick={runEstimate}>
                    Estimer
                  </Button>
                  {imageEstimate ? (
                    <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-background/50 p-3 text-xs">
                      {JSON.stringify(imageEstimate, null, 2)}
                    </pre>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </details>
        </div>

        <div className="space-y-6">
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-lg">Suivi du job</CardTitle>
              <CardDescription>Si Inngest n&apos;est pas synchronisé, lance directement sans Inngest.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {jobState ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Statut : {jobState.status}</p>
                  {typeof progressValue === "number" ? (
                    <div className="space-y-2">
                      <Progress value={progressValue} />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{progressValue}%</span>
                        <span>
                          {progressValue >= 100 && jobState.status === "completed"
                            ? "Terminé — recharge automatique"
                            : "En cours…"}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {["queued", "running"].includes(jobState.status) ? (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-3">
                      <p className="text-xs text-amber-300">
                        Si tu as mis `INNGEST_EVENT_KEY` mais que l&apos;app Inngest n&apos;est pas synchronisée, le job peut rester bloqué.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-2"
                        onClick={runNow}
                        disabled={runningNow}
                      >
                        {runningNow ? "Exécution…" : "Exécuter maintenant (sans Inngest)"}
                      </Button>
                    </div>
                  ) : null}
                  {jobState.output?.steps?.length ? (
                    <div className="space-y-2 rounded-lg border border-border/60 p-3">
                      {jobState.output.steps.map((step) => (
                        <div key={step.key} className="flex items-center justify-between text-sm">
                          <span>{step.label}</span>
                          <span className="text-muted-foreground">{step.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {jobState.error?.message ? <p className="text-sm text-red-400">{jobState.error.message}</p> : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Lance une génération pour voir le suivi ici.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="text-base">Conseil rapide</CardTitle>
              <CardDescription>Si tu n&apos;as aucune image</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>- Vérifie que Render a bien `FAL_KEY` (exactement ce nom).</p>
              <p>- Si tu utilises Inngest, vérifie que ton app est synchronisée sur `/api/inngest`.</p>
              <p>- Sinon, clique sur <strong>Exécuter maintenant (sans Inngest)</strong>.</p>
            </CardContent>
          </Card>
        </div>
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
