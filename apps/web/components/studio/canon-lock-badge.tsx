"use client";

import type { CanonLockStrength } from "@manga-ai-studio/core";
import { Badge } from "@/components/ui/badge";

const LOCK_TONE: Record<CanonLockStrength, string> = {
  HARD_LOCK: "border-rose-400/30 bg-rose-500/10 text-rose-200",
  STRONG: "border-orange-400/30 bg-orange-500/10 text-orange-200",
  MEDIUM: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  LIGHT: "border-sky-400/30 bg-sky-500/10 text-sky-200",
  NONE: "border-slate-400/30 bg-slate-500/10 text-slate-200",
};

const LOCK_LABELS: Record<CanonLockStrength, string> = {
  HARD_LOCK: "Verrouillé",
  STRONG: "Fort",
  MEDIUM: "Moyen",
  LIGHT: "Léger",
  NONE: "Libre",
};

export function CanonLockBadge({ strength }: { strength: CanonLockStrength }) {
  return <Badge variant="outline" className={LOCK_TONE[strength]}>{LOCK_LABELS[strength]}</Badge>;
}
