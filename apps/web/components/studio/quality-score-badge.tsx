"use client";

import { Badge } from "@/components/ui/badge";

export function QualityScoreBadge({ score }: { score: number | null | undefined }) {
  if (typeof score !== "number") {
    return <Badge variant="outline">QA n/a</Badge>;
  }

  const percent = Math.round(score * 100);
  const tone =
    percent >= 85
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : percent >= 70
        ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
        : "border-rose-400/30 bg-rose-500/10 text-rose-200";

  return <Badge variant="outline" className={tone}>QA {percent}%</Badge>;
}
