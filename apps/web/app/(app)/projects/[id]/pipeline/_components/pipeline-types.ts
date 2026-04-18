/**
 * P5.5 — Types partagés de la page pipeline, extraits du monolithe pour
 * rester DRY entre la page et ses sous-composants / hooks.
 */

import type { ApprovedChapterOutline } from "@manga-ai-studio/core";

export const STEP_LABELS: Record<string, string> = {
  build_context: "Phase 1 — Analyse de l'univers et des personnages…",
  generate_bundle: "Phase 1 — Écriture du scénario et des dialogues…",
  continuity_pass: "Phase 1 — Vérification de la cohérence narrative…",
  story_coherence_pass: "Phase 1 — Peaufinage du rythme manga…",
  persist_chapter: "Phase 1 — Finalisation du chapitre écrit…",
  generate_images: "Phase 2 — Génération des images…",
  update_memory: "Phase 3 — Mise en page et mémorisation…",
};

export type CreativityControls = {
  noveltyLevel: number;
  worldStrictness: number;
  visualExoticism: number;
  npcVariety: number;
  environmentRichness: number;
};

export type OutlinePreviewBeat = {
  id: string;
  summary: string;
  characters: string[];
  location: string;
  pageRole: string;
  turn: string;
  emotionalDelta: number;
  structuredBeat?: ApprovedChapterOutline["beats"][number]["structuredBeat"];
};

export type PipelineJobState = {
  id: string;
  status: string;
  output?: {
    currentStep?: string;
    steps?: Array<{ key: string; label: string; status: string }>;
    operationalStatus?: string;
    degradedModes?: string[];
    generationDiagnostics?: {
      outline?: { fallbackReason?: string; usedFallback?: boolean } | null;
      dialogue?: { usedFallback?: boolean; fallbackSceneIds?: string[] } | null;
    };
  };
  error?: { message?: string };
} | null;

export type PipelinePreviewData = {
  estimatedTokens: number;
  plotOptions: Array<{ id: string; title: string; label: string; summary: string }>;
  creativeDirection: { chapterGoal: string; tone: string; whyNow: string };
  contextPreview: {
    characters: Array<{ name: string; roleType: string | null }>;
    arcs: Array<{ name: string; summary: string | null }>;
  };
  outlinePreview?: {
    summary: string;
    cliffhanger: string;
    approvalVersion: string;
    beats: OutlinePreviewBeat[];
  };
  creativityControls?: CreativityControls | null;
  productionOutline?: unknown;
  productionPlan?: unknown;
} | null;
