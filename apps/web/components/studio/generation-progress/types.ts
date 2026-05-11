/**
 * Types partagés du board de progression génération chapitre.
 */
import type { SceneImageStatus } from "@manga-ai-studio/core";

export type PanelStatus = {
  id: string;
  panelNumber: number;
  sceneNumber: number;
  status: SceneImageStatus | string;
  imageUrl?: string | null;
  persistedUrl?: string | null;
};

export type ImageStats = {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  /** P1.4 — panels en cours de rendu image */
  generating?: number;
  /** Panels validés / verrouillés par l'utilisateur (`userValidatedAt`). */
  locked?: number;
  /** Au moins une relance automatique (`retryCount` > 0). */
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

export const JOB_TERMINAL = new Set([
  "completed",
  "failed",
  "partial_success",
  "canceled",
]);

export type ChecklistRow = {
  id: string;
  label: string;
  hint?: string;
  state: "pending" | "active" | "done" | "error";
};
