"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Clock, ListChecks, Loader2, Lock, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { getStableImageUrl } from "@/lib/images/get-stable-image-url";
import { extractJobPipelineUserWarnings } from "@/lib/studio/job-output-warnings";

type PanelStatus = {
  id: string;
  panelNumber: number;
  sceneNumber: number;
  status: "pending" | "generating" | "completed" | "failed" | string;
  imageUrl?: string | null;
  persistedUrl?: string | null;
};

type ImageStats = {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  /** P1.4 — panels en cours de rendu image */
  generating?: number;
  /** Panels validés / verrouillés par l’utilisateur (`userValidatedAt`) */
  locked?: number;
  /** Au moins une relance automatique (`retryCount` > 0) */
  retried?: number;
};

export type GenerationProgressJobSnapshot = {
  status: string;
  output?: {
    currentStep?: string;
    steps?: Array<{ key: string; label?: string; status?: string; detail?: string }>;
    pipelineUserWarnings?: string[];
    degradedModes?: string[];
    warnings?: unknown[];
    continuityWarnings?: unknown;
    generationDiagnostics?: unknown;
  };
  error?: string | null;
};

const JOB_TERMINAL = new Set(["completed", "failed", "partial_success", "canceled"]);

function stepStatusByKey(steps: Array<{ key: string; status?: string }>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const s of steps) {
    m[s.key] = s.status ?? "queued";
  }
  return m;
}

/**
 * P1.4 — Checklist « produit » (parallèle aux étapes techniques Inngest).
 */
function deriveProductChecklist(input: {
  job: GenerationProgressJobSnapshot | null | undefined;
  jobRunning: boolean;
  jobTerminal: boolean;
  jobFailed: boolean;
  currentStep: string | null | undefined;
  statsCompleted: number;
  statsFailed: number;
  statsPending: number;
  statsGenerating: number;
  effectiveTotal: number;
}): Array<{ id: string; label: string; hint?: string; state: "pending" | "active" | "done" | "error" }> {
  const { job, jobRunning, jobTerminal, jobFailed, currentStep, statsCompleted, statsFailed, statsPending, statsGenerating, effectiveTotal } =
    input;
  const steps = job?.output?.steps ?? [];
  const sm = stepStatusByKey(steps);
  const prepKeys = new Set([
    "build_context",
    "generate_bundle",
    "continuity_pass",
    "persist_chapter",
    "story_coherence_pass",
    "shot_plan",
  ]);
  const prepSteps = steps.filter((s) => prepKeys.has(s.key));
  const gen = sm["generate_images"];
  const mem = sm["update_memory"];
  const prepDone =
    prepSteps.length > 0
      ? prepSteps.every((s) => sm[s.key] === "completed")
      : gen === "completed" || gen === "running" || mem === "completed" || jobTerminal;
  const prepFailed = prepSteps.some((s) => sm[s.key] === "failed");
  const prepActive =
    jobRunning
    && !prepFailed
    && !prepDone
    && (prepSteps.some((s) => sm[s.key] === "running") || (steps.length === 0 && !gen));

  const genDone = gen === "completed";
  const genFailed = gen === "failed";
  const genActive = gen === "running" || statsGenerating > 0;

  const hasRecovery = steps.some((s) => s.key === "recovery_pass");
  const rec = sm["recovery_pass"];
  const recDone = !hasRecovery ? genDone : rec === "completed";
  const recFailed = rec === "failed";
  const recActive = hasRecovery && rec === "running";

  const memDone = mem === "completed";
  const memFailed = mem === "failed";
  const memActive = mem === "running";

  const panelsSettled = statsPending === 0 && statsCompleted + statsFailed >= effectiveTotal && effectiveTotal > 0;
  const exportReady = jobTerminal && !jobFailed && panelsSettled && statsCompleted + statsFailed > 0;

  return [
    {
      id: "prep",
      label: "Préparation du job",
      hint: "Contexte, bundle narratif, continuité",
      state: prepFailed ? "error" : prepDone ? "done" : prepActive ? "active" : jobRunning ? "pending" : "pending",
    },
    {
      id: "panels",
      label: "Génération des panels",
      hint: "Rendu image (QA visuelle intégrée au pipeline)",
      state: genFailed ? "error" : genDone ? "done" : genActive ? "active" : prepDone && jobRunning ? "active" : prepDone ? "pending" : "pending",
    },
    {
      id: "fix",
      label: "Correction automatique",
      hint: "Récupération / panels en échec",
      state: recFailed ? "error" : recDone ? "done" : recActive ? "active" : genDone && hasRecovery ? "pending" : genDone ? "done" : "pending",
    },
    {
      id: "memory",
      label: "Mémoire & composition",
      hint: "Post-traitement, traces, persistance",
      state: memFailed ? "error" : memDone ? "done" : memActive ? "active" : recDone && jobRunning ? "active" : recDone ? "pending" : "pending",
    },
    {
      id: "reader",
      label: "Export lecteur",
      hint: "Chapitre lisible avec panels générés",
      state: jobFailed ? "error" : exportReady ? "done" : jobTerminal && !jobFailed && !exportReady && effectiveTotal > 0 ? "active" : "pending",
    },
    {
      id: "done",
      label: "Terminé",
      hint: currentStep ? `Dernier pas technique : ${currentStep}` : undefined,
      state: jobFailed ? "error" : jobTerminal && !jobFailed && exportReady ? "done" : jobTerminal && !jobFailed ? "active" : "pending",
    },
  ];
}

