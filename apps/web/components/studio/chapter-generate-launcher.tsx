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
}: {
  projectId: string;
  chapterId: string;
  initialStats?: { total: number; completed: number; failed: number; pending: number } | null;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
    setLaunching(true);
    setMessage(null);
    const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/launch`, {
      method: "POST",
    });
    const json = await res.json();
    setLaunching(false);
    setMessage(json.message ?? null);
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
      <Button data-testid="chapter-launch-button" onClick={() => void launch()} disabled={launching}>
        {launching ? "Lancement..." : "Lancer la génération"}
      </Button>
      {message ? <p data-testid="chapter-launch-message" className="text-sm text-muted-foreground">{message}</p> : null}
      <GenerationProgressBoard
        progress={progress}
        currentStep={job?.output?.currentStep ?? (job ? job.status : "ready")}
        stats={initialStats}
      />
    </div>
  );
}
