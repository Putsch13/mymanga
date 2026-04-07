"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Users, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { safeFetch } from "@/lib/safe-fetch";

const STEP_LABELS: Record<string, string> = {
  build_context: "Phase 1 — Analyse de l'univers et des personnages…",
  generate_bundle: "Phase 1 — Écriture du scénario et des dialogues…",
  continuity_pass: "Phase 1 — Vérification de la cohérence narrative…",
  story_coherence_pass: "Phase 1 — Peaufinage du rythme manga…",
  persist_chapter: "Phase 1 — Finalisation du chapitre écrit…",
  generate_images: "Phase 2 — Génération des images…",
  update_memory: "Phase 3 — Mise en page et mémorisation…",
};

export default function ChapterGeneratorPage() {
  const params = useParams();
  const router = useRouter();
  const autoReaderNavigatedRef = useRef(false);
  const id = params.id as string;
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
  const [startingPipeline, setStartingPipeline] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [userIntent, setUserIntent] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    estimatedTokens: number;
    plotOptions: Array<{ id: string; title: string; label: string; summary: string }>;
    creativeDirection: { chapterGoal: string; tone: string; whyNow: string };
    contextPreview: {
      characters: Array<{ name: string; roleType: string | null }>;
      arcs: Array<{ name: string; summary: string | null }>;
    };
    outlinePreview?: {
      summary: string;
      cliffhanger: string;
      beats: Array<{ summary: string; characters: string[]; location: string }>;
    };
  } | null>(null);

  const loadChapters = useCallback(() => {
    safeFetch<{ chapters: Array<{ id: string; title: string | null; chapterNumber: number }> }>(`/api/projects/${id}/chapters`)
      .then((res) => {
        if (!res.ok) {
          setPipelineMsg(res.error);
          return;
        }
        setChapters(res.data.chapters ?? []);
        if (res.data.chapters?.[0]) setSelectedChapter(res.data.chapters[0].id);
      });
  }, [id]);

  const loadCharacters = useCallback(() => {
    safeFetch<{ characters: Array<{ id: string; name: string; roleType: string | null }> }>(`/api/projects/${id}/characters`)
      .then((res) => {
        if (!res.ok) {
          setPipelineMsg(res.error);
          return;
        }
        const list = (res.data.characters ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          roleType: c.roleType,
        }));
        setCharacters(list);
        setSelectedCharacterIds((current) => {
          if (current.length > 0) return current.filter((v) => list.some((c) => c.id === v));
          return list.slice(0, 3).map((c) => c.id);
        });
      });
  }, [id]);

  useEffect(() => {
    loadChapters();
    loadCharacters();
  }, [loadCharacters, loadChapters]);

  useEffect(() => {
    autoReaderNavigatedRef.current = false;
  }, [selectedJobId]);

  useEffect(() => {
    if (!selectedJobId) return;
    let timeoutId: number;
    let delay = 2000;
    let stopped = false;

    async function poll() {
      if (stopped) return;
      try {
        const res = await fetch(`/api/jobs/${selectedJobId}`);
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            stopped = true;
            setPipelineMsg("Session expirée. Recharge la page.");
            return;
          }
          delay = Math.min(delay * 1.5, 15000);
          timeoutId = window.setTimeout(poll, delay);
          return;
        }
        const json = await res.json();
        setJobState(json.job);
        if (["completed", "failed", "partial_success", "canceled"].includes(json.job.status)) {
          stopped = true;
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
          return;
        }
        if (json.job.status === "running") {
          delay = Math.min(delay * 1.3, 12000);
        } else {
          delay = 2000;
        }
      } catch {
        delay = Math.min(delay * 2, 15000);
      }
      timeoutId = window.setTimeout(poll, delay);
    }

    timeoutId = window.setTimeout(poll, delay);
    return () => { stopped = true; window.clearTimeout(timeoutId); };
  }, [id, loadChapters, router, selectedChapter, selectedJobId]);

  const progressValue = (() => {
    const steps = jobState?.output?.steps ?? [];
    if (!steps.length) {
      if (!jobState) return null;
      if (jobState.status === "queued") return 2;
      if (jobState.status === "running") return 6;
      return null;
    }
    const weights: Record<string, number> = {
      build_context: 9, generate_bundle: 18, continuity_pass: 8,
      story_coherence_pass: 8, persist_chapter: 12, generate_anchors: 5,
      generate_images: 35, update_memory: 5,
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

  function toggleCharacter(characterId: string) {
    setSelectedCharacterIds((current) =>
      current.includes(characterId) ? current.filter((v) => v !== characterId) : [...current, characterId]
    );
  }

  function buildFocusedIntent() {
    const focusedNames = characters
      .filter((c) => selectedCharacterIds.includes(c.id))
      .map((c) => c.name);
    if (focusedNames.length === 0) return userIntent;
    return `Focus personnages: ${focusedNames.join(", ")}. ${userIntent}`;
  }

  async function fetchPreview() {
    setPreviewLoading(true);
    setPipelineMsg(null);
    try {
      const res = await fetch(`/api/projects/${id}/chapters/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIntent: buildFocusedIntent(),
          focusCharacterIds: selectedCharacterIds,
          selectedPlotLabel,
        }),
      });
      const j = await res.json();
      if (res.ok && j.plotOptions) {
        setPreviewData(j);
      } else {
        setPipelineMsg(j.message ?? "Impossible de prévisualiser le chapitre.");
      }
    } catch (e) {
      setPipelineMsg(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runPipeline() {
    if (!selectedChapter) return;
    setStartingPipeline(true);
    setPipelineMsg(null);
    try {
      const res = await fetch(`/api/projects/${id}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId: selectedChapter, focusCharacterIds: selectedCharacterIds, selectedPlotLabel }),
      });
      const j = await res.json();
      if (j.jobId) {
        setSelectedJobId(j.jobId);
        setJobState({ id: j.jobId, status: j.ok === false ? "failed" : "queued", output: { currentStep: "queued", steps: [] }, ...(j.ok === false ? { error: { message: j.message } } : {}) });
        if (!j.ok) setPipelineMsg(j.message ?? "Erreur de lancement.");
      } else if (!res.ok || j.ok === false) {
        setPipelineMsg(j.message ?? "Erreur de lancement.");
        setJobState(null);
      }
    } catch (e) {
      setPipelineMsg(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setStartingPipeline(false);
    }
  }

  async function createAndGenerate() {
    setCreatingDraft(true);
    setPipelineMsg(null);
    try {
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
      if (!j.chapter) {
        setPipelineMsg(j.message ?? "Impossible de créer le brouillon.");
        return;
      }
      setSelectedChapter(j.chapter.id);
      loadChapters();

      setStartingPipeline(true);
      const pRes = await fetch(`/api/projects/${id}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId: j.chapter.id, focusCharacterIds: selectedCharacterIds, selectedPlotLabel }),
      });
      const pJ = await pRes.json();
      if (pJ.jobId) {
        setSelectedJobId(pJ.jobId);
        setJobState({ id: pJ.jobId, status: "queued", output: { currentStep: "queued", steps: [] } });
      } else {
        setPipelineMsg(pJ.message ?? "Erreur de lancement.");
      }
    } catch (e) {
      setPipelineMsg(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setCreatingDraft(false);
      setStartingPipeline(false);
    }
  }

  const isGenerating = Boolean(jobState && ["queued", "running"].includes(jobState.status));
  const isDone = Boolean(jobState && ["completed", "partial_success"].includes(jobState.status));
  const isFailed = Boolean(jobState && jobState.status === "failed");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Mon projet
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Créer un chapitre</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Décris ce que tu veux dans ton chapitre, choisis tes personnages, et lance la génération.
        </p>
      </div>

      {/* Personnages */}
      <Card className="border-border/60 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Personnages
          </CardTitle>
          <CardDescription>Sélectionne ceux qui apparaissent dans ce chapitre.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {characters.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {characters.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant={selectedCharacterIds.includes(c.id) ? "default" : "outline"}
                  onClick={() => toggleCharacter(c.id)}
                >
                  {c.name}
                </Button>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Aucun personnage encore créé.{" "}
              <Link href={`/projects/${id}/characters/new`} className="text-primary underline">
                Crée ton premier personnage
              </Link>
            </div>
          )}
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/projects/${id}/characters/new`}>+ Nouveau personnage</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Intention du chapitre */}
      <Card className="border-border/60 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Raconte ton chapitre</CardTitle>
          <CardDescription>Décris ce qui se passe, les lieux, les événements, les rebondissements. Plus tu es précis, meilleur sera le résultat.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Titre du chapitre (optionnel)</Label>
            <Input
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
              placeholder={`Ex. : Chapitre ${chapters.length + 1} — Le prix du mensonge`}
            />
          </div>
          <div className="space-y-2">
            <Label>Ce qui se passe dans ce chapitre</Label>
            <Textarea
              rows={6}
              value={userIntent}
              onChange={(e) => setUserIntent(e.target.value)}
              placeholder="Ex. : Le héros arrive dans une taverne sombre à la recherche de son ancien mentor. Il découvre que celui-ci a été capturé par les gardes de la citadelle. Une confrontation éclate avec un groupe de mercenaires. Le chapitre se termine sur une révélation : le mentor connaissait le secret de la famille du héros."
            />
          </div>
          <div className="space-y-2">
            <Label>Rythme</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "safe" as const, label: "Progressif", desc: "Montée en douceur" },
                { value: "bold" as const, label: "Intense", desc: "Accélération émotionnelle" },
                { value: "shock" as const, label: "Explosif", desc: "Rebondissements forts" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedPlotLabel(opt.value)}
                  className={`rounded-xl border px-4 py-2 text-left transition ${
                    selectedPlotLabel === opt.value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 bg-card/30 text-muted-foreground hover:border-border"
                  }`}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs opacity-70">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview outline */}
      {previewData && !isGenerating && !isDone && (
        <Card className="border-violet-500/30 bg-violet-950/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ce que l&apos;IA va raconter</CardTitle>
            <CardDescription>Vérifie que les personnages et l&apos;intrigue correspondent à ce que tu veux avant de lancer la génération.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/40 bg-background/40 p-3">
              <p className="text-sm font-medium">{previewData.creativeDirection.chapterGoal}</p>
              <p className="mt-1 text-xs text-muted-foreground">{previewData.creativeDirection.whyNow}</p>
            </div>
            {previewData.outlinePreview ? (
              <div className="space-y-3 rounded-lg border border-border/40 bg-background/30 p-4">
                <div>
                  <p className="text-sm font-medium">Résumé proposé</p>
                  <p className="mt-1 text-sm text-muted-foreground">{previewData.outlinePreview.summary}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Cliffhanger</p>
                  <p className="mt-1 text-sm text-muted-foreground">{previewData.outlinePreview.cliffhanger}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Déroulé du chapitre</p>
                  {previewData.outlinePreview.beats.map((beat, index) => (
                    <div key={`${beat.summary}-${index}`} className="rounded-lg border border-border/40 bg-card/30 p-3 text-sm">
                      <p className="font-medium">Page {index + 1}</p>
                      <p className="mt-1 text-muted-foreground">{beat.summary}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {beat.characters.length > 0 ? `Personnages : ${beat.characters.join(", ")}` : "Personnages : à préciser"}{beat.location ? ` · Lieu : ${beat.location}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {previewData.plotOptions.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-3">
                {previewData.plotOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedPlotLabel(opt.label as "safe" | "bold" | "shock")}
                    className={`rounded-xl border p-3 text-left transition ${
                      selectedPlotLabel === opt.label ? "border-primary bg-primary/10" : "border-border/60 bg-card/30 hover:border-border"
                    }`}
                  >
                    <p className="text-sm font-medium">{opt.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{opt.summary}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Personnages impliqués : </span>
                {previewData.contextPreview.characters.map((c) => c.name).join(", ") || "aucun"}
              </div>
              {previewData.contextPreview.arcs.length > 0 && (
                <div>
                  <span className="font-medium text-foreground">Arcs en cours : </span>
                  {previewData.contextPreview.arcs.map((a) => a.name).join(", ")}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="lg"
                className="flex-1 text-base"
                onClick={chapters.length > 0 && selectedChapter ? runPipeline : createAndGenerate}
                disabled={creatingDraft || startingPipeline}
              >
                {creatingDraft || startingPipeline ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <BookOpen className="mr-2 h-5 w-5" />}
                Valider et générer
              </Button>
              <Button type="button" variant="outline" onClick={() => setPreviewData(null)}>
                Modifier
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bouton principal + suivi */}
      <div className="space-y-4">
        {!isGenerating && !isDone && !previewData && (
          <Button
            type="button"
            size="lg"
            className="w-full text-base"
            onClick={fetchPreview}
            disabled={previewLoading || !userIntent.trim()}
          >
            {previewLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <BookOpen className="mr-2 h-5 w-5" />}
            Prévisualiser le chapitre
          </Button>
        )}

        {chapters.length > 1 && !isGenerating && (
          <select
            className="flex h-10 w-full rounded-lg border border-border bg-background/80 px-3 text-sm"
            value={selectedChapter}
            onChange={(e) => setSelectedChapter(e.target.value)}
          >
            {chapters.slice().sort((a, b) => b.chapterNumber - a.chapterNumber).map((c) => (
              <option key={c.id} value={c.id}>
                Chapitre {c.chapterNumber}{c.title ? ` — ${c.title}` : ""}
              </option>
            ))}
          </select>
        )}

        {/* Progression */}
        {isGenerating && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-sm font-medium">Génération en cours…</p>
              </div>
              {typeof progressValue === "number" && (
                <div className="space-y-2">
                  <Progress value={progressValue} />
                  <p className="text-xs text-muted-foreground text-right">{progressValue}%</p>
                </div>
              )}
              {jobState?.output?.steps?.length ? (
                <div className="space-y-1.5">
                  {jobState.output.steps.map((step) => (
                    <div key={step.key} className="flex items-center justify-between text-sm">
                      <span>
                        {step.key === "generate_images" && step.status === "running"
                          ? step.label.replace("Génération images", "Phase 2 — Images")
                          : (STEP_LABELS[step.key] ?? step.label)}
                      </span>
                      <span className={step.status === "completed" ? "text-emerald-400" : step.status === "running" ? "text-primary" : "text-muted-foreground"}>
                        {step.status === "completed" ? "Fait" : step.status === "running" ? "En cours…" : "En attente"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {isDone && (
          <Card className="border-emerald-500/30 bg-emerald-950/20">
            <CardContent className="pt-6 text-center space-y-3">
              <p className="text-sm font-medium text-emerald-300">Chapitre prêt ! Redirection vers le lecteur…</p>
              <Button asChild>
                <Link href={`/projects/${id}/chapters/${selectedChapter}/read`}>Lire le chapitre</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isFailed && (
          <Card className="border-red-500/30 bg-red-950/20">
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm text-red-300">La génération a rencontré un problème.</p>
              {jobState?.error?.message && <p className="text-xs text-red-400">{jobState.error.message}</p>}
              <Button type="button" variant="outline" size="sm" onClick={runPipeline}>
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )}

        {pipelineMsg && !isGenerating && !isDone && (
          <p className="text-sm text-muted-foreground">{pipelineMsg}</p>
        )}
      </div>
    </div>
  );
}
