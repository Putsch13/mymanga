"use client";

import type { ApprovedChapterOutline } from "@manga-ai-studio/core";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, HelpCircle, Loader2, Pencil, Users, BookOpen } from "lucide-react";
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

type CreativityControls = {
  noveltyLevel: number;
  worldStrictness: number;
  visualExoticism: number;
  npcVariety: number;
  environmentRichness: number;
};

type OutlinePreviewBeat = {
  id: string;
  summary: string;
  characters: string[];
  location: string;
  pageRole: string;
  turn: string;
  emotionalDelta: number;
  structuredBeat?: ApprovedChapterOutline["beats"][number]["structuredBeat"];
};

function Tooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        aria-label="Aide"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}

function SliderField({
  label,
  value,
  onChange,
  helper,
  tooltip,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  helper: string;
  tooltip?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label>{label}</Label>
          {tooltip && <Tooltip text={tooltip} />}
        </div>
        <span className="text-xs text-muted-foreground">{value}/100</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
      <p className="text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

export default function ChapterGeneratorPage() {
  const params = useParams();
  const router = useRouter();
  const autoReaderNavigatedRef = useRef(false);
  const id = params.id as string;
  const [chapters, setChapters] = useState<{ id: string; title: string | null; chapterNumber: number }[]>([]);
  const [characters, setCharacters] = useState<Array<{ id: string; name: string; roleType: string | null }>>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [selectedPlotLabel, setSelectedPlotLabel] = useState<"safe" | "bold" | "shock">("bold");
  const [creativityControls, setCreativityControls] = useState<CreativityControls>({
    noveltyLevel: 55,
    worldStrictness: 85,
    visualExoticism: 50,
    npcVariety: 60,
    environmentRichness: 78,
  });
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<{
    id: string;
    status: string;
    output?: {
      currentStep?: string;
      steps?: Array<{ key: string; label: string; status: string }>;
      operationalStatus?: string;
      degradedModes?: string[];
      generationDiagnostics?: {
        outline?: { fallbackReason?: string; usedFallback?: boolean } | null;
        dialogue?: { usedFallback?: boolean; fallbackSceneIds?: string[] } | null;
      };
    };
    error?: { message?: string };
  } | null>(null);
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null);
  const [premiumContractMissing, setPremiumContractMissing] = useState<string[] | null>(null);
  const [startingPipeline, setStartingPipeline] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [userIntent, setUserIntent] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editingBeatId, setEditingBeatId] = useState<string | null>(null);
  const [draftBeatValue, setDraftBeatValue] = useState("");
  const [beatSummaries, setBeatSummaries] = useState<Record<string, string>>({});
  const [planApproved, setPlanApproved] = useState(false);
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
      approvalVersion: string;
      beats: OutlinePreviewBeat[];
    };
    creativityControls?: CreativityControls | null;
    // Premium intelligence fields
    productionOutline?: unknown;
    productionPlan?: unknown;
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
  const selectedChapterRecord = chapters.find((chapter) => chapter.id === selectedChapter) ?? null;

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
          chapterId: selectedChapter || undefined,
          chapterNumber: selectedChapterRecord?.chapterNumber,
          userIntent: buildFocusedIntent(),
          focusCharacterIds: selectedCharacterIds,
          selectedPlotLabel,
          creativityControls,
        }),
      });
      const j = await res.json();
      if (res.ok && j.plotOptions) {
        setPreviewData({
          ...j,
          productionOutline: j.productionOutline ?? null,
          productionPlan: j.productionPlan ?? null,
        });
        const beats = Array.isArray(j.outlinePreview?.beats) ? (j.outlinePreview.beats as OutlinePreviewBeat[]) : [];
        setBeatSummaries(Object.fromEntries(beats.map((beat) => [beat.id, beat.summary])));
        setEditingBeatId(null);
        setDraftBeatValue("");
        setPlanApproved(false);
      } else {
        setPipelineMsg(j.message ?? "Impossible de prévisualiser le chapitre.");
      }
    } catch (e) {
      setPipelineMsg(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setPreviewLoading(false);
    }
  }

  function startBeatEdit(beat: OutlinePreviewBeat) {
    setEditingBeatId(beat.id);
    setDraftBeatValue(beatSummaries[beat.id] ?? beat.summary);
  }

  function applyBeatEdit(beatId: string) {
    setBeatSummaries((current) => ({ ...current, [beatId]: draftBeatValue.trim() || current[beatId] || draftBeatValue }));
    setEditingBeatId(null);
    setDraftBeatValue("");
    setPlanApproved(false);
  }

  function cancelBeatEdit() {
    setEditingBeatId(null);
    setDraftBeatValue("");
  }

  function buildApprovedOutlinePayload(): ApprovedChapterOutline | null {
    if (!previewData?.outlinePreview) return null;
    // Utilise les beats complets du productionOutline (le plan de chapitre complet est la source de vérité)
    const productionOutlineRecord = previewData.productionOutline as Record<string, unknown> | undefined;
    const fullBeats = (Array.isArray(productionOutlineRecord?.beats) ? productionOutlineRecord.beats : null) ?? previewData.outlinePreview.beats;
    return {
      summary: previewData.outlinePreview.summary,
      cliffhanger: previewData.outlinePreview.cliffhanger,
      beats: fullBeats.map((beat: Record<string, unknown>) => {
        const beatId = (beat.id ?? beat.beatId) as string;
        return {
          id: beatId,
          summary: beatSummaries[beatId] ?? (beat.summary as string),
          characters: (beat.characters ?? beat.involvedCharacters ?? []) as string[],
          location: (beat.location ?? (Array.isArray(beat.environmentContext) ? beat.environmentContext[0] : undefined) ?? "") as string,
          pageRole: (beat.pageRole ?? beat.narrativeFunction ?? "escalation") as string,
          turn: (beat.turn ?? beat.dramaticChange ?? "") as string,
          emotionalDelta: (beat.emotionalDelta ?? 0) as number,
          structuredBeat: (beat.structuredBeat ?? null) as never,
        };
      }),
      approvedAt: new Date().toISOString(),
      approvalVersion: previewData.outlinePreview.approvalVersion,
      source: "user_approved",
    };
  }

  async function saveApprovedOutline(chapterId: string) {
    const approvedOutline = buildApprovedOutlinePayload();
    if (!approvedOutline) {
      throw new Error("Aucun plan validable disponible.");
    }
    const res = await fetch(`/api/projects/${id}/chapters/${chapterId}/approved-outline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approvedOutline,
        // Persister le contrat premium complet si disponible
        productionOutline: previewData?.productionOutline ?? undefined,
        productionPlan: previewData?.productionPlan ?? undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message ?? data.error ?? "Impossible d'enregistrer le plan validé.");
    }
  }

  async function runPipeline() {
    if (!selectedChapter) return;
    if (!planApproved) {
      setPipelineMsg("Clique d\u2019abord sur \u00ab\u00a0Valider le plan\u00a0\u00bb pour confirmer le d\u00e9coupage propos\u00e9 par l\u2019IA.");
      return;
    }
    setStartingPipeline(true);
    setPipelineMsg(null);
    setPremiumContractMissing(null);
    try {
      await saveApprovedOutline(selectedChapter);
      const res = await fetch(`/api/projects/${id}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: selectedChapter,
          focusCharacterIds: selectedCharacterIds,
          selectedPlotLabel,
          creativityControls,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j.missing && Array.isArray(j.missing)) {
          setPremiumContractMissing(j.missing as string[]);
        } else {
          setPremiumContractMissing(null);
        }
        setPipelineMsg(
          (j as { error?: string }).error === "premium_contract_incomplete"
            ? "Le plan du chapitre est incomplet. Retourne dans le studio, étape 3 « Plan », génère l'outline et le plan de production, puis reviens ici."
            : (j as { message?: string }).message ?? (j as { error?: string }).error ?? "Erreur de lancement.",
        );
        setJobState(null);
        return;
      }
      if (j.jobId) {
        setPremiumContractMissing(null);
        setSelectedJobId(j.jobId);
        setJobState({
          id: j.jobId,
          status: j.ok === false ? "failed" : "queued",
          output: {
            currentStep: "queued",
            steps: [],
            operationalStatus: j.operationalStatus,
            degradedModes: j.degradedModes ?? [],
          },
          ...(j.ok === false ? { error: { message: j.message } } : {}),
        });
        if (!j.ok) {
          setPipelineMsg(
            (j as { error?: string }).error === "premium_contract_incomplete"
              ? "Le plan du chapitre est incomplet. Retourne dans le studio, étape 3 « Plan », génère l'outline et le plan de production, puis reviens ici."
              : (j as { message?: string }).message ?? (j as { error?: string }).error ?? "Erreur de lancement.",
          );
        }
      } else if (j.ok === false) {
        setPipelineMsg(
          (j as { error?: string }).error === "premium_contract_incomplete"
            ? "Le plan du chapitre est incomplet. Retourne dans le studio, étape 3 « Plan », génère l'outline et le plan de production, puis reviens ici."
            : (j as { message?: string }).message ?? (j as { error?: string }).error ?? "Erreur de lancement.",
        );
        setJobState(null);
      }
    } catch (e) {
      setPipelineMsg(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setStartingPipeline(false);
    }
  }

  async function createAndGenerate() {
    if (!planApproved) {
      setPipelineMsg("Clique d\u2019abord sur \u00ab\u00a0Valider le plan\u00a0\u00bb pour confirmer le d\u00e9coupage propos\u00e9 par l\u2019IA.");
      return;
    }
    setCreatingDraft(true);
    setPipelineMsg(null);
    try {
      const approvedOutline = buildApprovedOutlinePayload();
      const res = await fetch(`/api/projects/${id}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: chapterTitle || `Chapitre ${chapters.length + 1}`,
          userIntent: buildFocusedIntent(),
          focusCharacterIds: selectedCharacterIds,
          selectedPlotLabel,
          creativityControls,
          approvedOutline,
          studioDraft: previewData?.productionPlan ? {
            productionOutline: previewData.productionOutline,
            productionPlan: previewData.productionPlan,
          } : undefined,
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
        body: JSON.stringify({
          chapterId: j.chapter.id,
          focusCharacterIds: selectedCharacterIds,
          selectedPlotLabel,
          creativityControls,
        }),
      });
      const pJ = await pRes.json().catch(() => ({}));
      if (!pRes.ok) {
        setPipelineMsg(
          (pJ as { error?: string }).error === "premium_contract_incomplete"
            ? "Le plan du chapitre est incomplet. Retourne dans le studio, étape 3 « Plan », génère l'outline et le plan de production, puis reviens ici."
            : (pJ as { message?: string }).message ?? (pJ as { error?: string }).error ?? "Erreur de lancement.",
        );
        return;
      }
      if (pJ.jobId) {
        setSelectedJobId(pJ.jobId);
        setJobState({
          id: pJ.jobId,
          status: "queued",
          output: {
            currentStep: "queued",
            steps: [],
            operationalStatus: pJ.operationalStatus,
            degradedModes: pJ.degradedModes ?? [],
          },
        });
      } else {
        setPipelineMsg(
          (pJ as { error?: string }).error === "premium_contract_incomplete"
            ? "Le plan du chapitre est incomplet. Retourne dans le studio, étape 3 « Plan », génère l'outline et le plan de production, puis reviens ici."
            : (pJ as { message?: string }).message ?? (pJ as { error?: string }).error ?? "Erreur de lancement.",
        );
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
  const degradedModes = jobState?.output?.degradedModes ?? [];
  const degradedWarning =
    degradedModes.length > 0
      ? [
          `Mode dégradé actif: ${degradedModes.join(", ")}.`,
          jobState?.output?.generationDiagnostics?.outline?.usedFallback
            ? `Outline fallback: ${jobState.output.generationDiagnostics.outline.fallbackReason ?? "raison non précisée"}.`
            : null,
          jobState?.output?.generationDiagnostics?.dialogue?.usedFallback
            ? `Dialogue fallback sur ${jobState.output.generationDiagnostics.dialogue.fallbackSceneIds?.length ?? 0} scène(s).`
            : null,
        ]
          .filter(Boolean)
          .join(" ")
      : null;

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

      {/* Étapes du tunnel */}
      {!isGenerating && !isDone && (
        <div className="flex items-start gap-3 rounded-xl border border-border/40 bg-background/30 px-4 py-3 text-xs text-muted-foreground">
          <span className="mt-0.5 shrink-0 text-base">💡</span>
          <div className="space-y-0.5">
            <p className="font-medium text-foreground/70">Comment ça marche ?</p>
            <p><span className="font-medium text-foreground/60">1.</span> Remplis la description du chapitre et clique sur <strong className="text-foreground/60">Prévisualiser le chapitre</strong>.</p>
            <p><span className="font-medium text-foreground/60">2.</span> Vérifie le plan proposé par l&apos;IA, modifie si besoin, puis clique sur <strong className="text-foreground/60">Valider le plan</strong>.</p>
            <p><span className="font-medium text-foreground/60">3.</span> Clique sur <strong className="text-foreground/60">Lancer la génération</strong> — l&apos;IA écrit et illustre ton chapitre (5–10 min).</p>
          </div>
        </div>
      )}

      {/* Personnages */}
      <Card className="border-border/60 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Personnages
          </CardTitle>
          <CardDescription>
            Sélectionne ceux qui apparaissent dans ce chapitre.{" "}
            <span className="text-muted-foreground/70">Les personnages sélectionnés seront au cœur du scénario et des images. Si tu n&apos;en sélectionnes aucun, l&apos;IA choisit automatiquement.</span>
          </CardDescription>
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
            <div className="flex items-center gap-1.5">
              <Label>Titre du chapitre (optionnel)</Label>
              <Tooltip text="Si tu laisses vide, le titre sera &quot;Chapitre N&quot; par défaut. Tu pourras le modifier plus tard depuis la page du projet." />
            </div>
            <Input
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
              placeholder={`Ex. : Chapitre ${chapters.length + 1} — Le prix du mensonge`}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Ce qui se passe dans ce chapitre</Label>
              <Tooltip text="Décris l'histoire de ton chapitre librement : les lieux visités, les personnages impliqués, les tensions, les rebondissements, la fin. Pas besoin d'être précis — quelques phrases suffisent. L'IA construit le plan détaillé à partir de ta description." />
              <span className="text-xs text-rose-400">*requis</span>
            </div>
            <Textarea
              rows={6}
              value={userIntent}
              onChange={(e) => setUserIntent(e.target.value)}
              placeholder="Ex. : Le héros arrive dans une taverne sombre à la recherche de son ancien mentor. Il découvre que celui-ci a été capturé par les gardes de la citadelle. Une confrontation éclate avec un groupe de mercenaires. Le chapitre se termine sur une révélation : le mentor connaissait le secret de la famille du héros."
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Rythme du chapitre</Label>
              <Tooltip text="Contrôle la densité émotionnelle. &quot;Progressif&quot; = montée douce, bonne pour un chapitre de transition. &quot;Intense&quot; = accélération et tension, idéal pour la plupart des chapitres. &quot;Explosif&quot; = rebondissements forts et cliffhanger choc, parfait pour les fins d'arc." />
            </div>
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
          <div className="space-y-4 rounded-xl border border-border/60 bg-background/30 p-4">
            <div>
              <p className="text-sm font-medium">Réglages créatifs avancés</p>
              <p className="text-xs text-muted-foreground">
                Ces curseurs influencent le scénario, les personnages et les images générés.
              </p>
            </div>
            <SliderField
              label="Originalité"
              value={creativityControls.noveltyLevel}
              onChange={(value) => setCreativityControls((current) => ({ ...current, noveltyLevel: value }))}
              helper="Plus haut = l’IA propose des situations plus inattendues."
              tooltip="Contrôle la prise de risque narrative. À 0, l’IA suit des schémas classiques. À 100, elle invente des tournures surprenantes. Ex. : à 70, un combat peut se terminer par une trahison inattendue."
            />
            <SliderField
              label="Fidélité au lore"
              value={creativityControls.worldStrictness}
              onChange={(value) => setCreativityControls((current) => ({ ...current, worldStrictness: value }))}
              helper="Plus haut = l’IA reste strictement dans les règles de ton univers."
              tooltip="Détermine si l’IA peut s’écarter des règles de ton monde. À 100, rien ne contredira ton lore. À 30, elle peut inventer de nouveaux éléments cohérents."
            />
            <SliderField
              label="Exotisme visuel"
              value={creativityControls.visualExoticism}
              onChange={(value) => setCreativityControls((current) => ({ ...current, visualExoticism: value }))}
              helper="Plus haut = créatures, silhouettes et décors plus originaux dans les images."
              tooltip="Influence l’aspect des images générées. À 80, les personnages ont des looks uniques. À 20, les images restent dans un style manga sobre et classique."
            />
            <SliderField
              label="Diversité des PNJ"
              value={creativityControls.npcVariety}
              onChange={(value) => setCreativityControls((current) => ({ ...current, npcVariety: value }))}
              helper="Plus haut = plus de personnages secondaires différents dans le chapitre."
              tooltip="PNJ = personnages de fond (passants, gardes, marchands…). Un réglage élevé rend le monde plus vivant mais peut diluer l’attention sur tes personnages principaux."
            />
            <SliderField
              label="Richesse des décors"
              value={creativityControls.environmentRichness}
              onChange={(value) => setCreativityControls((current) => ({ ...current, environmentRichness: value }))}
              helper="Plus haut = arrière-plans plus détaillés et cohérents d’une case à l’autre."
              tooltip="Contrôle la densité des arrière-plans. À 90, chaque case montre un décor fouillé. À 30, l’IA privilégie les personnages et laisse les fonds simples."
            />
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
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">Bloc {index + 1}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {beat.pageRole} · delta {beat.emotionalDelta >= 0 ? `+${beat.emotionalDelta}` : beat.emotionalDelta}
                          </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => startBeatEdit(beat)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Modifier
                        </Button>
                      </div>
                      {editingBeatId === beat.id ? (
                        <div className="mt-3 space-y-2">
                          <Textarea rows={4} value={draftBeatValue} onChange={(e) => setDraftBeatValue(e.target.value)} />
                          <div className="flex gap-2">
                            <Button type="button" size="sm" onClick={() => applyBeatEdit(beat.id)}>
                              Appliquer
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={cancelBeatEdit}>
                              Annuler
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 text-muted-foreground">{beatSummaries[beat.id] ?? beat.summary}</p>
                      )}
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
                <span className="font-medium text-foreground">Contrôles moteur : </span>
                N {creativityControls.noveltyLevel} · W {creativityControls.worldStrictness} · X {creativityControls.visualExoticism} · PNJ {creativityControls.npcVariety} · Env {creativityControls.environmentRichness}
              </div>
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
            <div className={`rounded-lg border px-3 py-2 text-sm ${planApproved ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200" : "border-amber-500/30 bg-amber-950/20 text-amber-200"}`}>
              {planApproved
                ? "Aperçu éditorial validé. Le pipeline utilisera le contrat de production complet comme source de vérité."
                : "Étape obligatoire : valide l'aperçu éditorial avant de lancer la génération."}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={planApproved ? "outline" : "default"}
                size="lg"
                className="text-base"
                onClick={() => setPlanApproved(true)}
                disabled={previewData.outlinePreview?.beats.some((beat) => !(beatSummaries[beat.id] ?? beat.summary).trim())}
              >
                <Check className="mr-2 h-5 w-5" />
                Valider le plan
              </Button>
              <Button
                type="button"
                size="lg"
                className="flex-1 text-base"
                onClick={chapters.length > 0 && selectedChapter ? runPipeline : createAndGenerate}
                disabled={creatingDraft || startingPipeline || !planApproved}
              >
                {creatingDraft || startingPipeline ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <BookOpen className="mr-2 h-5 w-5" />}
                Lancer la génération
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPreviewData(null);
                  setPlanApproved(false);
                  setEditingBeatId(null);
                }}
              >
                Modifier
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bouton principal + suivi */}
      <div className="space-y-4">
        {!isGenerating && !isDone && !previewData && (
          <div className="space-y-2">
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
            {!userIntent.trim() && (
              <p className="text-center text-xs text-amber-400/80">
                ↑ Décris ce qui se passe dans ce chapitre pour continuer (champ &quot;Ce qui se passe dans ce chapitre&quot;)
              </p>
            )}
          </div>
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
              {degradedWarning ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                  {degradedWarning}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {isDone && (
          <Card className="border-emerald-500/30 bg-emerald-950/20">
            <CardContent className="pt-6 text-center space-y-3">
              <p className="text-sm font-medium text-emerald-300">Chapitre prêt ! Redirection vers le lecteur…</p>
              {degradedWarning ? <p className="text-xs text-amber-300">{degradedWarning}</p> : null}
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

        {premiumContractMissing && premiumContractMissing.length > 0 && !isGenerating && (
          <Card className="border-amber-500/40 bg-amber-950/20">
            <CardContent className="pt-5 space-y-3">
              <p className="text-sm font-semibold text-amber-300">Le découpage détaillé est incomplet</p>
              <p className="text-xs text-amber-400/80">Les éléments suivants sont manquants pour lancer la génération :</p>
              <ul className="list-disc list-inside text-xs text-amber-400 space-y-0.5">
                {premiumContractMissing.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
              <div className="flex gap-2 flex-wrap pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPremiumContractMissing(null);
                    setPipelineMsg(null);
                    setPreviewData(null);
                    setPlanApproved(false);
                  }}
                >
                  Régénérer le plan
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {pipelineMsg && !isGenerating && !isDone && !premiumContractMissing && (
          <p className="text-sm text-muted-foreground">{pipelineMsg}</p>
        )}
      </div>
    </div>
  );
}
