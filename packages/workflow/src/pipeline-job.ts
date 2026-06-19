/**
 * Job progress and output helpers for the pipeline.
 * Extracted from run-full-chapter-pipeline.ts for reuse across passes.
 */
import { prisma, type Prisma } from "@manga-ai-studio/db";

export type JobStep = {
  key: string;
  label: string;
  status?: "queued" | "running" | "completed" | "failed";
  detail?: string;
};

export async function setJobProgress(jobId: string, step: JobStep, status: "running" | "completed" | "failed") {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  const output = (job.output as Record<string, unknown>) ?? {};
  const previousSteps = Array.isArray(output.steps) ? (output.steps as JobStep[]) : [];
  const nextSteps = [
    ...previousSteps.filter((existing) => existing.key !== step.key),
    { ...step, status },
  ];
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "running",
      startedAt: status === "running" ? (job.startedAt ?? new Date()) : job.startedAt,
      output: {
        ...output,
        currentStep: step.key,
        steps: nextSteps,
      },
    },
  });
}

export async function mergeJobOutput(jobId: string, patch: Record<string, unknown>) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  const output = (job.output as Record<string, unknown>) ?? {};
  await prisma.job.update({
    where: { id: jobId },
    data: {
      output: ({
        ...output,
        ...patch,
      } as unknown) as Prisma.InputJsonValue,
    },
  });
}
