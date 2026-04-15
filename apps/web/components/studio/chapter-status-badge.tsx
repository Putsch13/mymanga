"use client";

import type { ChapterStudioStatus } from "@manga-ai-studio/core";
import { Badge } from "@/components/ui/badge";

const STYLES: Record<ChapterStudioStatus, string> = {
  DRAFT: "bg-slate-500/10 text-slate-200 border-slate-400/30",
  NARRATIVE_CONTRACT_READY: "bg-sky-500/10 text-sky-200 border-sky-400/30",
  CANON_READY: "bg-indigo-500/10 text-indigo-200 border-indigo-400/30",
  OUTLINE_EDITORIAL_READY: "bg-violet-500/10 text-violet-200 border-violet-400/30",
  OUTLINE_PRODUCTION_READY: "bg-purple-500/10 text-purple-200 border-purple-400/30",
  PRODUCTION_PLAN_READY: "bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-400/30",
  READY_FOR_GENERATION: "bg-emerald-500/10 text-emerald-200 border-emerald-400/30",
  GENERATING: "bg-amber-500/10 text-amber-200 border-amber-400/30",
  GENERATION_PARTIAL: "bg-orange-500/10 text-orange-200 border-orange-400/30",
  QA_REVIEW: "bg-cyan-500/10 text-cyan-200 border-cyan-400/30",
  NEEDS_FIXES: "bg-rose-500/10 text-rose-200 border-rose-400/30",
  COMPLETED: "bg-emerald-500/10 text-emerald-200 border-emerald-400/30",
  PUBLISHED: "bg-green-500/10 text-green-200 border-green-400/30",
};

const LABELS: Record<ChapterStudioStatus, string> = {
  DRAFT: "Brouillon",
  NARRATIVE_CONTRACT_READY: "Direction narrative prête",
  CANON_READY: "Canon prêt",
  OUTLINE_EDITORIAL_READY: "Outline éditorial prêt",
  OUTLINE_PRODUCTION_READY: "Outline production prêt",
  PRODUCTION_PLAN_READY: "Plan de production prêt",
  READY_FOR_GENERATION: "Prêt à générer",
  GENERATING: "Génération en cours",
  GENERATION_PARTIAL: "Chapitre incomplet",
  QA_REVIEW: "En attente de validation",
  NEEDS_FIXES: "Corrections requises",
  COMPLETED: "Terminé",
  PUBLISHED: "Publié",
};

export function ChapterStatusBadge({ status }: { status: ChapterStudioStatus }) {
  return <Badge variant="outline" className={STYLES[status]}>{LABELS[status]}</Badge>;
}
