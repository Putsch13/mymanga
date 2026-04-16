import { z } from "zod";

// ── Pipeline Context ──────────────────────────────────────────────────────────

export const pipelineContextSchema = z.object({
  jobId: z.string(),
  chapterId: z.string(),
  projectId: z.string(),
  userId: z.string(),
  chapterNumber: z.number(),
  pipelineVersion: z.enum(["v1", "v2"]).optional(),
});

export type PipelineContext = z.infer<typeof pipelineContextSchema>;

// ── Narrative Pass Result ─────────────────────────────────────────────────────

export const pipelineNarrativeResultSchema = z.object({
  bundle: z.unknown(),
  panelBlueprints: z.array(z.unknown()),
  plannedImages: z.array(z.object({
    sceneImageId: z.string(),
    sceneIndex: z.number(),
    baseMetadata: z.record(z.unknown()),
  })),
  continuityKernel: z.unknown(),
  validatedSceneSnapshots: z.array(z.unknown()),
  notes: z.array(z.string()),
  usedFallback: z.boolean(),
});

export type PipelineNarrativeResult = z.infer<typeof pipelineNarrativeResultSchema>;

// ── Image Generation Pass Result ──────────────────────────────────────────────

export const pipelineImageResultSchema = z.object({
  generatedCount: z.number(),
  acceptedCount: z.number(),
  failedCount: z.number(),
  rerollCount: z.number(),
  envCacheHits: z.number(),
});

export type PipelineImageResult = z.infer<typeof pipelineImageResultSchema>;

// ── QA Pass Result ────────────────────────────────────────────────────────────

export const pipelineQAResultSchema = z.object({
  qualityReport: z.unknown(),
  releaseScore: z.number(),
  chapterScore: z.number(),
  weakPanelCount: z.number(),
  blocked: z.boolean(),
});

export type PipelineQAResult = z.infer<typeof pipelineQAResultSchema>;

// ── Memory Pass Result ────────────────────────────────────────────────────────

export const pipelineMemoryResultSchema = z.object({
  continuityScore: z.number(),
  canonStateId: z.string().nullable(),
  memorySnapshotId: z.string().nullable(),
  continuityIssueCount: z.number(),
});

export type PipelineMemoryResult = z.infer<typeof pipelineMemoryResultSchema>;
