"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChapterLaunchRequestError,
  isWrongGenerationRouteError,
  launchChapterGeneration,
  STUDIO_WRONG_ROUTE_USER_MESSAGE,
} from "@/lib/studio/launch-chapter-generation";
import { GenerationProgressBoard } from "./generation-progress-board";

type JobState = {
  id: string;
  status: string;
  output?: {
    currentStep?: string;
    steps?: Array<{ key: string; status: string }>;
  };
};

export function ChapterGenerateLauncher({
  projectId,
  chapterId,
  initialStats,
  disabled,
  disabledMessage,
  stackBlockers,
}: {
  projectId: string;
  chapterId: string;
  initialStats?: { total: number; completed: number; failed: number; pending: number } | null;
  disabled?: boolean;
  disabledMessage?: string | null;
  stackBlockers?: string[];
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [details, setDetails] = useState<unknown>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let active = true;

    async function poll() {
      const res = await fetch(`/api/jobs/${jobId}`);
      const json = await res.json();
      if (!active) return;
      setJob(json.job);
      if (!["completed", "failed", "partial_success", "canceled"].includes(json.job.status)) {
        window.setTimeout(() => void poll(), 2500);
      }
    }

    void poll();
    return () => {
      active = false;
    };
  }, [jobId]);

  async function launch() {
    if (disabled) {
      setMessage(disabledMessage ?? "La génération est indisponible tant que les blocants ne sont pas levés.");
      return;
    }
    setLaunching(true);
    setMessage(null);
    setDetails(null);
    console.info("[studio:launch] clicked", {
      projectId,
      chapterId,
      route: `/api/projects/${projectId}/chapters/${chapterId}/launch`,
    });

    let json: Record<string, unknown>;
    try {
      json = (await launchChapterGeneration({ projectId, chapterId })) as Record<string, unknown>;
    } catch (err) {
      setLaunching(false);
      if (err instanceof ChapterLaunchRequestError) {
        console.info("[studio:launch] response", {
          projectId,
          chapterId,
          ok: false,
          status: err.status,
          jobId: err.payload?.jobId,
          error: err.payload?.error ?? err.payload?.code,
        });
        if (isWrongGenerationRouteError(err)) {
          console.error("[studio:generation] wrong_generation_route", {
            projectId,
            chapterId,
            error: err.payload?.error ?? err.message,
          });
          setMessage(STUDIO_WRONG_ROUTE_USER_MESSAGE);
          setDetails(err.payload ?? null);
          return;
        }
        const payload = (err.payload ?? {}) as Record<string, unknown>;
        const code = typeof payload.code === "string" ? payload.code : null;
        const errorKey = typeof payload.error === "string" ? payload.error : null;
        if (code === "SHOT_MONOTONY") {
          const vs = typeof payload.varietyScore === "number" ? payload.varietyScore : null;
          const pct = vs !== null ? `${(vs * 100).toFixed(0)}%` : "trop basse";
          const missing = Array.isArray(payload.missingShots) && payload.missingShots.length > 0
            ? ` Plans manquants : ${(payload.missingShots as string[]).join(", ")}.`
            : "";
          setMessage(
            `⚠️ Variété de plans insuffisante (${pct}).${missing} Retourne dans le studio et régénère le plan pour diversifier les shots.`,
          );
        } else if (code === "INCOMPLETE_PLAN" || errorKey === "incomplete_plan") {
          const count = typeof payload.panelBlueprintCount === "number" ? payload.panelBlueprintCount : null;
          const minimum = typeof payload.minimumImages === "number" ? payload.minimumImages : null;
          const ratio = count !== null && minimum !== null ? `${count} blueprints pour un minimum de ${minimum}` : "un plan incomplet";
          setMessage(
            `Le plan validé côté studio est incomplet : ${ratio}. Retourne à l'étape Plan et clique sur « Régénérer le plan » avant de relancer la génération.`,
          );
        } else if (code === "premium_contract_incomplete" || errorKey === "premium_contract_incomplete") {
          const missing = Array.isArray(payload.missing) && payload.missing.length > 0
            ? (payload.missing as string[]).join(", ")
            : "éléments inconnus";
          setMessage(
            `Le contrat visuel est incomplet : ${missing}. Retourne dans le studio → étape Plan → Valider le plan avant de relancer.`,
          );
        } else if (code === "PREMIUM_VISUAL_QA_CONFIG_MISSING") {
          const missing = Array.isArray(payload.missing) && payload.missing.length > 0
            ? (payload.missing as string[]).join(", ")
            : "variables serveur";
          setMessage(
            `Configuration production incomplète pour la QA visuelle premium : ${missing}. ` +
              `Ajoute ces variables sur l'hébergeur (ex. Render), ou définis PREMIUM_VISUAL_QA_REQUIRED=false pour un mode dégradé (qualité needs_review).`,
          );
        } else if (code === "VISUAL_CONTRACT_PRELAUNCH_REQUIRED" || errorKey === "visual_contract_prelaunch_required") {
          setMessage(
            typeof payload.message === "string"
              ? payload.message
              : "Confirme le contrat visuel dans le studio (panneau violet en haut) avant le premier lancement.",
          );
        } else {
          setMessage(
            (typeof payload.message === "string" && payload.message)
            || (typeof payload.error === "string" && payload.error)
            || err.message
            || "Erreur inconnue lors du lancement.",
          );
        }
        setDetails(payload.details ?? null);
        return;
      }
      setMessage(err instanceof Error ? err.message : "Erreur inconnue lors du lancement.");
      return;
    }

    setLaunching(false);
    console.info("[studio:launch] response", {
      projectId,
      chapterId,
      ok: true,
      jobId: json.jobId,
      error: json.error,
    });

    setMessage(typeof json.message === "string" ? json.message : null);
    setDetails(json.details ?? null);
    if (typeof json.jobId === "string") setJobId(json.jobId);
  }

  const steps = job?.output?.steps ?? [];
  const progress = steps.length > 0
    ? Math.round((steps.filter((step) => step.status === "completed").length / steps.length) * 100)
    : job
      ? job.status === "completed"
        ? 100
        : job.status === "running"
          ? 40
          : 5
      : 0;

  return (
    <div className="space-y-6">
      <Button data-testid="chapter-launch-button" onClick={() => void launch()} disabled={launching || disabled}>
        {launching ? "Lancement..." : "Lancer la génération"}
      </Button>
      {disabledMessage ? (
        <p className="text-sm text-muted-foreground">{disabledMessage}</p>
      ) : null}
      {stackBlockers && stackBlockers.length > 0 ? (
        <ul className="space-y-1 text-sm text-amber-500">
          {stackBlockers.map((blocker) => (
            <li key={blocker}>- {blocker}</li>
          ))}
        </ul>
      ) : null}
      {message ? <p data-testid="chapter-launch-message" className="text-sm text-muted-foreground">{message}</p> : null}
      {details && typeof details === "object" && "blockingIssues" in (details as Record<string, unknown>) ? (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {Array.isArray((details as Record<string, unknown>).blockingIssues)
            ? ((details as Record<string, unknown>).blockingIssues as string[]).map((issue) => <li key={issue}>- {issue}</li>)
            : null}
        </ul>
      ) : null}
      <GenerationProgressBoard
        progress={progress}
        currentStep={job?.output?.currentStep ?? (job ? job.status : "ready")}
        stats={initialStats}
      />
    </div>
  );
}
