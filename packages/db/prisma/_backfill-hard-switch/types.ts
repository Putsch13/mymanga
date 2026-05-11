/**
 * Types partagés du backfill « hard switch ».
 *
 * Ces types décrivent les options CLI, le résumé par phase et l'état
 * persistant utilisé pour reprendre une exécution interrompue.
 */
export type PhaseName =
  | "media-assets"
  | "character-locks"
  | "scene-keyframes"
  | "fal-traces";

export type CliOptions = {
  dryRun: boolean;
  limit: number | null;
  onlyProject: string | null;
  stateFile: string;
  resume: boolean;
  reconcile: boolean;
  phases: PhaseName[] | null;
};

export type PhaseSummary = {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  wouldCreate: number;
  wouldUpdate: number;
  warnings: number;
  errors: number;
};

export type BackfillState = {
  version: 1;
  updatedAt: string;
  options: {
    onlyProject: string | null;
    limit: number | null;
  };
  phases: Record<
    PhaseName,
    {
      lastCursor: string | null;
      completed: boolean;
      summary: PhaseSummary;
    }
  >;
};

export const STATE_VERSION = 1;
export const DEFAULT_BATCH_SIZE = 50;