function phaseLabelForStepKey(key: string): string {
  if (key === "build_context" || key === "generate_bundle" || key === "continuity_pass" || key === "persist_chapter") {
    return "Préparation du job";
  }
  if (key === "story_coherence_pass" || key === "shot_plan") {
    return "Plan & cohérence";
  }
  if (key === "generate_images") {
    return "Génération des panels";
  }
  if (key === "recovery_pass") {
    return "Correction / récupération";
  }
  if (key === "update_memory") {
    return "Mémoire & fin de pipeline";
  }
  return key;
}

export function GenerationProgressBoard({
  projectId,
  chapterId,
  initialStats,
  stats,
  job,
  jobErrorMessage,
}: {
  projectId?: string;
  chapterId?: string;
  initialStats?: Partial<ImageStats> | null;
  /** @deprecated Utiliser initialStats — conservé pour compat launcher historique. */
  stats?: Partial<ImageStats> | null;
  job?: GenerationProgressJobSnapshot | null;
  jobErrorMessage?: string | null;
  title?: string;
  progress?: number;
  currentStep?: string | null;
}) {
  const mergedInitial = initialStats ?? stats ?? null;
  const jobRef = useRef(job);
  jobRef.current = job;

  const [panels, setPanels] = useState<PanelStatus[]>([]);
  const [imageStats, setImageStats] = useState<ImageStats | null>(null);
  const [chapterFetchError, setChapterFetchError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  /** Suivi actif du endpoint chapitre (images + imageStats). */
  const [chapterPollActive, setChapterPollActive] = useState(() => Boolean(projectId && chapterId));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(Date.now());
  const zeroPanelPollsRef = useRef(0);

  useEffect(() => {
    const track = Boolean(projectId && chapterId);
    setChapterPollActive(track);
    if (track) {
      startRef.current = Date.now();
      setElapsed(0);
      zeroPanelPollsRef.current = 0;
    }
  }, [projectId, chapterId]);

  const jobTerminal = job?.status ? JOB_TERMINAL.has(job.status) : false;
  const jobFailed = job?.status === "failed" || job?.status === "canceled";

  const completedPanels = useMemo(() => panels.filter((p) => p.status === "completed").length, [panels]);
  const failedPanels = useMemo(
    () => panels.filter((p) => p.status === "failed" || p.status === "blocked").length,
    [panels],
  );
  const pendingPanels = useMemo(
    () => panels.filter((p) => p.status === "pending" || p.status === "planned" || p.status === "generating").length,
    [panels],
  );

  const statsTotal = imageStats?.total ?? mergedInitial?.total ?? panels.length;
  const statsCompleted = imageStats?.completed ?? completedPanels;
  const statsFailed = imageStats?.failed ?? failedPanels;
  const statsPending = imageStats?.pending ?? pendingPanels;
  const statsGenerating =
    typeof imageStats?.generating === "number"
      ? imageStats.generating
      : panels.filter((p) => p.status === "generating").length;
  const statsLocked = imageStats?.locked ?? 0;
  const statsRetried = imageStats?.retried ?? 0;

  const effectiveTotal = Math.max(statsTotal || 0, panels.length);
  const progressPct =
    effectiveTotal > 0 ? Math.round(((statsCompleted + statsFailed) / effectiveTotal) * 100) : 0;

  const jobRunning = Boolean(job && !jobTerminal);

  const outcomePositive = statsCompleted + statsFailed > 0;

  const showEmptySuccessWarning =
    jobTerminal &&
    !jobFailed &&
    job?.status === "completed" &&
    effectiveTotal > 0 &&
    !outcomePositive &&
    zeroPanelPollsRef.current >= 6;

  const isWorking = Boolean(projectId && chapterId) && (chapterPollActive || jobRunning);

  useEffect(() => {
    if (!projectId || !chapterId || !chapterPollActive) return;

    async function poll() {
      try {
        const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setChapterFetchError(`HTTP ${res.status}`);
          return;
        }
        setChapterFetchError(null);
        const data = (await res.json()) as {
          chapter?: { scenes?: Array<{ sceneNumber: number; images?: PanelStatus[] }> };
          imageStats?: ImageStats;
        };

        if (data.imageStats) {
          setImageStats(data.imageStats);
        }

        const newPanels: PanelStatus[] = (data.chapter?.scenes ?? []).flatMap((scene) =>
          (scene.images ?? []).map((img) => ({
            ...img,
            sceneNumber: scene.sceneNumber,
          })),
        );
        setPanels(newPanels);

        const pendingDb = newPanels.filter(
          (p) => p.status === "pending" || p.status === "planned" || p.status === "generating",
        ).length;
        const settledDb =
          newPanels.length === 0 ||
          newPanels.every((p) => p.status === "completed" || p.status === "failed" || p.status === "blocked");

        const pending = data.imageStats?.pending ?? pendingDb;

        if (jobTerminal && jobFailed) {
          setChapterPollActive(false);
          return;
        }

        if (jobTerminal && !jobFailed) {
          const hasOutcome = data.imageStats
            ? data.imageStats.completed + data.imageStats.failed > 0
            : newPanels.some((p) => p.status === "completed" || p.status === "failed");
          const done = pending === 0 && settledDb && hasOutcome;
          if (done) {
            setChapterPollActive(false);
            return;
          }
          const planned = Math.max(data.imageStats?.total ?? 0, mergedInitial?.total ?? 0, newPanels.length);
          if (!hasOutcome && planned > 0) {
            zeroPanelPollsRef.current += 1;
          }
          return;
        }

        if (!jobRef.current && settledDb && newPanels.length > 0 && pendingDb === 0) {
          setChapterPollActive(false);
          return;
        }

        if (!jobRef.current && newPanels.length === 0 && (mergedInitial?.total ?? 0) === 0) {
          setChapterPollActive(false);
        }
      } catch {
        setChapterFetchError("Réseau");
      }
    }

    void poll();
    intervalRef.current = setInterval(() => void poll(), 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [projectId, chapterId, chapterPollActive, jobTerminal, jobFailed, mergedInitial?.total]);

  useEffect(() => {
    if (!chapterPollActive && !jobRunning) return;
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [chapterPollActive, jobRunning]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  const steps = job?.output?.steps ?? [];
  const pipelineWarnings = useMemo(() => extractJobPipelineUserWarnings(job?.output ?? null), [job?.output]);

  const productChecklist = useMemo(
    () =>
      deriveProductChecklist({
        job,
        jobRunning,
        jobTerminal,
        jobFailed,
        currentStep: job?.output?.currentStep ?? null,
        statsCompleted,
        statsFailed,
        statsPending,
        statsGenerating,
        effectiveTotal,
      }),
    [
      job,
      jobRunning,
      jobTerminal,
      jobFailed,
      statsCompleted,
      statsFailed,
      statsPending,
      statsGenerating,
      effectiveTotal,
    ],
  );

  return (
    <div className="space-y-6" data-testid="generation-progress-board">
      <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isWorking ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            )}
            <span className="text-sm font-medium">
              {showEmptySuccessWarning
                ? "Pipeline terminé — aucun panel enregistré"
                : isWorking
                  ? "Génération en cours…"
                  : jobFailed
                    ? "Génération arrêtée (erreur)"
                    : jobTerminal
                      ? "Génération terminée"
                      : "Prêt"}
            </span>
          </div>
          {elapsed > 0 && (
            <span className="font-mono text-xs text-muted-foreground">
              {mins}:{secs.toString().padStart(2, "0")}
            </span>
          )}
        </div>

        {(jobErrorMessage || job?.error) && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            {jobErrorMessage || String(job?.error ?? "")}
          </div>
        )}

        {showEmptySuccessWarning && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Le job est marqué terminé mais aucune image n&apos;apparaît encore côté chapitre. Vérifie les logs du job
              ou relance la génération.
            </span>
          </div>
        )}

        {chapterFetchError ? (
          <p className="mb-2 text-xs text-muted-foreground">Sync chapitre : {chapterFetchError}</p>
        ) : null}

        {job ? (
          <div
            className="mb-4 rounded-xl border border-border/50 bg-background/25 px-3 py-2.5"
            data-testid="generation-product-checklist"
          >
            <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5 shrink-0" />
              Parcours génération (vue produit)
            </p>
            <ul className="space-y-1.5">
              {productChecklist.map((row) => (
                <li key={row.id} className="flex items-start gap-2 text-[11px] leading-snug">
                  {row.state === "done" ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : row.state === "active" ? (
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
                  ) : row.state === "error" ? (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                  ) : (
                    <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/35" />
                  )}
                  <span>
                    <span className="font-medium text-foreground/90">{row.label}</span>
                    {row.hint ? <span className="mt-0.5 block text-muted-foreground">{row.hint}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {pipelineWarnings.length > 0 ? (
          <div
            className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
            data-testid="generation-job-warnings"
          >
            <div className="flex items-center gap-2 font-medium text-amber-200/95">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Avertissements pipeline (non bloquants)
            </div>
            <ul className="list-disc space-y-1 pl-4 text-[11px] leading-snug text-amber-50/95">
              {pipelineWarnings.slice(0, 24).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            {pipelineWarnings.length > 24 ? (
              <p className="text-[10px] text-amber-200/70">+ {pipelineWarnings.length - 24} autres (voir logs job)</p>
            ) : null}
          </div>
        ) : null}

        {steps.length > 0 ? (
          <div className="mb-4 rounded-xl border border-border/50 bg-background/30 p-3 text-xs">
            <p className="mb-2 font-medium text-muted-foreground">Étapes pipeline</p>
            <ul className="space-y-1.5">
              {steps.map((s, idx) => {
                const st = s.status ?? "queued";
                const ok = st === "completed";
                const bad = st === "failed";
                return (
                  <li key={`${s.key}-${idx}`} className="flex items-start gap-2">
                    {bad ? (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                    ) : ok ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    ) : (
                      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
                    )}
                    <span>
                      <span className="text-muted-foreground">{phaseLabelForStepKey(s.key)}</span>
                      {s.label ? <span className="text-foreground/80"> — {s.label}</span> : null}
                      {s.detail ? <span className="block text-[11px] text-muted-foreground">{s.detail}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            {job?.output?.currentStep ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Étape technique : <code className="rounded bg-muted px-1">{job.output.currentStep}</code>
              </p>
            ) : null}
          </div>
        ) : job && !JOB_TERMINAL.has(job.status) ? (
          <p className="mb-3 text-xs text-muted-foreground">Préparation du job… ({job.status})</p>
        ) : null}

        <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-rose-600 transition-all duration-500"
            style={{ width: `${Math.min(100, progressPct)}%` }}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-emerald-400">{statsCompleted}</span> générées
          </span>
          {statsFailed > 0 && (
            <span>
              <span className="font-medium text-red-400">{statsFailed}</span> échecs
            </span>
          )}
          <span>
            <span className="font-medium text-white/70">{statsPending}</span> en attente
          </span>
          <span>
            <span className="font-medium text-white/70">{effectiveTotal}</span> total
          </span>
          <span className="ml-auto font-medium text-accent">{progressPct}%</span>
        </div>

        {(statsGenerating > 0 || statsLocked > 0 || statsRetried > 0) && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
            {statsGenerating > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
                <span className="font-medium text-foreground/90">{statsGenerating}</span>
                en rendu image
              </span>
            ) : null}
            {statsLocked > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3 shrink-0 text-emerald-400/90" />
                <span className="font-medium text-foreground/90">{statsLocked}</span>
                verrouillé{statsLocked > 1 ? "s" : ""} (validés)
              </span>
            ) : null}
            {statsRetried > 0 ? (
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="h-3 w-3 shrink-0 text-amber-400/90" />
                <span className="font-medium text-foreground/90">{statsRetried}</span>
                relance{statsRetried > 1 ? "s" : ""} auto
              </span>
            ) : null}
          </div>
        )}

      </div>

      {panels.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {panels.map((panel) => (
            <div
              key={panel.id}
              className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border/60 bg-card/40"
            >
              {panel.status === "completed" && getStableImageUrl(panel) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getStableImageUrl(panel) ?? ""}
                  alt={`Panel ${panel.panelNumber}`}
                  className="h-full w-full object-cover"
                />
              ) : panel.status === "failed" || panel.status === "blocked" ? (
                <div className="flex h-full items-center justify-center">
                  <XCircle className="h-4 w-4 text-red-400" />
                </div>
              ) : panel.status === "generating" ? (
                <div className="panel-pulse flex h-full items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Clock className="h-3 w-3 text-muted-foreground/40" />
                </div>
              )}
              <div className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[8px] text-white/70">
                {panel.panelNumber}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isWorking && projectId && chapterId && (
        <div className="flex flex-wrap gap-3">
          <a
            href={`/projects/${projectId}/chapters/${chapterId}/read`}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/80"
          >
            <Sparkles className="h-4 w-4" />
            Lire le chapitre
          </a>
          {statsFailed > 0 && (
            <span className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground">
              {statsFailed} panel{statsFailed > 1 ? "s" : ""} en échec — relance la génération ou ouvre le studio
            </span>
          )}
        </div>
      )}
    </div>
  );
}
