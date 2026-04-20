"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
    const res = await fetch(`/api/projects/${projectId}/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterId }),
    });
    const json = await res.json();
    setLaunching(false);

    // BUG-NOUVEAU-C : le backend peut renvoyer des 422 avec des codes structurés
    // (SHOT_MONOTONY, premium_contract_incomplete, INCOMPLETE_PLAN). Auparavant on
    // affichait juste json.message en texte brut, ce qui donnait des messages
    // techniques incompréhensibles. On rédige désormais un message actionnable pour
    // chaque code connu et on garde le fallback générique pour les autres erreurs.
    if (!res.ok) {
      const code = typeof json.code === "string" ? json.code : null;
      const errorKey = typeof json.error === "string" ? json.error : null;
      if (code === "SHOT_MONOTONY") {
        const pct = typeof json.varietyScore === "number"
          ? `${(json.varietyScore * 100).toFixed(0)}%`
          : "trop basse";
        const missing = Array.isArray(json.missingShots) && json.missingShots.length > 0
          ? ` Plans manquants : ${(json.missingShots as string[]).join(", ")}.`
          : "";
        setMessage(
          `⚠️ Variété de plans insuffisante (${pct}).${missing} Retourne dans le studio et régénère le plan pour diversifier les shots.`
        );
      } else if (code === "INCOMPLETE_PLAN" || errorKey === "incomplete_plan") {
        // P0.4 — plan de production sous le minimum de blueprints. Le studio
        // aurait dû bloquer avant l'appel, mais on sécurise côté launcher
        // pour les cas où le snapshot studio est stale ou partiellement
        // invalidé par une édition manuelle.
        const count = typeof json.panelBlueprintCount === "number" ? json.panelBlueprintCount : null;
        const minimum = typeof json.minimumImages === "number" ? json.minimumImages : null;
        const ratio = count !== null && minimum !== null ? `${count} blueprints pour un minimum de ${minimum}` : "un plan incomplet";
        setMessage(
          `Le plan validé côté studio est incomplet : ${ratio}. Retourne à l'étape Plan et clique sur « Régénérer le plan » avant de relancer la génération.`
        );
      } else if (code === "premium_contract_incomplete" || errorKey === "premium_contract_incomplete") {
        const missing = Array.isArray(json.missing) && json.missing.length > 0
          ? (json.missing as string[]).join(", ")
          : "éléments inconnus";
        setMessage(
          `Le contrat visuel est incomplet : ${missing}. Retourne dans le studio → étape Plan → Valider le plan avant de relancer.`
        );
      } else {
        setMessage(json.message ?? json.error ?? "Erreur inconnue lors du lancement.");
      }
      setDetails(json.details ?? null);
      return;
    }

    setMessage(json.message ?? null);
    setDetails(json.details ?? null);
    if (json.jobId) setJobId(json.jobId);
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
