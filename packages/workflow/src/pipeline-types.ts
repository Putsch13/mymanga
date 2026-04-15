export type PipelineContext = {
  jobId: string;
  chapterId: string;
  projectId: string;
  userId: string;
  chapterNumber: number;
};

export type PipelineBundle = {
  outline: unknown;
  script: unknown;
  scenes: unknown[];
};
