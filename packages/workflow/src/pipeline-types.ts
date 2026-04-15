export type PipelineContext = {
  jobId: string;
  chapterId: string;
  projectId: string;
  userId: string;
  chapterNumber: number;
};

export type PipelineNarrativeResult = {
  bundle: unknown;
  panelBlueprints: unknown[];
  plannedImages: Array<{
    sceneImageId: string;
    sceneIndex: number;
    baseMetadata: Record<string, unknown>;
  }>;
  continuityKernel: unknown;
  validatedSceneSnapshots: unknown[];
  notes: string[];
  usedFallback: boolean;
};

export type PipelineImageResult = {
  generatedCount: number;
  acceptedCount: number;
  failedCount: number;
  rerollCount: number;
  envCacheHits: number;
};

export type PipelineQAResult = {
  qualityReport: unknown;
  releaseScore: number;
  chapterScore: number;
  weakPanelCount: number;
  blocked: boolean;
};

export type PipelineMemoryResult = {
  continuityScore: number;
  canonStateId: string | null;
  memorySnapshotId: string | null;
  continuityIssueCount: number;
};
