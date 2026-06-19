"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  premiumReadinessBlockedIssuesToFixRows,
  premiumReadinessDashboardBaseMessage,
  type LaunchFixRow,
} from "@/lib/studio/launch-readiness-fix-rows";
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
  error?: string | null;
  output?: {
    currentStep?: string;
    steps?: Array<{ key: string; status: string; label?: string }>;
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
  const [fixRows, setFixRows] = useState<LaunchFixRow[] | null>(null);
  const [launching, setLaunching] = useState(false);

  /** Reprendre un job Inngest déjà actif après refresh (P1.4). */
  useEffect(() => {
    let cancelled = false;
    async function hydrateActiveJob() {
      try {
        const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { activeJob?: { id?: string } | null };
        const id = data.activeJob?.id;
        if (typeof id === "string" && id.length > 0) {
          setJobId((prev) => prev ?? id);
        }
      } catch {
        /* ignore */
      }
    }
    void hydrateActiveJob();
    return () => {
      cancelled = true;
    };
  }, [projectId, chapterId]);

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
    setFixRows(null);
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
          setFixRows(null);
          setMessage(STUDIO_WRONG_ROUTE_USER_MESSAGE);
          setDetails(err.payload ?? null);
          return;
        }
        const payload = (err.payload ?? {}) as Record<string, unknown>;
        const code = typeof payload.code === "string" ? payload.code : null;
        const errorKey = typeof payload.error === "string" ? payload.error : null;
        if (code === "SHOT_MONOTONY") {
          setFixRows(null);
          const vs = typeof payload.varietyScore === "number" ? payload.varietyScore : null;
          const pct = vs !== null ? `${(vs * 100).toFixed(0)}%` : "trop basse";
          const missing = Array.isArray(payload.missingShots) && payload.missingShots.length > 0
            ? ` Plans manquants : ${(payload.missingShots as string[]).join(", ")}.`
            : "";
          setMessage(
            `⚠️ Variété de plans insuffisante (${pct}).${missing} Retourne dans le studio et régénère le plan pour diversifier les shots.`,
          );
        } else if (code === "INCOMPLETE_PLAN" || errorKey === "incomplete_plan") {
          setFixRows(null);
          const count = typeof payload.panelBlueprintCount === "number" ? payload.panelBlueprintCount : null;
          const minimum = typeof payload.minimumImages === "number" ? payload.minimumImages : null;
          const ratio = count !== null && minimum !== null ? `${count} blueprints pour un minimum de ${minimum}` : "un plan incomplet";
          setMessage(
            `Le plan validé côté studio est incomplet : ${ratio}. Retourne à l'étape Plan et clique sur « Régénérer le plan » avant de relancer la génération.`,
          );
        } else if (code === "premium_contract_incomplete" || errorKey === "premium_contract_incomplete") {
          setFixRows(null);
          const missing = Array.isArray(payload.missing) && payload.missing.length > 0
            ? (payload.missing as string[]).join(", ")
            : "éléments inconnus";
          setMessage(
            `Le contrat visuel est incomplet : ${missing}. Retourne dans le studio → étape Plan → Valider le plan avant de relancer.`,
          );
        } else if (code === "PREMIUM_VISUAL_QA_CONFIG_MISSING") {
          setFixRows(null);
          const missing = Array.isArray(payload.missing) && payload.missing.length > 0
            ? (payload.missing as string[]).join(", ")
            : "variables serveur";
          setMessage(
            `Configuration production incomplète pour la QA visuelle premium : ${missing}. ` +
              `Ajoute ces variables sur l'hébergeur (ex. Render), ou définis PREMIUM_VISUAL_QA_REQUIRED=false pour un mode dégradé (qualité needs_review).`,
          );
        } else if (code === "VISUAL_CONTRACT_PRELAUNCH_REQUIRED" || errorKey === "visual_contract_prelaunch_required") {
          setFixRows(null);
          setMessage(
            typeof payload.message === "string"
              ? payload.message
              : "Confirme le contrat visuel dans le studio (panneau violet en haut) avant le premier lancement.",
          );
        } else if (code === "PREMIUM_READINESS_DASHBOARD_BLOCKED") {
          const pr = payload.premiumReadiness as { issues?: Array<{ message?: string; severity?: string; fixAction?: { label: string; href: string } }> } | undefined;
          setMessage(premiumReadinessDashboardBaseMessage(payload.message));
          setFixRows(premiumReadinessBlockedIssuesToFixRows(pr?.issues));
        } else {
          setFixRows(null);
          setMessage(
            (typeof payload.message === "string" && payload.message)
            || (typeof payload.error === "string" && payload.error)
            || err.message
            || "Erreur inconnue lors du lancement.",
          );
        }
        setDetails(
          code === "PREMIUM_READINESS_DASHBOARD_BLOCKED"
            ? (payload.premiumReadiness ?? payload)
            : (payload.details ?? null),
        );
        return;
      }
      setFixRows(null);
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
    setFixRows(null);
    if (typeof json.jobId === "string") setJobId(json.jobId);
  }

  const jobErrorMessage =
    job?.status === "failed" || job?.status === "canceled"
      ? typeof job.error === "string"
        ? job.error
        : "Le job de génération a échoué. Consulte les logs ou relance depuis le studio."
      : null;

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
      {message ? (
        <p data-testid="chapter-launch-message" className="text-sm text-muted-foreground whitespace-pre-line">
          {message}
        </p>
      ) : null}
      {fixRows && fixRows.length > 0 ? (
        <ul className="list-none space-y-2 pl-0 text-sm text-muted-foreground" data-testid="chapter-launch-fix-rows">
          {fixRows.map((row, idx) => (
            <li key={`${row.message}-${idx}`} className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline">
              <span className="min-w-0 shrink">• {row.message}</span>
              {row.fixHref && row.fixLabel ? (
                <Link
                  href={row.fixHref}
                  className="shrink-0 text-sm font-medium text-primary underline underline-offset-4 hover:no-underline"
                >
                  {row.fixLabel}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {details && typeof details === "object" && "blockingIssues" in (details as Record<string, unknown>) ? (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {Array.isArray((details as Record<string, unknown>).blockingIssues)
            ? ((details as Record<string, unknown>).blockingIssues as string[]).map((issue) => <li key={issue}>- {issue}</li>)
            : null}
        </ul>
      ) : null}
      <GenerationProgressBoard
        projectId={projectId}
        chapterId={chapterId}
        initialStats={initialStats}
        job={job}
        jobErrorMessage={jobErrorMessage}
      />
    </div>
  );
}
